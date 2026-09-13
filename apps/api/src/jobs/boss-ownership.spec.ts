import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// La decisión de la migración 0020 (addendum ADR-008), probada contra la base
// real en los DOS estados en que la encuentra un entorno:
//
//   · prod: base nueva, pg-boss nunca arrancó. Las tablas nacen al primer
//     `start()`, conectado como presencia_jobs.
//   · dev: base anterior a 0020, con la cola ya creada a nombre de
//     presencia_app. La migración tiene que reasignarla entera.
//
// El segundo caso no se puede dejar a la verificación manual: la primera
// versión de 0020 se saltaba todas las PARTICIONES (Postgres registra su
// vínculo con el padre como dependencia `deptype = 'a'`, igual que una
// secuencia de columna), y CI no lo veía porque en una base nueva el bucle no
// tiene nada que reasignar. Por eso acá se reproduce el estado de dev y se
// vuelve a aplicar la migración — que está escrita para ser idempotente.

const OWNER = "presencia_jobs";

// Todo objeto de pgboss cuyo dueño no sea presencia_jobs. Vacío = bien. Si no,
// la lista dice cuál quedó atrás: ese es el que va a tumbar el arranque del
// worker en el próximo upgrade de pg-boss.
const FOREIGN_OWNED = `
  SELECT 'relation' AS kind, c.relname AS name, pg_get_userbyid(c.relowner) AS owner
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'pgboss'
    AND c.relkind IN ('r', 'p', 'S', 'v', 'm')
    AND pg_get_userbyid(c.relowner) <> '${OWNER}'
  UNION ALL
  SELECT 'function', p.proname, pg_get_userbyid(p.proowner)
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'pgboss'
    AND pg_get_userbyid(p.proowner) <> '${OWNER}'
  UNION ALL
  SELECT 'type', t.typname, pg_get_userbyid(t.typowner)
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'pgboss'
    AND t.typtype IN ('e', 'd')
    AND pg_get_userbyid(t.typowner) <> '${OWNER}'
  UNION ALL
  SELECT 'schema', n.nspname, pg_get_userbyid(n.nspowner)
  FROM pg_namespace n
  WHERE n.nspname = 'pgboss'
    AND pg_get_userbyid(n.nspowner) <> '${OWNER}'
`;

