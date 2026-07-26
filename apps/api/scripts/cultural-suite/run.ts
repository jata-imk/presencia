// Runner de la suite de regresión cultural (ADR-004).
// Corre cada prompt contra cada modelo con el MISMO system prompt de
// producción y versiones mock (sin DB) de las 3 tools de crear borrador
// (ADR-005), y genera un reporte markdown lado a lado para juicio humano
// del founder.
//
// Uso: pnpm --filter @presencia/api suite:cultural
// Modelos: env AI_SUITE_MODELS="google:x,openai:y" o el default de abajo.
// AI_SUITE_PROMPTS="id1,id2" re-corre solo esos prompts (ids de prompts.ts).
// AI_SUITE_DELAY_MS pausa entre llamadas (default 10000 — el free tier de
// Gemini limita requests por minuto y cada prompt puede usar varios steps).

import { generateText, stepCountIs, tool, type ToolSet } from "ai";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { CARD_ARCHETYPE_TOOLS } from "@presencia/shared";
import { createModelResolver, DEFAULT_MODEL_ID } from "../../src/ai/provider-registry.js";
import { SYSTEM_PROMPT } from "../../src/chat/system-prompt.js";
import { culturalPrompts } from "./prompts.js";

const DEFAULT_MODELS = [
  "google:gemini-3.5-flash",
  "openai:gpt-5-mini",
  "anthropic:claude-haiku-4-5",
  "deepseek:deepseek-v4-flash",
  "minimax:MiniMax-M2",
  "kimi:kimi-latest",
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
  error?: string;
}

async function runPrompt(modelId: string, promptText: string): Promise<RunResult> {
  try {
    const result = await generateText({
      model: resolveModel(modelId),
      system: SYSTEM_PROMPT,
      prompt: promptText,
      tools: culturalSuiteTools,
      stopWhen: stepCountIs(3),
    });
    // Los intentos con input inválido no ejecutan la tool pero sí cuentan:
    // miden la disciplina de tool calling del proveedor (ADR-004). Se guarda
    // el input completo (la card generada) para que el veredicto humano
    // pueda juzgar el copy, no solo si la tool se llamó bien.
    const attempts = result.steps.flatMap((step) => step.toolCalls);
    return {
      text: result.text,
      finishReason: result.finishReason,
      toolAttempts: attempts.map((call) => ({
        toolName: call.toolName,
        valid: call.invalid !== true,
        input: call.input as unknown,
      })),
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      totalTokens: result.usage.totalTokens ?? 0,
    };
  } catch (error) {
    return {
      text: "",
      finishReason: "error",
      toolAttempts: [],
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
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
  const models = requested.filter((id) => {
    try {
      resolveModel(id);
      return true;
    } catch {
      console.warn(`⚠ ${id}: proveedor sin configurar (falta API key) — saltado`);
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
  const delayRaw = Number(process.env.AI_SUITE_DELAY_MS ?? 10_000);
  const delayMs = Number.isFinite(delayRaw) && delayRaw >= 0 ? delayRaw : 10_000;
  if (delayMs !== delayRaw) {
    console.warn(
      `⚠ AI_SUITE_DELAY_MS inválido ("${process.env.AI_SUITE_DELAY_MS}"); usando 10000ms`,
    );
  }
  const date = new Date().toISOString().slice(0, 10);
  const lines: string[] = [
    `# Suite de regresión cultural — ${date}`,
    "",
    `System prompt: el de producción (\`apps/api/src/chat/system-prompt.ts\`).`,
    `Modelos: ${models.map((m) => `\`${m}\``).join(", ")}.`,
    "",
    "Criterio de juicio: tuteo natural, cero voseo, modismos mexicanos bien usados,",
    'registro cercano sin caer en caricatura. Lo que suene a "español de aeropuerto" pierde.',
    "",
  ];

  // Acumulado de tokens por modelo a lo largo de las 10 corridas — mide si
  // el diseño de tool (3 tools por arquetipo vs. discriminatedUnion/aplanado)
  // realmente cuesta menos por evitar reintentos de input inválido.
  const tokensByModel = new Map(
    models.map((m) => [m, { inputTokens: 0, outputTokens: 0, totalTokens: 0 }]),
  );

  for (const prompt of prompts) {
    console.log(`\n▶ ${prompt.id}`);
    lines.push(`## ${prompt.id}${prompt.expectsTool ? " (espera tool call)" : ""}`, "");
    lines.push(`> ${prompt.text}`, "");

    for (const modelId of models) {
      console.log(`  · ${modelId}...`);
      const result = await runPrompt(modelId, prompt.text);
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      const totals = tokensByModel.get(modelId);
      if (totals) {
        totals.inputTokens += result.inputTokens;
        totals.outputTokens += result.outputTokens;
        totals.totalTokens += result.totalTokens;
      }

      lines.push(`### ${modelId}`, "");
      if (result.error) {
        lines.push(`**Error:** \`${result.error}\``, "");
      } else {
        lines.push(
          result.text.trim() || `*(sin texto — finishReason: ${result.finishReason})*`,
          "",
        );
      }
      const toolCalls = result.toolAttempts.length;
      if (prompt.expectsTool || toolCalls > 0) {
        const toolNames = result.toolAttempts.map((a) => a.toolName).join(", ");
        const allValid = result.toolAttempts.every((a) => a.valid);
        lines.push(
          `- ¿Llamó la tool?: ${toolCalls > 0 ? `sí (${toolCalls}: ${toolNames})` : "no"}`,
          `- ¿Input Zod-válido?: ${toolCalls > 0 ? (allValid ? "sí" : "NO") : "n/a"}`,
          "",
        );
      }
      // Card generada por cada tool call (aunque el input haya sido
      // inválido — así se ve qué mandó el modelo, no solo si pasó Zod).
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
          `- Tokens: input ${result.inputTokens} / output ${result.outputTokens} / total ${result.totalTokens}`,
          "",
        );
      }
    }
  }

  lines.push(
    "---",
    "",
    "## Consumo de tokens por proveedor (10 prompts)",
    "",
    "| Modelo | Input | Output | Total |",
    "| ------ | ----- | ------ | ----- |",
    ...models.map((m) => {
      const t = tokensByModel.get(m)!;
      return `| \`${m}\` | ${t.inputTokens} | ${t.outputTokens} | ${t.totalTokens} |`;
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
  const outFile = path.join(outDir, `${date}-reporte${promptFilter ? "-parcial" : ""}.md`);
  await writeFile(outFile, lines.join("\n"), "utf8");
  console.log(`\n✔ Reporte: ${path.relative(repoRoot, outFile)}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
