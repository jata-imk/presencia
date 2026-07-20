// Runner de la suite de regresión cultural (ADR-004).
// Corre cada prompt contra cada modelo con el MISMO system prompt de
// producción y una versión mock (sin DB) de crear_borrador_publicacion,
// y genera un reporte markdown lado a lado para juicio humano del founder.
//
// Uso: pnpm --filter @presencia/api suite:cultural
// Modelos: env AI_SUITE_MODELS="google:x,openai:y" o el default de abajo.
// AI_SUITE_PROMPTS="id1,id2" re-corre solo esos prompts (ids de prompts.ts).
// AI_SUITE_DELAY_MS pausa entre llamadas (default 10000 — el free tier de
// Gemini limita requests por minuto y cada prompt puede usar varios steps).

import { generateText, stepCountIs, tool } from "ai";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { cardContentSchema, socialNetworkSchema } from "@presencia/shared";
import { createModelResolver } from "../../src/ai/provider-registry.js";
import { SYSTEM_PROMPT } from "../../src/chat/system-prompt.js";
import { culturalPrompts } from "./prompts.js";

const DEFAULT_MODELS = ["google:gemini-3.5-flash", "openai:gpt-5-mini", "minimax:MiniMax-M2"];

const resolveModel = createModelResolver({
  googleApiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY,
  minimaxApiKey: process.env.MINIMAX_API_KEY,
  minimaxBaseUrl: process.env.MINIMAX_BASE_URL ?? "https://api.minimax.io/v1",
  defaultModelId: process.env.AI_MODEL ?? "google:gemini-3.5-flash",
});

// Mock de la tool de ADR-005: mismo contrato de entrada que tendrá la real,
// pero sin tocar la DB. Mide si el modelo la llama y si su input pasa Zod.
const mockCardInputSchema = z.object({
  network: socialNetworkSchema,
  content: cardContentSchema,
});

interface RunResult {
  text: string;
  toolCalls: number;
  toolInputsValid: boolean;
  error?: string;
}

async function runPrompt(modelId: string, promptText: string): Promise<RunResult> {
  let toolCalls = 0;
  let toolInputsValid = true;

  const crearBorrador = tool({
    description:
      "Crea un borrador de publicación para una red social. Úsala cuando el " +
      "usuario pida explícitamente un post, borrador o guion para una red.",
    inputSchema: mockCardInputSchema,
    execute: (input) => {
      toolCalls += 1;
      const parsed = mockCardInputSchema.safeParse(input);
      if (!parsed.success) toolInputsValid = false;
      return Promise.resolve({
        cardId: `mock-${toolCalls}`,
        archetype: input.content.archetype,
        network: input.network,
        status: "draft",
      });
    },
  });

  try {
    const result = await generateText({
      model: resolveModel(modelId),
      system: SYSTEM_PROMPT,
      prompt: promptText,
      tools: { crear_borrador_publicacion: crearBorrador },
      stopWhen: stepCountIs(3),
    });
    return { text: result.text, toolCalls, toolInputsValid };
  } catch (error) {
    return {
      text: "",
      toolCalls,
      toolInputsValid,
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
  const models = (
    process.env.AI_SUITE_MODELS?.split(",").map((m) => m.trim()) ?? DEFAULT_MODELS
  ).filter(Boolean);
  const promptFilter = process.env.AI_SUITE_PROMPTS?.split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const prompts = promptFilter
    ? culturalPrompts.filter((p) => promptFilter.includes(p.id))
    : culturalPrompts;
  const delayMs = Number(process.env.AI_SUITE_DELAY_MS ?? 10_000);
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

  for (const prompt of prompts) {
    console.log(`\n▶ ${prompt.id}`);
    lines.push(`## ${prompt.id}${prompt.expectsTool ? " (espera tool call)" : ""}`, "");
    lines.push(`> ${prompt.text}`, "");

    for (const modelId of models) {
      console.log(`  · ${modelId}...`);
      const result = await runPrompt(modelId, prompt.text);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      lines.push(`### ${modelId}`, "");
      if (result.error) {
        lines.push(`**Error:** \`${result.error}\``, "");
      } else {
        lines.push(result.text.trim() || "*(sin texto — solo tool call)*", "");
      }
      if (prompt.expectsTool || result.toolCalls > 0) {
        lines.push(
          `- ¿Llamó la tool?: ${result.toolCalls > 0 ? `sí (${result.toolCalls})` : "no"}`,
          `- ¿Input Zod-válido?: ${result.toolCalls > 0 ? (result.toolInputsValid ? "sí" : "NO") : "n/a"}`,
          "",
        );
      }
    }
  }

  lines.push(
    "---",
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
