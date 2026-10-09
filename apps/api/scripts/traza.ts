// La traza de un turno de chat (F10.8.1, ADR-026): qué pasos corrió el modelo,
// qué tools llamó, cuánto tardó cada cosa, cuánto salió de caché y qué
// disparó el turno después (título, compactación, memoria).
//
// Uso: pnpm --filter @presencia/api traza <runId>
//      pnpm --filter @presencia/api traza <chatId>        (sus últimos 5 turnos)
//      pnpm --filter @presencia/api traza <chatId> -- --turnos 20
//
// Lee la base del `.env` con el rol owner, como `gasto`: en tu máquina, dev;
// en el VPS, prod. Los precios salen de `src/ai/model-prices.ts`.

import pg from "pg";
import { costOf } from "../src/ai/model-prices.js";

const TZ = "America/Merida";

interface Paso {
  step_index: number;
  kind: "model" | "tool";
  name: string;
  status: string;
  started_at: Date;
  duration_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_input_tokens: number | null;
  error: string | null;
}

interface Uso {
  task_kind: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number | null;
  duration_ms: number;
  fallback_from: string | null;
  created_at: Date;
}

const miles = (n: number | null | undefined) => (n ?? 0).toLocaleString("es-MX");
const hora = (d: Date) => d.toLocaleString("es-MX", { timeZone: TZ, hour12: false });
const usd = (n: number | null) => (n === null ? "sin precio" : `$${n.toFixed(5)}`);

function costoDe(
  uso: Pick<Uso, "provider" | "model" | "input_tokens" | "output_tokens" | "cached_input_tokens">,
) {
  return costOf({
    provider: uso.provider,
    model: uso.model,
    inputTokens: uso.input_tokens,
    outputTokens: uso.output_tokens,
    cachedInputTokens: uso.cached_input_tokens,
  });
}

function cache(input: number | null, cached: number | null): string {
  if (!input) return "";
  const pct = Math.round(((cached ?? 0) / input) * 100);
  return ` (caché ${miles(cached)}, ${String(pct)}%)`;
}

async function imprimirTurno(client: pg.Client, runId: string): Promise<void> {
  const pasos = (
    await client.query<Paso>(
      `select step_index, kind, name, status, started_at, duration_ms, input_tokens,
              output_tokens, cached_input_tokens, error
         from ai_run_steps where run_id = $1 order by step_index, kind, started_at`,
      [runId],
    )
  ).rows;
  const usos = (
    await client.query<Uso>(
      `select task_kind, provider, model, input_tokens, output_tokens, cached_input_tokens,
              duration_ms, fallback_from, created_at
         from ai_usage_events where run_id = $1 order by created_at`,
      [runId],
    )
  ).rows;
  const [chat] = (
    await client.query<{ title: string }>(
      `select c.title from messages m join chats c on c.id = m.chat_id where m.run_id = $1
       union all
       select c.title from ai_run_steps s join chats c on c.id = s.chat_id where s.run_id = $1
       limit 1`,
      [runId],
    )
  ).rows;

  const inicio = pasos[0]?.started_at ?? usos[0]?.created_at;
  console.log(
    `\nTurno ${runId}${chat ? ` · «${chat.title}»` : ""}${inicio ? ` · ${hora(inicio)}` : ""}`,
  );
  if (pasos.length === 0) console.log("  (sin pasos: turno anterior a F10.8.1)");
  for (const p of pasos) {
    const estado =
      p.status === "ok" ? "" : `  ${p.status.toUpperCase()}${p.error ? `: ${p.error}` : ""}`;
    if (p.kind === "model") {
      console.log(
        `  paso ${String(p.step_index)}  ${p.name.padEnd(34)} ${miles(p.duration_ms).padStart(7)} ms` +
          (p.input_tokens === null
            ? "  sin usage (el proveedor no alcanzó a reportarlo)"
            : `  entrada ${miles(p.input_tokens)}${cache(p.input_tokens, p.cached_input_tokens)}` +
              `  salida ${miles(p.output_tokens)}`) +
          estado,
      );
    } else {
      console.log(`    tool ${p.name.padEnd(33)} ${miles(p.duration_ms).padStart(7)} ms${estado}`);
    }
  }

  const turno = usos.filter((u) => u.task_kind === "chat");
  const derivados = usos.filter((u) => u.task_kind !== "chat");
  if (turno.length === 0 && pasos.some((p) => p.status !== "ok")) {
    console.log("  sin cobro: el turno no terminó (cortado o con error)");
  }
  for (const u of turno) {
    console.log(
      `  total del turno: ${miles(u.duration_ms)} ms · ${usd(costoDe(u))}` +
        (u.fallback_from ? ` · respondió el respaldo (pidió ${u.fallback_from})` : ""),
    );
  }
  if (derivados.length > 0) {
    console.log("  disparó:");
    for (const u of derivados) {
      console.log(
        `    ${u.task_kind.padEnd(18)} ${`${u.provider}:${u.model}`.padEnd(34)} ${miles(u.duration_ms).padStart(7)} ms` +
          `  entrada ${miles(u.input_tokens)}  ${usd(costoDe(u))}`,
      );
    }
  }
}

async function main() {
  const id = process.argv[2];
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    throw new Error("Uso: pnpm --filter @presencia/api traza <runId|chatId>");
  }
  const i = process.argv.indexOf("--turnos");
  const turnos = i === -1 ? 5 : Math.max(1, Number(process.argv[i + 1]) || 5);
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL en el .env");

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    // ¿Es un turno? Si no, se toma como chat y se listan sus últimos turnos.
    const esTurno = await client.query(
      `select 1 from ai_run_steps where run_id = $1
       union all select 1 from ai_usage_events where run_id = $1 limit 1`,
      [id],
    );
    if (esTurno.rowCount) {
      await imprimirTurno(client, id);
      return;
    }
    const runs = (
      await client.query<{ run_id: string }>(
        // Los turnos cortados no dejan fila de uso (no se cobran), pero sí traza.
        `select run_id from (
           select run_id, created_at from ai_run_steps where chat_id = $1
           union all
           select run_id, created_at from ai_usage_events
            where chat_id = $1 and task_kind = 'chat' and run_id is not null
         ) t group by run_id order by max(created_at) desc limit $2`,
        [id, turnos],
      )
    ).rows;
    if (runs.length === 0) {
      console.log(
        "Ni turno ni chat con traza: ¿el id es correcto? (los turnos previos a F10.8.1 no tienen)",
      );
      return;
    }
    for (const { run_id } of runs.reverse()) await imprimirTurno(client, run_id);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
