// Cuánto estamos gastando en modelos, en dólares.
//
// Uso: pnpm --filter @presencia/api gasto            (últimos 7 días)
//      pnpm --filter @presencia/api gasto -- --dias 30
//
// Suma dos fuentes:
// - `ai_usage_events` de la base del `.env` (en tu máquina, la de dev; en el
//   VPS, la de prod): todo lo que corre dentro de la app (chat, adaptar,
//   tendencias con sus búsquedas, imágenes).
// - `scripts/.gasto-local.jsonl`: los scripts de esta máquina (bake-off,
//   estilos, suite cultural), que no pasan por la app.
//
// Los precios salen de `src/ai/model-prices.ts`. Un modelo sin fila sale "sin
// precio" con sus tokens: se agrega la fila, no se adivina. El reporte es el
// techo: no resta niveles gratis (las 5,000 búsquedas al mes de Gemini).

import pg from "pg";
import { costOf, MODEL_PRICES } from "../src/ai/model-prices.js";
import { leerGastoLocal } from "./gasto-local.js";

interface Fila {
  dia: string;
  /** "app" (ai_usage_events) o el nombre del script. */
  origen: string;
  modelo: string;
  tarea: string;
  llamadas: number;
  entrada: number;
  salida: number;
  imagenes: number;
  busquedas: number;
  usd: number | null;
}

function diasArg(): number {
  const i = process.argv.indexOf("--dias");
  const n = i === -1 ? 7 : Number(process.argv[i + 1]);
  return Number.isFinite(n) && n > 0 ? n : 7;
}

const TZ = "America/Merida";

function diaDe(fecha: Date): string {
  return fecha.toLocaleDateString("en-CA", { timeZone: TZ });
}

async function main() {
  const dias = diasArg();
  // Desde la medianoche de Mérida de hace `dias - 1` días: la tabla agrupa por
  // día calendario, y una ventana de "N×24 h desde ahora" dejaría el primer
  // día a medias sin decirlo. Mérida está fija en UTC-6 (sin horario de
  // verano desde 2022).
  const hoy = diaDe(new Date());
  const desde = new Date(Date.parse(`${hoy}T00:00:00-06:00`) - (dias - 1) * 86_400_000);
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL en el .env");

  const filas = new Map<string, Fila>();
  function sumar(
    dia: string,
    origen: string,
    provider: string,
    model: string,
    tarea: string,
    u: {
      entrada: number;
      salida: number;
      cacheada?: number | null;
      imagenes?: number | null;
      busquedas?: number | null;
    },
  ) {
    const modelo = `${provider}:${model}`;
    const key = [dia, origen, modelo, tarea].join("|");
    const fila = filas.get(key) ?? {
      dia,
      origen,
      modelo,
      tarea,
      llamadas: 0,
      entrada: 0,
      salida: 0,
      imagenes: 0,
      busquedas: 0,
      usd: 0,
    };
    const usd = costOf({
      provider,
      model,
      inputTokens: u.entrada,
      outputTokens: u.salida,
      cachedInputTokens: u.cacheada,
      imagesCount: u.imagenes,
      searchQueries: u.busquedas,
    });
    fila.llamadas += 1;
    fila.entrada += u.entrada;
    fila.salida += u.salida;
    fila.imagenes += u.imagenes ?? 0;
    fila.busquedas += u.busquedas ?? 0;
    fila.usd = fila.usd === null || usd === null ? null : fila.usd + usd;
    filas.set(key, fila);
  }

  // Superusuario (DATABASE_URL), no el rol de la app: el reporte es de todos
  // los usuarios y RLS lo cortaría a uno.
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    const { rows } = await db.query<{
      created_at: Date;
      provider: string;
      model: string;
      task_kind: string;
      input_tokens: number;
      output_tokens: number;
      cached_input_tokens: number | null;
      images_count: number | null;
      search_queries: number | null;
    }>(
      `select created_at, provider, model, task_kind, input_tokens, output_tokens,
              cached_input_tokens, images_count, search_queries
         from ai_usage_events where created_at >= $1`,
      [desde],
    );
    for (const r of rows) {
      sumar(diaDe(r.created_at), "app", r.provider, r.model, r.task_kind, {
        entrada: r.input_tokens,
        salida: r.output_tokens,
        cacheada: r.cached_input_tokens,
        imagenes: r.images_count,
        busquedas: r.search_queries,
      });
    }
  } finally {
    await db.end();
  }

  for (const g of await leerGastoLocal()) {
    const at = new Date(g.at);
    if (at < desde) continue;
    sumar(diaDe(at), g.script, g.provider, g.model, g.task, {
      entrada: g.inputTokens,
      salida: g.outputTokens,
      imagenes: g.imagesCount,
    });
  }

  const lista = [...filas.values()].sort(
    (a, b) => a.dia.localeCompare(b.dia) || a.origen.localeCompare(b.origen),
  );
  const fmt = (n: number | null) => (n === null ? "sin precio" : `$${n.toFixed(3)}`);
  console.log(`\nGasto en modelos, últimos ${String(dias)} días (${TZ})\n`);
  console.table(
    lista.map((f) => ({
      día: f.dia,
      origen: f.origen,
      modelo: f.modelo,
      tarea: f.tarea,
      llamadas: f.llamadas,
      "tokens ent/sal": `${String(f.entrada)} / ${String(f.salida)}`,
      imágenes: f.imagenes || "",
      búsquedas: f.busquedas || "",
      usd: fmt(f.usd),
    })),
  );

  const total = lista.reduce((s, f) => s + (f.usd ?? 0), 0);
  const porModelo = new Map<string, number>();
  for (const f of lista) porModelo.set(f.modelo, (porModelo.get(f.modelo) ?? 0) + (f.usd ?? 0));
  console.log("Por modelo:");
  for (const [m, usd] of [...porModelo].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${m.padEnd(38)} ${MODEL_PRICES[m] ? fmt(usd) : "sin precio"}`);
  }
  const sinPrecio = [...new Set(lista.filter((f) => f.usd === null).map((f) => f.modelo))];
  console.log(`\nTotal con precio: $${total.toFixed(2)}`);
  if (sinPrecio.length > 0) {
    console.log(`Sin precio en model-prices.ts (no suman): ${sinPrecio.join(", ")}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
