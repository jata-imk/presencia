// Runner de la suite de regresión cultural (ADR-004).
// Corre cada prompt contra cada modelo con el MISMO system prompt de
// producción y versiones mock (sin DB) de las 3 tools de crear borrador
// (ADR-005), y genera un reporte markdown lado a lado para juicio humano
// del founder.
//
// Uso: pnpm --filter @presencia/api suite:cultural
// Modelos: env AI_SUITE_MODELS="google:x,openai:y@high" (la sintaxis del .env,
// con `@esfuerzo` opcional) o el default de abajo.
// AI_SUITE_PROMPTS="id1,id2" re-corre solo esos prompts (ids de prompts.ts).
// AI_SUITE_VOICES="id1,id2" corre cada prompt de cada modelo contra las voces
// de marca indicadas (ids de voices.ts) en vez del prompt base — DoD de F4
// (docs/explanation/product/presencia-configuracion-voz-de-marca.md): dos
// voces distintas deben producir outputs notoriamente distintos del mismo
// prompt. Sin esta env var, el comportamiento es igual que antes de F4
// (system = prompt base, sin voz).
// AI_SUITE_DELAY_MS pausa entre llamadas (default 10000 — el free tier de
// Gemini limita requests por minuto y cada prompt puede usar varios steps).

import { stepCountIs, streamText, tool, type ToolSet } from "ai";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { CARD_ARCHETYPE_TOOLS } from "@presencia/shared";
import { costOf } from "../../src/ai/model-prices.js";
import {
  createModelResolver,
  DEFAULT_MODEL_ID,
  parseModelEntry,
} from "../../src/ai/provider-registry.js";
import { buildSystemPrompt } from "../../src/chat/system-prompt.js";
import { culturalPrompts } from "./prompts.js";
import { CULTURAL_SUITE_VOICES, type VoiceFixture } from "./voices.js";
import { registrarGasto, splitModelId } from "../gasto-local.js";

// Los candidatos de F10.7 (ADR-004): Terra como referencia de lo que corre
// hoy, Luna en los dos esfuerzos que se comparan, y los respaldos. Cada
// entrada usa la misma sintaxis del `.env` (`proveedor:modelo@esfuerzo`).
// Haiku 4.5 salió: Anthropic puede retirarlo desde el 2026-10-15.
const DEFAULT_MODELS = [
  "openai:gpt-5.6-terra@medium",
  "openai:gpt-6-luna@high",
  "openai:gpt-6-luna@xhigh",
  "google:gemini-3.8-flash@medium",
  "anthropic:claude-sonnet-5-5",
];

// Mismo cableado que producción: el registry lee keys y base URLs desde la
// tabla PROVIDERS, sin mapping duplicado aquí.
const resolveModel = createModelResolver(process.env, process.env.AI_MODEL ?? DEFAULT_MODEL_ID);

// Mock de las 3 tools reales: itera la misma tabla que produce las tools de
// producción (CARD_ARCHETYPE_TOOLS en @presencia/shared) — nombre,
// descripción y schema son exactamente los que ve el modelo en el chat real,
// nunca una copia a mano que pueda quedarse desactualizada. Solo el
// execute() difiere (mock sin DB vs inserción real).
const culturalSuiteTools: ToolSet = {};
for (const def of CARD_ARCHETYPE_TOOLS) {
  culturalSuiteTools[def.toolName] = tool({
    description: def.description,
    inputSchema: def.inputSchema,
    execute: (input) =>
      Promise.resolve({ cardId: "mock-card", network: input.network, status: "draft" }),
  });
}

interface ToolCallAttempt {
  toolName: string;
  valid: boolean;
  input: unknown;
}

interface RunResult {
  text: string;
  finishReason: string;
  toolAttempts: ToolCallAttempt[];
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Parte de `outputTokens` que el modelo gastó pensando (no se ve). */
  reasoningTokens: number;
  /** Del envío al primer texto o a la primera card: lo que el creator espera viendo "pensando". */
  firstVisibleMs: number | null;
  totalMs: number;
  /** Dólares (`model-prices.ts`); null si el modelo no tiene precio. */
  costUsd: number | null;
  error?: string;
}

