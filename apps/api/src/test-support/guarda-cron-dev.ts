import pg from "pg";

// F10.8.4: los specs de cards corren contra la misma base que la API dev (el
// túnel al 5434), y un worker dev (la API con WORKER_INLINE, el default, o
// `dev:worker`) corre el cron `cards.reconcile` cada minuto sobre TODOS los
// tenants. Su FakePublishingProvider no conoce las providerRef que crean los
// tests, así que marca `failed` las cards programadas del test si su pasada
// cae entre el arreglo y la aserción: reconcileDueCards fallaba una de cada
// tantas en la suite completa y pasaba solo. Aislar el test no alcanza, porque
// la pasada que estorba es la del otro proceso.
//
// Se llama en el beforeAll de los specs expuestos, no en un globalSetup: los
// tests que no tocan la base no tienen por qué depender de esto.
//
// Hay un worker si un cards.reconcile empezó en los últimos 2 minutos. Se
// mira `started_on`: sin worker, pg-boss igual crea el job del cron, pero
// nadie lo corre y no estorba. No se mira `state = 'active'`: un worker que
// se mata a media pasada deja su job activo hasta que expira (10 minutos), y
// bloquearía los tests sin que haya nada corriendo; una pasada real dura
// alrededor de un segundo. Conecta como presencia_jobs,
// el dueño de la cola. En CI no hay worker; si la cola no existe o no se puede
// leer, no hay nada que revisar y se sigue.

const VENTANA_MINUTOS = 2;

export async function sinWorkerDeReconciliacion(): Promise<void> {
  const url = process.env.JOBS_DATABASE_URL;
  if (!url) return;

  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 5_000,
  });
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
      `Un worker dev está corriendo el cron cards.reconcile contra esta base (empezó hace ${String(haceSegundos)} s), ` +
        "y le pega a las cards de estos tests. Apaga `dev:worker` si lo tienes, o levanta la API con " +
        `WORKER_INLINE=false, y vuelve a correrlos cuando pasen ${String(VENTANA_MINUTOS)} minutos sin que corra.`,
    );
  }
}
