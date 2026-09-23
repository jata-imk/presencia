import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PgBoss } from "pg-boss";
import { env } from "../env.js";
import { enProcesoWorker } from "./process-role.js";

// Schema propio de pg-boss, creado por la migración 0016 (no por pg-boss:
// crear schemas es DDL y la DDL vive en migraciones, ADR-013). Por eso
// `createSchema: false` — pero `migrate: true`, porque las TABLAS de la cola
// sí son suyas y cambian con cada versión de la librería. Que esa migración
// no truene depende de conectar con el dueño del schema (ver el constructor).
const PGBOSS_SCHEMA = "pgboss";

// Pool propio de pg-boss, aparte del de la app (db/client.ts). Chico a
// propósito: en dev todo esto viaja por un túnel SSH y la cola no necesita
// concurrencia — un pase de reconciliación por minuto no llena 4 conexiones.
const PGBOSS_POOL_SIZE = 4;

// `exclusive`: como mucho UN job de esta cola existiendo a la vez, encolado o
// activo. Es la semántica que quiere un barrido periódico — si el pase de las
// 10:00 sigue corriendo a las 10:01, el tick de las 10:01 se descarta en vez
// de esperar turno. Equivale a que un pg_try_advisory_lock no consiga el lock
// y se salte la corrida.
//
// `singleton` NO sirve acá y es la trampa fácil: solo limita los jobs
// ACTIVOS, así que los ticks se van acumulando en `created` mientras el pase
// largo corre, y al terminar se ejecutan todos seguidos.
const RECURRING_QUEUE_POLICY = "exclusive";

// `short`: como mucho un job por `singletonKey` ESPERANDO. Diez usuarios del
// mismo nicho abriendo Ritmo a la vez dejan un solo trabajo encolado, que es
// la misma palanca de sublinealidad por la que la caché no se llavea por
// usuario (ADR-023).
//
// Dos cosas verificadas en dev el 2026-09-20, ninguna obvia desde la
// documentación:
//
// - `standard` + `singletonKey` NO deduplica. La opción se acepta sin
//   quejarse y los jobs se encolan todos igual: cuatro requests dejaron
//   cuatro jobs. El filtro lo hace la POLICY, no la opción suelta.
// - `stately` sí deduplica, pero acota por estado, así que un job en estado
//   terminal conserva la llave. No es lo que se quiere acá: un fallo dejaría
//   la tupla sin poder reintentar hasta que pg-boss archive.
//
// Que quede uno esperando mientras otro corre es aceptable porque el handler
// es idempotente: `refrescarSiHaceFalta` no vuelve a buscar si la tanda ya
// está vigente.
const ON_DEMAND_QUEUE_POLICY = "short";

/**
 * Cola de trabajos puntuales: los encola alguien (un request) y los ejecuta el
 * worker. A diferencia de una recurrente, acá no hay cron.
 *
 * La policy es `short` y no `exclusive` porque el filtro de duplicados es por
 * TRABAJO, no por cola: dos tuplas distintas sí pueden buscarse a la vez, dos
 * veces la misma no. Eso lo resuelve `singletonKey` al encolar, y el bloque de
 * arriba explica por qué `short` y no las otras dos que sí deduplican.
 */
export interface OnDemandJob<T> {
  queue: string;
  retryLimit?: number;
  expireInSeconds: number;
  handler: (data: T) => Promise<void>;
}

export interface RecurringJob {
  /** Nombre de la cola. Convención: `<dominio>.<acción>`, p.ej. `cards.reconcile`. */
  queue: string;
  /** Expresión cron estándar de 5 campos, en UTC salvo que se pase `tz`. */
  cron: string;
  tz?: string;
  /**
   * Reintentos del job. Un job periódico normalmente quiere 0: el reintento
   * es el tick siguiente, y reintentar de inmediato solo duplica la carga
   * contra lo que sea que acaba de fallar.
   */
  retryLimit?: number;
  /**
   * Cuánto puede correr el handler antes de que pg-boss dé el job por perdido.
   * **Obligatorio a propósito**: el default de la librería son 15 minutos, y no
   * es una cota inofensiva — al expirar marca el job `failed` con el handler
   * todavía corriendo, y como `exclusive` solo cuenta los jobs en
   * `created`/`active`, el slot queda libre y el tick siguiente puede arrancar
   * un SEGUNDO pase concurrente sobre los mismos datos. Que no tenga default
   * obliga a cada job a declarar su techo.
   */
  expireInSeconds: number;
  handler: () => Promise<void>;
}

