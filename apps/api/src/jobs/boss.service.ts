import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PgBoss } from "pg-boss";
import { env } from "../env.js";

// Schema propio de pg-boss, creado por la migración 0016 (no por pg-boss:
// crear schemas es DDL y la DDL vive en migraciones, ADR-013). Por eso
// `createSchema: false` — pero `migrate: true`, porque las TABLAS de la cola
// sí son suyas y cambian con cada versión de la librería.
const PGBOSS_SCHEMA = "pgboss";

// Pool propio de pg-boss, aparte del de la app (db/client.ts). Chico a
// propósito: en dev todo esto viaja por un túnel SSH y la cola no necesita
// concurrencia — un pase de reconciliación por minuto no llena 4 conexiones.
const PGBOSS_POOL_SIZE = 4;

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
    await this.boss.start();
    console.info(`[jobs] pg-boss listo (schema ${PGBOSS_SCHEMA})`);
  }

  async onModuleDestroy(): Promise<void> {
    // `graceful` deja terminar el job en vuelo antes de cerrar — un pase de
    // reconciliación a medias dejaría unas cards escritas y otras no.
    await this.boss.stop({ graceful: true, close: true });
  }

  /**
   * Deja una cola registrada, su worker escuchando y su cron agendado. El
   * `schedule` de pg-boss es idempotente por nombre de cola: reiniciar el
   * proceso no duplica el agendado ni pierde el anterior.
   */
  async registerRecurring(job: RecurringJob): Promise<void> {
    await this.boss.createQueue(job.queue, {
      // `singleton`: como mucho un job activo por cola. Con un cron por
      // minuto y un pase que puede tardar más de un minuto, esto es lo que
      // evita dos pases pisándose (y sustituye al advisory lock que haría
      // falta con un setInterval en el proceso web).
      policy: "singleton",
      retryLimit: job.retryLimit ?? 0,
    });
    await this.boss.work(job.queue, async () => {
      await job.handler();
    });
    await this.boss.schedule(job.queue, job.cron, null, job.tz ? { tz: job.tz } : undefined);
    console.info(`[jobs] ${job.queue} agendado (${job.cron})`);
  }
}
