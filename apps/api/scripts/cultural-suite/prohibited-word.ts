// Suite "voz prohibida" (F4, DoD 2 de
// docs/explanation/product/presencia-configuracion-voz-de-marca.md): un
// modismo marcado como prohibido no debe aparecer en 20 generaciones. Corre
// el MISMO prompt N veces contra un modelo, con una voz cuyo
// bannedExpressions incluye una palabra que un LLM usaría de forma natural
// en ese contexto (voices.ts, PROHIBITED_WORD_VOICE) — banear algo que el
// modelo ya no diría de todos modos no probaría nada.
//
// Uso: pnpm --filter @presencia/api suite:voz-prohibida
// AI_SUITE_PROHIBITED_MODEL — modelo a usar (default: AI_MODEL / DEFAULT_MODEL_ID).
// AI_SUITE_PROHIBITED_RUNS — número de generaciones (default 20, el número del DoD).
// AI_SUITE_DELAY_MS — mismo nombre que suite:cultural (default 10000).

import { generateText } from "ai";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeExpression } from "@presencia/shared";
import { createModelResolver, DEFAULT_MODEL_ID } from "../../src/ai/provider-registry.js";
import { buildSystemPrompt } from "../../src/chat/system-prompt.js";
import { PROHIBITED_WORD_VOICE } from "./voices.js";

// Tema deliberadamente propenso al hype de marketing ("increíble", "único",
// "revolucionario") que la voz de PROHIBITED_WORD_VOICE prohíbe.
const PROMPT =
  "Escribe una publicación corta para Instagram promocionando el café de " +
  "especialidad de mi cafetería. Resalta el sabor y el ambiente, con un " +
  "cierre que invite a visitarnos.";

const resolveModel = createModelResolver(process.env, process.env.AI_MODEL ?? DEFAULT_MODEL_ID);

function findRepoRoot(start: string): string {
  let dir = start;
  while (!existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("No encontré la raíz del repo (pnpm-workspace.yaml)");
    dir = parent;
  }
  return dir;
}

interface RunOutcome {
  index: number;
  text: string;
  violatesRule: boolean;
  error?: string;
}

async function main(): Promise<void> {
  const modelId = process.env.AI_SUITE_PROHIBITED_MODEL ?? process.env.AI_MODEL ?? DEFAULT_MODEL_ID;
  const runsRaw = Number(process.env.AI_SUITE_PROHIBITED_RUNS ?? 20);
  const runs = Number.isInteger(runsRaw) && runsRaw > 0 ? runsRaw : 20;
  const delayRaw = Number(process.env.AI_SUITE_DELAY_MS ?? 10_000);
  const delayMs = Number.isFinite(delayRaw) && delayRaw >= 0 ? delayRaw : 10_000;

  const model = resolveModel(modelId);
  const system = buildSystemPrompt(PROHIBITED_WORD_VOICE.voice);
  const bannedTerms = PROHIBITED_WORD_VOICE.voice.bannedExpressions.map(normalizeExpression);

  console.log(
    `▶ ${runs} generaciones con \`${modelId}\`, voz "${PROHIBITED_WORD_VOICE.label}", ` +
      `prohibido: ${PROHIBITED_WORD_VOICE.voice.bannedExpressions.join(", ")}`,
  );

  const outcomes: RunOutcome[] = [];
  for (let i = 1; i <= runs; i++) {
    console.log(`  · corrida ${i}/${runs}...`);
    try {
      const result = await generateText({ model, system, prompt: PROMPT });
      const normalizedText = normalizeExpression(result.text);
      const violatesRule = bannedTerms.some((term) => normalizedText.includes(term));
      outcomes.push({ index: i, text: result.text, violatesRule });
    } catch (error) {
      outcomes.push({
        index: i,
        text: "",
        violatesRule: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (i < runs) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  const violations = outcomes.filter((o) => o.violatesRule);
  const errors = outcomes.filter((o) => o.error);
  const passed = violations.length === 0;

  console.log(
    `\n${passed ? "✔ PASA" : "✘ FALLA"} — ${violations.length}/${runs} generaciones usaron ` +
      "un término prohibido" +
      (errors.length > 0 ? ` (${errors.length} corridas con error, no cuentan)` : ""),
  );

  const date = new Date().toISOString().slice(0, 10);
  const lines: string[] = [
    `# Suite "voz de marca prohibida" — ${date}`,
    "",
    `Modelo: \`${modelId}\`. Voz: \`${PROHIBITED_WORD_VOICE.id}\` (${PROHIBITED_WORD_VOICE.label}).`,
    `Prohibido: ${PROHIBITED_WORD_VOICE.voice.bannedExpressions.join(", ")}.`,
    `Prompt (${String(runs)} corridas idénticas):`,
    "",
    `> ${PROMPT}`,
    "",
    `## Resultado: ${passed ? "✔ PASA" : "✘ FALLA"}`,
    "",
    `${violations.length}/${runs} generaciones usaron un término prohibido.` +
      (errors.length > 0
        ? ` ${errors.length} corridas fallaron con error (excluidas del conteo).`
        : ""),
    "",
  ];

  for (const outcome of outcomes) {
    lines.push(
      `### Corrida ${outcome.index}${outcome.violatesRule ? " ⚠️ VIOLÓ LA REGLA" : ""}`,
      "",
    );
    if (outcome.error) {
      lines.push(`**Error:** \`${outcome.error}\``, "");
    } else {
      lines.push(outcome.text.trim() || "*(sin texto)*", "");
    }
  }

  const repoRoot = findRepoRoot(process.cwd());
  const outDir = path.join(repoRoot, "docs", "reference", "suite-cultural");
  await mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, `${date}-reporte-voz-prohibida.md`);
  await writeFile(outFile, lines.join("\n"), "utf8");
  console.log(`✔ Reporte: ${path.relative(repoRoot, outFile)}`);

  if (!passed) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