/**
 * Runtime de pg-boss (ADR-008). Una sola instancia por proceso: la comparten
 * el worker propiamente dicho (`worker.ts`) y, en dev, el proceso de la API
 * cuando `WORKER_INLINE` está encendido.
 */
@Injectable()
export class BossService implements OnModuleInit, OnModuleDestroy {
  /** Colas cuyo `createQueue` ya corrió en este proceso. */
  private readonly colasListas = new Set<string>();

  private readonly boss: PgBoss;
  /** Si el arranque falló, no hay cola: registrar o parar no tienen sentido. */
  private started = false;

  constructor() {
    this.boss = new PgBoss({
      // presencia_jobs, NO presencia_app: pg-boss migra sus propias tablas al
      // arrancar y eso exige ser su dueño (migración 0020). Es el mismo rol en
      // dev (inline en la API) y en prod (contenedor worker), así que quien
      // crea las tablas es siempre quien las usa.
      connectionString: env.JOBS_DATABASE_URL,
      schema: PGBOSS_SCHEMA,
      createSchema: false,
      migrate: true,
      max: PGBOSS_POOL_SIZE,
      // Sale en pg_stat_activity: distingue las conexiones de la cola de las
      // de la app cuando algo se queda colgado.
      application_name: "presencia-jobs",
    });
    // pg-boss avisa por eventos, no por excepciones: sin esto un fallo de
    // mantenimiento o de la cola se pierde en silencio (y `error` sin
    // listener en un EventEmitter tumba el proceso).
    this.boss.on("error", (error: unknown) => console.error("[jobs] pg-boss:", error));
    this.boss.on("warning", (warning: unknown) => console.warn("[jobs] pg-boss:", warning));
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.boss.start();
      this.started = true;
      console.info(`[jobs] pg-boss listo (schema ${PGBOSS_SCHEMA})`);
    } catch (error) {
      // En el worker esto es fatal: no tiene otra razón de existir, y quedarse
      // vivo sin cola sería un contenedor que se reporta sano sin hacer nada.
      if (enProcesoWorker()) throw error;
      // Inline, no: el módulo de jobs cuelga de AppModule, así que relanzar
      // abortaría NestFactory.create y la API entera se negaría a levantar. El
      // caso real es `pnpm dev` con el túnel al VPS todavía abajo. Sin cola, el
      // disparador perezoso de las cards sigue cubriendo.
      console.error("[jobs] pg-boss no arrancó. La API sigue, SIN cola:", error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    // Sin condicionar a `started`: `start()` abre su pool y corre la migración
    // ANTES de poder fallar, así que un arranque roto a la mitad deja
    // conexiones y timers vivos. Saltarse el stop ahí hacía que Ctrl+C ya no
    // cerrara el proceso — justo en el escenario para el que se toleró el
    // fallo.
    // `graceful` deja terminar el job en vuelo antes de cerrar — un pase de
    // reconciliación a medias dejaría unas cards escritas y otras no.
    try {
      await this.boss.stop({ graceful: true, close: true });
    } catch (error) {
      console.error("[jobs] pg-boss no cerró limpio:", error);
    }
  }

  /**
   * Deja una cola registrada, su worker escuchando y su cron agendado. El
   * `schedule` de pg-boss es idempotente por nombre de cola: reiniciar el
   * proceso no duplica el agendado ni pierde el anterior.
   */
  async registerRecurring(job: RecurringJob): Promise<void> {
    if (!this.started) {
      console.error(`[jobs] ${job.queue} no se agendó: pg-boss no arrancó.`);
      return;
    }
    const retryLimit = job.retryLimit ?? 0;
    const { expireInSeconds } = job;

    await this.boss.createQueue(job.queue, {
      policy: RECURRING_QUEUE_POLICY,
      retryLimit,
      expireInSeconds,
    });
    // createQueue es un INSERT ... ON CONFLICT DO NOTHING: si la cola ya
    // existe, las opciones de arriba se ignoran EN SILENCIO. Sin este
    // updateQueue, cambiar `retryLimit` en el código no tendría efecto nunca
    // en una base donde la cola ya se creó una vez.
    await this.boss.updateQueue(job.queue, { retryLimit, expireInSeconds });

    // La policy es lo único que updateQueue NO puede cambiar (su tipo la
    // excluye), y es justo la que decide si dos pases se pisan. Si diverge,
    // hay que avisar fuerte: el arreglo es manual (deleteQueue + recrear, o
    // un UPDATE sobre pgboss.queue), y en silencio se vería como "el cron se
    // porta raro".
    const existing = await this.boss.getQueue(job.queue);
    if (existing && existing.policy !== RECURRING_QUEUE_POLICY) {
      console.error(
        `[jobs] ${job.queue} existe con policy "${existing.policy}" y el código pide ` +
          `"${RECURRING_QUEUE_POLICY}". createQueue no la cambia: hay que recrear la cola.`,
      );
    }

    await this.boss.work(job.queue, async () => {
      await job.handler();
    });
    await this.boss.schedule(job.queue, job.cron, null, job.tz ? { tz: job.tz } : undefined);
    console.info(`[jobs] ${job.queue} agendado (${job.cron})`);
  }

  /**
   * Deja una cola de trabajos puntuales lista y su worker escuchando.
   *
   * Lo llama el proceso que EJECUTA (el worker). Quien encola usa `enqueue`,
   * que puede vivir en otro proceso.
   */
  async registerOnDemand<T>(job: OnDemandJob<T>): Promise<void> {
    if (!this.started) {
      console.error(`[jobs] ${job.queue} no quedó escuchando: pg-boss no arrancó.`);
      return;
    }
    const retryLimit = job.retryLimit ?? 0;
    const { expireInSeconds } = job;
    await this.boss.createQueue(job.queue, {
      policy: ON_DEMAND_QUEUE_POLICY,
      retryLimit,
      expireInSeconds,
    });
    await this.boss.updateQueue(job.queue, { retryLimit, expireInSeconds });
    // La policy es lo único que updateQueue no puede cambiar, y acá es
    // justamente la que decide si el filtro de duplicados existe. En silencio
    // se vería como "el nicho se busca de más".
    const existente = await this.boss.getQueue(job.queue);
    if (existente && existente.policy !== ON_DEMAND_QUEUE_POLICY) {
      console.error(
        `[jobs] ${job.queue} existe con policy "${existente.policy}" y el código pide ` +
          `"${ON_DEMAND_QUEUE_POLICY}". createQueue no la cambia: hay que recrear la cola.`,
      );
    }
    await this.boss.work<T>(job.queue, async ([trabajo]) => {
      if (trabajo) await job.handler(trabajo.data);
    });
    this.colasListas.add(job.queue);
    console.info(`[jobs] ${job.queue} escuchando`);
  }

  /**
   * Encola un trabajo puntual, descartándolo si ya hay uno igual pendiente.
   *
   * El filtro lo hace la POLICY de la cola (`short`), no la opción suelta:
   * `singletonKey` sobre una cola `standard` se acepta sin quejarse y encola
   * todo igual.
   *
   * `short` acota a un job por llave **en estado `created`**, y esa precisión
   * importa: un job que ya está corriendo NO bloquea que se encole otro. Por
   * eso el handler tiene que ser idempotente por su cuenta
   * (`refrescarSiHaceFalta`), y por eso no alcanza con esta cola para sostener
   * la palanca de sublinealidad de ADR-023.
   *
   * Devuelve `false` si no se encoló (por duplicado o porque la cola no está).
   * Nunca lanza: esto se llama desde un request de lectura, y no poder encolar
   * un refresco no puede tumbar la pantalla.
   */
  async enqueue<T extends object>(
    queue: string,
    data: T,
    options: { singletonKey: string; expireInSeconds: number },
  ): Promise<boolean> {
    if (!this.started) return false;
    try {
      // La cola puede no existir todavía en ESTE proceso: quien encola es la
      // API y quien la registra es el worker. `createQueue` es idempotente
      // (INSERT ... ON CONFLICT DO NOTHING) y se hace una sola vez por proceso.
      if (!this.colasListas.has(queue)) {
        // Con los MISMOS ajustes que `registerOnDemand`, no solo la policy:
        // en una base recién creada, quien gana la carrera puede ser la API, y
        // entonces la cola nacía con el `retryLimit` por default de pg-boss
        // (2). Hasta que el worker arrancara y corriera su `updateQueue`, una
        // búsqueda con grounding que fallara se reintentaba dos veces — tres
        // llamadas pagadas por una sola semilla.
        await this.boss.createQueue(queue, {
          policy: ON_DEMAND_QUEUE_POLICY,
          retryLimit: 0,
          expireInSeconds: options.expireInSeconds,
        });
        this.colasListas.add(queue);
      }
      const id = await this.boss.send(queue, data, {
        singletonKey: options.singletonKey,
        expireInSeconds: options.expireInSeconds,
      });
      return id !== null;
    } catch (error) {
      console.error(`[jobs] no se pudo encolar ${queue}:`, error);
      return false;
    }
  }
}