/** Las sentencias de la migración, separadas como las separa drizzle-kit. */
function migrationStatements(): string[] {
  // vitest corre con cwd en apps/api (mismo supuesto que el loadEnvFile).
  const sql = readFileSync(path.resolve("drizzle/0020_pgboss_owner.sql"), "utf-8");
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

let ownerClient: pg.Client;
let jobsClient: pg.Client;
let appClient: pg.Client;

beforeAll(async () => {
  try {
    process.loadEnvFile("../../.env");
  } catch {
    // sin .env: en CI las variables llegan por entorno
  }

  // Marcar el proceso como worker ANTES de importar BossService: en la API un
  // fallo de `start()` se registra y se traga (la API sigue sin cola), y este
  // test pasaría en verde con la cola rota. Como worker, relanza.
  const { marcarProcesoWorker } = await import("./process-role.js");
  marcarProcesoWorker();
  const { BossService } = await import("./boss.service.js");

  const boss = new BossService();
  try {
    await boss.onModuleInit();
  } finally {
    await boss.onModuleDestroy();
  }

  ownerClient = new pg.Client({ connectionString: process.env.DATABASE_URL });
  jobsClient = new pg.Client({ connectionString: process.env.JOBS_DATABASE_URL });
  appClient = new pg.Client({ connectionString: process.env.APP_DATABASE_URL });
  await Promise.all([ownerClient.connect(), jobsClient.connect(), appClient.connect()]);
}, 60_000);

afterAll(async () => {
  await Promise.all([ownerClient?.end(), jobsClient?.end(), appClient?.end()]);
});

describe("pg-boss arranca como dueño de su schema (camino de prod)", () => {
  it("deja la tabla de jobs y al menos una partición, para que nada pase por vacío", async () => {
    const { rows } = await jobsClient.query<{ job: boolean; partitions: number }>(`
      SELECT
        to_regclass('pgboss.job') IS NOT NULL AS job,
        (SELECT count(*)::int
           FROM pg_inherits i
           JOIN pg_class c ON c.oid = i.inhrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'pgboss') AS partitions
    `);
    expect(rows[0]?.job).toBe(true);
    // Sin particiones, el test de abajo no probaría el caso que ya se rompió una vez.
    expect(rows[0]?.partitions).toBeGreaterThan(0);
  });

  it("todo lo que vive en pgboss es de presencia_jobs", async () => {
    const { rows } = await jobsClient.query(FOREIGN_OWNED);
    expect(rows).toEqual([]);
  });

  it("presencia_app no ve la cola", async () => {
    await expect(appClient.query("SELECT 1 FROM pgboss.job LIMIT 1")).rejects.toMatchObject({
      code: "42501", // insufficient_privilege
    });
  });
});

describe("0020 sobre una base de dev anterior a la migración", () => {
  // Todo este bloque corre dentro de UNA transacción que termina en ROLLBACK.
  // El spec apunta a la base real —en dev, la del VPS por túnel— y reproducir
  // el estado previo a 0020 le quita la cola a presencia_jobs: si algo fallara
  // a la mitad y eso quedara commiteado, el siguiente `pnpm dev` arrancaría sin
  // cola y en silencio (la API se traga el fallo de pg-boss). Sin COMMIT, la
  // base termina igual que como empezó pase lo que pase, y si la conexión se
  // cae Postgres deshace solo. Los locks de los ALTER ... OWNER duran lo que
  // dura el bloque, milisegundos.
  beforeAll(async () => {
    await ownerClient.query("BEGIN");

    // El estado de dev: la cola entera a nombre de presencia_app, que era quien
    // arrancaba pg-boss dentro de la API. REASSIGN OWNED mueve todo lo que es de
    // presencia_jobs, y ese rol solo es dueño de cosas en pgboss.
    await ownerClient.query("REASSIGN OWNED BY presencia_jobs TO presencia_app");

    const { rows } = await ownerClient.query(FOREIGN_OWNED);
    // Precondición: si esto no movió nada, el re-aplicado de abajo no prueba nada.
    expect(rows.length).toBeGreaterThan(0);

    for (const statement of migrationStatements()) {
      await ownerClient.query(statement);
    }
  }, 30_000);

  afterAll(async () => {
    await ownerClient?.query("ROLLBACK");
  });

  it("reasigna todo, particiones incluidas", async () => {
    const { rows } = await ownerClient.query(FOREIGN_OWNED);
    expect(rows).toEqual([]);
  });

  // Este test NO prueba la propiedad: el REVOKE de USAGE sobre el schema corta
  // el acceso aunque presencia_app siguiera siendo dueño de alguna tabla (así
  // pasó en verde con la versión rota de 0020). Prueba la separación de datos;
  // la propiedad la prueba el de arriba, y es la que tumba un upgrade.
  //
  // Va por SET ROLE dentro de la misma transacción y no por appClient: otra
  // conexión no vería los cambios sin commitear, y se quedaría esperando los
  // locks de los ALTER ... OWNER. Cada intento vive en su savepoint porque un
  // error aborta la transacción entera.
  it("presencia_app no llega a ninguna tabla de la cola, ni por el padre ni por una partición", async () => {
    const { rows } = await ownerClient.query<{ name: string }>(`
      SELECT c.relname AS name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'pgboss' AND c.relkind IN ('r', 'p')
      ORDER BY 1
    `);
    expect(rows.length).toBeGreaterThan(0);
    for (const { name } of rows) {
      await ownerClient.query("SAVEPOINT probe");
      await ownerClient.query("SET LOCAL ROLE presencia_app");
      await expect(
        ownerClient.query(`SELECT 1 FROM pgboss.${pg.escapeIdentifier(name)} LIMIT 1`),
      ).rejects.toMatchObject({ code: "42501" }); // insufficient_privilege
      await ownerClient.query("ROLLBACK TO SAVEPOINT probe");
    }
  });
});
