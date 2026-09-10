import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PgBoss } from "pg-boss";
import { env } from "../env.js";
import { enProcesoWorker } from "./process-role.js";

// Schema propio de pg-boss, creado por la migración 0016 (no por pg-boss:
// crear schemas es DDL y la DDL vive en migraciones, ADR-013). Por eso
// `createSchema: false` — pero `migrate: true`, porque las TABLAS de la cola
// sí son suyas y cambian con cada versión de la librería.
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
  private readonly boss: PgBoss;
  /** Si el arranque falló, no hay cola: registrar o parar no tienen sentido. */
  private started = false;

  constructor() {
    this.boss = new PgBoss({
      connectionString: env.APP_DATABASE_URL,
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
}
