import pg from "pg";

// globalSetup de vitest (vitest.config.ts). Los tests corren contra la misma
// base que la API dev (el túnel al 5434), y la API dev con WORKER_INLINE (el
// default) corre el cron `cards.reconcile` cada minuto sobre TODOS los
// tenants. Su FakePublishingProvider no conoce las providerRef que crean los
// tests, así que marca `failed` las cards programadas del test si su pasada
// cae entre el arreglo y la aserción: reconcileDueCards fallaba una de cada
// tantas en la suite completa y pasaba solo (F10.8.4). Aislar el test no
// alcanza, porque la pasada que estorba es la del otro proceso.
//
// Si un cards.reconcile EMPEZÓ a correr en los últimos 2 minutos, hay una API
// dev con worker contra esta base, y mejor no correr que salir rojo al azar.
// Se mira `started_on`: sin worker, pg-boss igual crea el job del cron, pero
// nadie lo corre y no estorba. En CI no hay API, y si la tabla de la cola no
// existe todavía, no hay nada que revisar.

const VENTANA_MINUTOS = 2;

export default async function guardaCronDev(): Promise<void> {
  try {
    process.loadEnvFile("../../.env");
  } catch {
    // Sin .env: se usa el process.env tal cual (CI).
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn("[tests] Sin DATABASE_URL: no se revisa si la API dev está corriendo su cron.");
    return;
  }

  const client = new pg.Client({ connectionString: url });
  let haceSegundos: number | null;
  try {
    await client.connect();
    const { rows } = await client.query<{ hace: number | null }>(
      `select extract(epoch from now() - max(started_on))::int as hace
         from pgboss.job
        where name = 'cards.reconcile' and started_on > now() - make_interval(mins => $1)`,
      [VENTANA_MINUTOS],
    );
    haceSegundos = rows[0]?.hace ?? null;
  } catch (error) {
    console.warn("[tests] No se pudo revisar la cola de jobs; se sigue sin la guarda:", error);
    return;
  } finally {
    await client.end().catch(() => undefined);
  }

  if (haceSegundos !== null) {
    throw new Error(
      `La API dev está corriendo el cron cards.reconcile contra esta base (hace ${String(haceSegundos)} s), ` +
        "y le pega a las cards de los tests. Apágala, o levántala con WORKER_INLINE=false, " +
        `y vuelve a correr los tests cuando pasen ${String(VENTANA_MINUTOS)} minutos sin que corra.`,
    );
  }
}