// streamText y no generateText: el chat de producción hace streaming, y lo
// que el creator siente con un esfuerzo alto es cuánto tarda en aparecer
// algo — eso solo se mide leyendo el stream.
async function runPrompt(
  modelEntry: string,
  promptText: string,
  system: string,
): Promise<RunResult> {
  const startedAt = Date.now();
  try {
    const result = streamText({
      model: resolveModel(modelEntry),
      system,
      prompt: promptText,
      tools: culturalSuiteTools,
      stopWhen: stepCountIs(3),
    });
    let firstVisibleMs: number | null = null;
    for await (const part of result.fullStream) {
      if (part.type === "error") throw part.error;
      if (
        firstVisibleMs === null &&
        (part.type === "text-delta" || part.type === "tool-input-start")
      ) {
        firstVisibleMs = Date.now() - startedAt;
      }
    }
    const [text, finishReason, steps, totalUsage] = await Promise.all([
      result.text,
      result.finishReason,
      result.steps,
      result.totalUsage,
    ]);
    // totalUsage y no usage: un turno con tool call son varios pasos, y se
    // pagan todos.
    const ids = splitModelId(modelEntry);
    const inputTokens = totalUsage.inputTokens ?? 0;
    const outputTokens = totalUsage.outputTokens ?? 0;
    await registrarGasto({
      script: "suite-cultural",
      ...ids,
      task: "chat",
      inputTokens,
      outputTokens,
    });
    // Los intentos con input inválido no ejecutan la tool pero sí cuentan:
    // miden la disciplina de tool calling del proveedor (ADR-004). Se guarda
    // el input completo (la card generada) para que el veredicto humano
    // pueda juzgar el copy, no solo si la tool se llamó bien.
    const attempts = steps.flatMap((step) => step.toolCalls);
    return {
      text,
      finishReason,
      toolAttempts: attempts.map((call) => ({
        toolName: call.toolName,
        valid: call.invalid !== true,
        input: call.input as unknown,
      })),
      inputTokens,
      outputTokens,
      totalTokens: totalUsage.totalTokens ?? 0,
      reasoningTokens: totalUsage.outputTokenDetails.reasoningTokens ?? 0,
      firstVisibleMs,
      totalMs: Date.now() - startedAt,
      costUsd: costOf({
        ...ids,
        inputTokens,
        outputTokens,
        cachedInputTokens: totalUsage.inputTokenDetails.cacheReadTokens ?? 0,
      }),
    };
  } catch (error) {
    return {
      text: "",
      finishReason: "error",
      toolAttempts: [],
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      reasoningTokens: 0,
      firstVisibleMs: null,
      totalMs: Date.now() - startedAt,
      costUsd: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Bloque de resultado reusado por el modo normal (### modelo) y el modo
// voces (#### voz dentro de ### modelo) — mismo contenido, distinto nivel
// de encabezado ya empujado por el caller.
function appendResultLines(lines: string[], result: RunResult, expectsTool: boolean): void {
  if (result.error) {
    lines.push(`**Error:** \`${result.error}\``, "");
  } else {
    lines.push(result.text.trim() || `*(sin texto — finishReason: ${result.finishReason})*`, "");
  }
  const toolCalls = result.toolAttempts.length;
  if (expectsTool || toolCalls > 0) {
    const toolNames = result.toolAttempts.map((a) => a.toolName).join(", ");
    const allValid = result.toolAttempts.every((a) => a.valid);
    lines.push(
      `- ¿Llamó la tool?: ${toolCalls > 0 ? `sí (${toolCalls}: ${toolNames})` : "no"}`,
      `- ¿Input Zod-válido?: ${toolCalls > 0 ? (allValid ? "sí" : "NO") : "n/a"}`,
      "",
    );
  }
  // Card generada por cada tool call (aunque el input haya sido inválido —
  // así se ve qué mandó el modelo, no solo si pasó Zod).
  for (const attempt of result.toolAttempts) {
    lines.push(
      `<details><summary>Card generada — <code>${attempt.toolName}</code>${attempt.valid ? "" : " ⚠️ input inválido"}</summary>`,
      "",
      "```json",
      JSON.stringify(attempt.input, null, 2),
      "```",
      "",
      "</details>",
      "",
    );
  }
  if (!result.error) {
    lines.push(
      `- Tokens: input ${result.inputTokens} / output ${result.outputTokens} (razonamiento ${result.reasoningTokens}) / total ${result.totalTokens}`,
      `- Primer token visible: ${formatMs(result.firstVisibleMs)} · total ${formatMs(result.totalMs)} · costo ${formatUsd(result.costUsd)}`,
      "",
    );
  }
}

interface ModelTotals {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  /** Corridas sin error: el promedio por turno se divide entre estas. */
  runs: number;
  firstVisibleMs: number[];
  /** null en cuanto una corrida no tiene precio: un total a medias engañaría. */
  costUsd: number | null;
}

function formatMs(ms: number | null): string {
  return ms === null ? "—" : `${(ms / 1000).toFixed(1)} s`;
}

function formatUsd(usd: number | null): string {
  return usd === null ? "sin precio" : `$${usd.toFixed(4)}`;
}

function findRepoRoot(start: string): string {
  let dir = start;
  while (!existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("No encontré la raíz del repo (pnpm-workspace.yaml)");
    dir = parent;
  }
  return dir;
}

async function main(): Promise<void> {
  const requested = (
    process.env.AI_SUITE_MODELS?.split(",").map((m) => m.trim()) ?? DEFAULT_MODELS
  ).filter(Boolean);
  // Proveedores sin API key se saltan (con aviso) en vez de llenar el
  // reporte de filas de error.
  // Una entrada mal escrita (nivel o proveedor que no existen) es un error de
  // quien corre la suite: truena aquí con el motivo, en vez de saltarse el
  // modelo como si le faltara la key.
  requested.forEach((entry) => parseModelEntry(entry));
  const models = requested.filter((id) => {
    try {
      resolveModel(id);
      return true;
    } catch (error) {
      console.warn(`⚠ ${id}: ${error instanceof Error ? error.message : String(error)} — saltado`);
      return false;
    }
  });
  if (models.length === 0) {
    throw new Error("Ningún modelo configurado; revisa las API keys del .env");
  }
  const promptFilter = process.env.AI_SUITE_PROMPTS?.split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const prompts = promptFilter
    ? culturalPrompts.filter((p) => promptFilter.includes(p.id))
    : culturalPrompts;

  const voiceFilter = process.env.AI_SUITE_VOICES?.split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const voices: VoiceFixture[] = voiceFilter
    ? CULTURAL_SUITE_VOICES.filter((v) => voiceFilter.includes(v.id))
    : [];
  if (voiceFilter && voices.length === 0) {
    throw new Error(
      `AI_SUITE_VOICES no coincide con ningún id de voices.ts (pediste: ${voiceFilter.join(", ")}).`,
    );
  }

  const delayRaw = Number(process.env.AI_SUITE_DELAY_MS ?? 10_000);
  const delayMs = Number.isFinite(delayRaw) && delayRaw >= 0 ? delayRaw : 10_000;
  if (delayMs !== delayRaw) {
    console.warn(
      `⚠ AI_SUITE_DELAY_MS inválido ("${process.env.AI_SUITE_DELAY_MS}"); usando 10000ms`,
    );
  }

  const totalCalls = prompts.length * models.length * (voices.length || 1);
  console.log(
    `▶ ${prompts.length} prompts × ${models.length} modelos` +
      (voices.length > 0 ? ` × ${voices.length} voces` : "") +
      ` = ${totalCalls} llamadas (~${Math.round((totalCalls * delayMs) / 60_000)} min con el delay actual)`,
  );

  const date = new Date().toISOString().slice(0, 10);
  const lines: string[] = [
    `# Suite de regresión cultural — ${date}`,
    "",
    `System prompt: el de producción (\`apps/api/src/chat/system-prompt.ts\`)` +
      (voices.length > 0
        ? `, ensamblado por voz de marca (\`buildSystemPrompt\`).`
        : `, sin voz de marca (\`buildSystemPrompt(null)\` === prompt base).`),
    `Modelos: ${models.map((m) => `\`${m}\``).join(", ")}.`,
    ...(voices.length > 0
      ? [`Voces: ${voices.map((v) => `\`${v.id}\` (${v.label})`).join(", ")}.`]
      : []),
    "",
    "Criterio de juicio: tuteo natural, cero voseo, modismos mexicanos bien usados,",
    'registro cercano sin caer en caricatura. Lo que suene a "español de aeropuerto" pierde.',
    ...(voices.length > 0
      ? [
          "",
          "**DoD de voz de marca:** dos voces distintas deben sonar notoriamente distinto — " +
            "mismo prompt, mismo modelo, comparar las secciones de voz dentro de cada modelo.",
        ]
      : []),
    "",
  ];

  // Acumulado de tokens por modelo a lo largo de todas las corridas — mide si
  // el diseño de tool (3 tools por arquetipo vs. discriminatedUnion/aplanado)
  // realmente cuesta menos por evitar reintentos de input inválido.
  const tokensByModel = new Map<string, ModelTotals>(
    models.map((m) => [
      m,
      {
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
        runs: 0,
        firstVisibleMs: [],
        costUsd: 0,
      },
    ]),
  );

  for (const prompt of prompts) {
    console.log(`\n▶ ${prompt.id}`);
    lines.push(`## ${prompt.id}${prompt.expectsTool ? " (espera tool call)" : ""}`, "");
    lines.push(`> ${prompt.text}`, "");

    for (const modelId of models) {
      lines.push(`### ${modelId}`, "");

      // Sin voces: una sola corrida con el prompt base, igual que antes de
      // F4 (buildSystemPrompt(null) === BASE_SYSTEM_PROMPT).
      const passes = voices.length > 0 ? voices : [null];

      for (const voiceFixture of passes) {
        console.log(`  · ${modelId}${voiceFixture ? ` [${voiceFixture.id}]` : ""}...`);
        const system = buildSystemPrompt(voiceFixture?.voice ?? null);
        const result = await runPrompt(modelId, prompt.text, system);
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        const totals = tokensByModel.get(modelId);
        if (totals && !result.error) {
          totals.runs += 1;
          totals.inputTokens += result.inputTokens;
          totals.outputTokens += result.outputTokens;
          totals.reasoningTokens += result.reasoningTokens;
          totals.totalTokens += result.totalTokens;
          if (result.firstVisibleMs !== null) totals.firstVisibleMs.push(result.firstVisibleMs);
          totals.costUsd =
            totals.costUsd === null || result.costUsd === null
              ? null
              : totals.costUsd + result.costUsd;
        }

        if (voiceFixture) lines.push(`#### Voz: ${voiceFixture.label}`, "");
        appendResultLines(lines, result, prompt.expectsTool);
      }
    }
  }

  lines.push(
    "---",
    "",
    `## Consumo de tokens por proveedor (${prompts.length} prompts${voices.length > 0 ? ` × ${voices.length} voces` : ""})`,
    "",
    "Primer token visible: mediana y peor caso. Costo: promedio por turno, con los precios de `apps/api/src/ai/model-prices.ts`.",
    "",
    "| Modelo | Input | Output | Razonamiento | % razonamiento | Primer token (mediana / peor) | Costo por turno |",
    "| ------ | ----- | ------ | ------------ | -------------- | ----------------------------- | --------------- |",
    ...models.map((m) => {
      const t = tokensByModel.get(m)!;
      const sorted = [...t.firstVisibleMs].sort((a, b) => a - b);
      const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)]! : null;
      const worst = sorted.length > 0 ? sorted[sorted.length - 1]! : null;
      const share = t.outputTokens > 0 ? Math.round((t.reasoningTokens / t.outputTokens) * 100) : 0;
      const perTurn = t.costUsd === null || t.runs === 0 ? null : t.costUsd / t.runs;
      return `| \`${m}\` | ${t.inputTokens} | ${t.outputTokens} | ${t.reasoningTokens} | ${share}% | ${formatMs(median)} / ${formatMs(worst)} | ${formatUsd(perTurn)} |`;
    }),
    "",
    "## Veredicto (juicio humano)",
    "",
    "| Modelo | Registro cultural (1-5) | Tool calling | Notas |",
    "| ------ | ----------------------- | ------------ | ----- |",
    ...models.map((m) => `| \`${m}\` | | | |`),
    "",
    "**Conclusión:**",
    "",
    "_Pendiente de llenar por Jose tras leer el reporte._",
    "",
  );

  const repoRoot = findRepoRoot(process.cwd());
  const outDir = path.join(repoRoot, "docs", "reference", "suite-cultural");
  await mkdir(outDir, { recursive: true });
  const suffix = `${voices.length > 0 ? "-voces" : ""}${promptFilter ? "-parcial" : ""}`;
  // Nunca pisa un reporte: dos corridas el mismo día (la de la mañana y la de
  // la tarde) son dos reportes, -2, -3…
  let outFile = path.join(outDir, `${date}-reporte${suffix}.md`);
  for (let n = 2; existsSync(outFile); n++) {
    outFile = path.join(outDir, `${date}-reporte${suffix}-${String(n)}.md`);
  }
  await writeFile(outFile, lines.join("\n"), "utf8");
  console.log(`\n✔ Reporte: ${path.relative(repoRoot, outFile)}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
