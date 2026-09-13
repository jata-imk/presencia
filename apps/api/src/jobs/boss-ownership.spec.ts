import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// La decisión de la migración 0020 (addendum ADR-008), probada contra la base
// real: pg-boss arranca conectado como presencia_jobs, sus migraciones internas
// no chocan con la propiedad de las tablas, y lo que crea queda a nombre de
// ese rol.
//
// En CI la base está recién migrada y pg-boss nunca arrancó, así que este spec
// ejercita exactamente el camino de prod: una base nueva donde las tablas nacen
// al primer `start()`. El otro camino —una base existente con las tablas a
// nombre de presencia_app, que la migración reasigna— es el de dev, y se
// verifica a mano al aplicar 0020 (docs/how-to/levantar-entorno.md).

let jobsClient: pg.Client;
let appClient: pg.Client;

describe("pg-boss conecta como dueño de su schema", () => {
  beforeAll(async () => {
    try {
      process.loadEnvFile("../../.env");
    } catch {
      // sin .env: en CI las variables llegan por entorno
    }

    // Marcar el proceso como worker ANTES de importar BossService: en la API
    // un fallo de `start()` se registra y se traga (la API sigue sin cola), y
    // este test pasaría en verde con la cola rota. Como worker, relanza.
    const { marcarProcesoWorker } = await import("./process-role.js");
    marcarProcesoWorker();
    const { BossService } = await import("./boss.service.js");

    const boss = new BossService();
    try {
      await boss.onModuleInit();
    } finally {
      await boss.onModuleDestroy();
    }

    jobsClient = new pg.Client({ connectionString: process.env.JOBS_DATABASE_URL });
    appClient = new pg.Client({ connectionString: process.env.APP_DATABASE_URL });
    await Promise.all([jobsClient.connect(), appClient.connect()]);
  }, 60_000);

  afterAll(async () => {
    await Promise.all([jobsClient?.end(), appClient?.end()]);
  });

  it("deja la tabla de jobs creada, para que el resto no pase por vacío", async () => {
    const { rows } = await jobsClient.query<{ exists: boolean }>(
      "SELECT to_regclass('pgboss.job') IS NOT NULL AS exists",
    );
    expect(rows[0]?.exists).toBe(true);
  });

  it("todo lo que vive en pgboss es de presencia_jobs", async () => {
    const { rows } = await jobsClient.query<{ kind: string; name: string; owner: string }>(`
      SELECT 'relation' AS kind, c.relname AS name, pg_get_userbyid(c.relowner) AS owner
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'pgboss'
        AND c.relkind IN ('r', 'p', 'S', 'v', 'm')
        AND pg_get_userbyid(c.relowner) <> 'presencia_jobs'
      UNION ALL
      SELECT 'function', p.proname, pg_get_userbyid(p.proowner)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'pgboss'
        AND pg_get_userbyid(p.proowner) <> 'presencia_jobs'
      UNION ALL
      SELECT 'schema', n.nspname, pg_get_userbyid(n.nspowner)
      FROM pg_namespace n
      WHERE n.nspname = 'pgboss'
        AND pg_get_userbyid(n.nspowner) <> 'presencia_jobs'
    `);
    // Si falla, la lista dice qué objeto quedó con otro dueño: ese es el que
    // va a tumbar el arranque del worker en el próximo upgrade de pg-boss.
    expect(rows).toEqual([]);
  });

  it("presencia_app ya no ve la cola", async () => {
    await expect(appClient.query("SELECT 1 FROM pgboss.job LIMIT 1")).rejects.toMatchObject({
      // insufficient_privilege
      code: "42501",
    });
  });
});
