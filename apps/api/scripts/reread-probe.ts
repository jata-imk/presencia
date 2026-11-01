// Sonda de F10.11 (ADR-029, en construcción): ¿cómo aceptan los modelos de la
// cadena una imagen o un PDF escaneado que vuelve como resultado de una tool?
//
// El AI SDK ya lo mapea en los tres adapters (OpenAI: `function_call_output`
// con `input_image`/`input_file`; Google: `functionResponse.parts`; Anthropic:
// `tool_result` con `image`/`document`), pero que el SDK lo arme no dice que
// la API lo acepte. Y en la cadena del chat un 400 no cae al respaldo
// (ai/fallback.ts): si un solo modelo lo rechaza, el turno muere justo cuando
// responde ese modelo.
//
// Corre el loop de verdad (el modelo llama la tool, `toModelOutput` arma lo
// que ve) por la cadena del chat, con y sin el respaldo forzado, en cuatro
// caminos:
//  - `usuario`: la referencia, la misma imagen en un mensaje del creator (lo
//    que el chat hace hoy dentro de la ventana);
//  - `tool`: camino (a), la imagen dentro del resultado de la tool;
//  - `inyectar`: plan B del camino (a), la tool contesta texto y `prepareStep`
//    mete la imagen como un mensaje del creator en el paso siguiente;
//  - `subllamada`: camino (b), la tool le pregunta a un modelo utility que sí
//    ve la imagen y devuelve su respuesta como texto.
//
// Uso: pnpm --filter @presencia/api sonda:releer
// La cadena sale de AI_MODEL_CHAT y la utility de AI_MODEL_UTILITY (los mismos
// del .env). AI_PROBE_VARIANTS="ninguno;openai;openai,google" elige qué caídas
// se fingen (default: las tres; la utility cae igual que en producción, porque son
// los mismos proveedores), AI_PROBE_RUNS cuántas veces corre cada caso (default 1)
// y AI_PROBE_MODES="usuario,tool,inyectar,subllamada" qué caminos (default: todos).
// Reporte en docs/reference/releer-adjuntos/.

import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import {
  generateText,
  stepCountIs,
  tool,
  type LanguageModelUsage,
  type ModelMessage,
  type ToolSet,
} from "ai";
import { z } from "zod";
import { processAttachment } from "../src/attachments/attachment-content.js";
import { createFallbackChain } from "../src/ai/fallback.js";
import { costOf } from "../src/ai/model-prices.js";
import {
  createModelResolver,
  DEFAULT_MODEL_ID,
  formatModelEntry,
  parseModelChain,
  type ModelEntry,
} from "../src/ai/provider-registry.js";
import { chargeUsageOf, quoteChatTurn } from "../src/credits/rate-card.js";
import { scannedNotice, storefront } from "./cultural-suite/reread-fixtures.js";
import { registrarGasto, splitModelId } from "./gasto-local.js";
import { findRepoRoot } from "./repo-root.js";

const TOOL_NAME = "ver_adjunto";

const resolveModel = createModelResolver(process.env, process.env.AI_MODEL ?? DEFAULT_MODEL_ID);

type Mode = "usuario" | "tool" | "inyectar" | "subllamada";
const MODES: Mode[] = ["usuario", "tool", "inyectar", "subllamada"];

interface Fixture {
  id: string;
  filename: string;
  mediaType: string;
  data: Uint8Array;
  /** Lo que viaja cuando el adjunto ya salió de la ventana: no trae el dato. */
  description: string;
  question: string;
  /** Lo que una respuesta correcta tiene que decir (sin espacios ni mayúsculas). */
  expected: string;
  premise: string;
}

// --- Fixtures (los archivos viven en cultural-suite/reread-fixtures.ts) ---

/** La fachada de un café con un cartel chico: el código solo se lee de cerca. */
async function fachada(): Promise<Fixture> {
  const png = await storefront();
  const processed = await processAttachment(png, "fachada.png");
  if (processed.kind !== "image" || !processed.modelData) {
    throw new Error("La fachada tenía que salir como imagen con variante para el modelo");
  }
  return {
    id: "imagen",
    filename: "fachada.png",
    mediaType: processed.mimeType,
    data: processed.modelData,
    description:
      "Foto de la fachada verde del Café La Ceiba, con su nombre en letras grandes arriba, una puerta, una ventana y un cartel blanco pequeño en la esquina inferior derecha.",
    question:
      "¿Qué código de promo dice el cartel chiquito de la esquina, en la foto de mi fachada que te mandé hace rato?",
    expected: "MANGO-47",
    premise: `imagen ${String(processed.width)}×${String(processed.height)}, el modelo la ve a la variante de 1568 px`,
  };
}

/** Un aviso escaneado: una página que es solo una imagen, con un folio en letra chica. */
async function avisoEscaneado(): Promise<Fixture> {
  const pdf = await scannedNotice();
  const processed = await processAttachment(pdf, "aviso.pdf");
  if (processed.kind !== "pdf" || !processed.scanned) {
    throw new Error("El aviso tenía que salir como PDF escaneado");
  }
  return {
    id: "pdf-escaneado",
    filename: "aviso.pdf",
    mediaType: "application/pdf",
    data: pdf,
    description:
      "Aviso escaneado de una página del Café La Ceiba para sus proveedores: las entregas de leche y pan cambian de horario a partir del lunes. Abajo trae una línea en letra chica.",
    question: "En el aviso para proveedores que te mandé, ¿qué folio trae la letra chica de abajo?",
    expected: "PX-2291",
    premise: `PDF escaneado de ${String(processed.pages)} página (sin texto: viaja nativo)`,
  };
}

// --- Una corrida ------------------------------------------------------------

const SYSTEM =
  "Eres Presencia, el asistente de contenido de un creator mexicano. Tuteas y hablas español " +
  "de México. Los adjuntos de turnos anteriores llegan como una línea con su descripción. Si el " +
  `creator pregunta por un detalle que la descripción no trae, llama ${TOOL_NAME} para volver a ` +
  "ver el adjunto; nunca inventes lo que no ves. Contesta corto.";

interface RunResult {
  mode: Mode;
  fixture: string;
  variant: string;
  ran: string;
  ok: boolean;
  error: string | null;
  called: boolean;
  correct: boolean;
  steps: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  units: number;
  usd: number | null;
  subInputTokens: number;
  subUnits: number;
  subUsd: number | null;
  subError: string | null;
  ms: number;
  warnings: string[];
  answer: string;
}

function normalize(text: string): string {
  return text.replace(/[\s‐-―-]/g, "").toUpperCase();
}

function userWithFile(text: string, fixture: Fixture): ModelMessage {
  return {
    role: "user",
    content: [
      { type: "text", text },
      { type: "file", mediaType: fixture.mediaType, data: fixture.data },
    ],
  };
}

function usageCost(entry: ModelEntry, usage: LanguageModelUsage): number | null {
  const { provider, model } = splitModelId(entry.id);
  return costOf({
    provider,
    model,
    inputTokens: usage.inputTokens ?? 0,
    cachedInputTokens: usage.inputTokenDetails.cacheReadTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
  });
}

async function runOnce(
  mode: Mode,
  fixture: Fixture,
  chatEntries: ModelEntry[],
  utilityEntries: ModelEntry[],
  variant: string,
): Promise<RunResult> {
  const simulateDown = variant === "ninguno" ? [] : variant.split(",");
  const chain = createFallbackChain(
    chatEntries.map((entry) => ({
      entry,
      model: resolveModel(formatModelEntry(entry)) as LanguageModelV4,
    })),
    { simulateDown },
  );
  const sub = { inputTokens: 0, units: 0, usd: 0 as number | null, error: null as string | null };
  let injected = false;

  const verAdjunto = tool({
    description:
      "Vuelve a ver un adjunto que el creator mandó antes en este chat (una imagen, un PDF o un " +
      "archivo), cuando su descripción no trae el detalle que necesitas. Recibe el nombre del archivo" +
      (mode === "subllamada" ? " y la pregunta concreta que quieres responder." : "."),
    inputSchema: z.object({
      adjunto: z.string().describe("El nombre del archivo, tal como aparece en su línea."),
      pregunta: z
        .string()
        .optional()
        .describe("Solo si te lo pide: qué quieres saber del adjunto."),
    }),
    execute: async ({ pregunta }) => {
      if (mode !== "subllamada") return { estado: "ok", nombre: fixture.filename };
      // Camino (b): un modelo utility mira el archivo y contesta solo la pregunta.
      const utility = createFallbackChain(
        utilityEntries.map((entry) => ({
          entry,
          model: resolveModel(formatModelEntry(entry)) as LanguageModelV4,
        })),
        { simulateDown },
      );
      // Si la subllamada truena, el SDK se lo devuelve al modelo como un error
      // de la tool y el turno sigue: se guarda aquí para que el reporte no lo
      // confunda con un modelo que contestó mal.
      const answer = await generateText({
        model: utility.model,
        system:
          "Miras un archivo que un creator mandó y contestas una pregunta sobre él, en español, en una " +
          "o dos frases. Copia los datos tal cual. Si no se alcanza a leer, dilo; no inventes.",
        messages: [userWithFile(pregunta ?? "Describe con detalle qué dice el archivo.", fixture)],
        maxOutputTokens: 300,
      }).catch((error: unknown) => {
        sub.error = (error instanceof Error ? error.message : String(error))
          .replace(/\s+/g, " ")
          .slice(0, 300);
        throw error;
      });
      sub.inputTokens += answer.usage.inputTokens ?? 0;
      sub.units += quoteChatTurn(chargeUsageOf(answer.usage), "content_digest");
      const cost = usageCost(utility.ran, answer.usage);
      sub.usd = sub.usd === null || cost === null ? null : sub.usd + cost;
      await registrarGasto({
        script: "sonda-releer",
        ...splitModelId(utility.ran.id),
        task: "chat",
        inputTokens: answer.usage.inputTokens ?? 0,
        outputTokens: answer.usage.outputTokens ?? 0,
      });
      return { estado: "ok", nombre: fixture.filename, respuesta: answer.text };
    },
    toModelOutput: ({ output }) => {
      const out = output as { respuesta?: string };
      if (mode === "tool") {
        return {
          type: "content",
          value: [
            { type: "text", text: `[Volviste a ver "${fixture.filename}"]` },
            {
              type: "file",
              mediaType: fixture.mediaType,
              data: { type: "data", data: fixture.data },
            },
          ],
        };
      }
      if (mode === "inyectar") {
        return {
          type: "text",
          value: `[Volviste a ver "${fixture.filename}": va en el mensaje siguiente]`,
        };
      }
      return {
        type: "text",
        value: `[Lo que se ve en "${fixture.filename}": ${out.respuesta ?? "sin respuesta"}]`,
      };
    },
  });
  const tools: ToolSet = { [TOOL_NAME]: verAdjunto };

  const digestLine = `[Adjunto de antes (${fixture.mediaType.startsWith("image/") ? "imagen" : "PDF"} "${fixture.filename}"): ${fixture.description} Si necesitas el detalle, vuelve a verlo con ${TOOL_NAME}.]`;
  const messages: ModelMessage[] =
    mode === "usuario"
      ? [userWithFile(fixture.question, fixture)]
      : [{ role: "user", content: `${digestLine}\n\n${fixture.question}` }];

  const started = Date.now();
  const warnings: string[] = [];
  try {
    const result = await generateText({
      model: chain.model,
      system: SYSTEM,
      messages,
      tools: mode === "usuario" ? undefined : tools,
      stopWhen: stepCountIs(4),
      // El paso 0 obliga a llamar la tool: lo que se mide es el formato, no si
      // el modelo decide releer (eso es la suite). Sonnet 5.5 rechaza una
      // tool forzada (F10.10): el SDK la manda con `auto` y lo avisa, y la
      // instrucción del prompt hace el resto.
      prepareStep: ({ stepNumber, messages: stepMessages }) => {
        if (mode === "usuario") return undefined;
        if (stepNumber === 0) return { toolChoice: { type: "tool", toolName: TOOL_NAME } };
        if (mode === "inyectar" && !injected) {
          injected = true;
          return {
            messages: [
              ...stepMessages,
              userWithFile(`[El adjunto "${fixture.filename}" que volviste a ver]`, fixture),
            ],
          };
        }
        return undefined;
      },
    });
    for (const step of result.steps) {
      for (const warning of step.warnings ?? []) warnings.push(JSON.stringify(warning));
    }
    const usage = result.totalUsage;
    await registrarGasto({
      script: "sonda-releer",
      ...splitModelId(chain.ran.id),
      task: "chat",
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
    });
    const usd = usageCost(chain.ran, usage);
    return {
      mode,
      fixture: fixture.id,
      variant,
      ran: chain.ran.id,
      ok: true,
      error: null,
      called: result.steps.some((step) => step.toolCalls.some((c) => c.toolName === TOOL_NAME)),
      correct: normalize(result.text).includes(normalize(fixture.expected)),
      steps: result.steps.length,
      inputTokens: usage.inputTokens ?? 0,
      cachedInputTokens: usage.inputTokenDetails.cacheReadTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      units: quoteChatTurn(chargeUsageOf(usage), "chat"),
      usd,
      subInputTokens: sub.inputTokens,
      subUnits: sub.units,
      subUsd: sub.usd,
      subError: sub.error,
      ms: Date.now() - started,
      warnings,
      answer: result.text.replace(/\s+/g, " ").trim().slice(0, 240),
    };
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    const message = error instanceof Error ? error.message : String(error);
    return {
      mode,
      fixture: fixture.id,
      variant,
      ran: chain.ran.id,
      ok: false,
      error: `${status ? `${String(status)}: ` : ""}${message}`.replace(/\s+/g, " ").slice(0, 400),
      called: false,
      correct: false,
      steps: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      units: 0,
      usd: null,
      subInputTokens: sub.inputTokens,
      subUnits: sub.units,
      subUsd: sub.usd,
      subError: sub.error,
      ms: Date.now() - started,
      warnings,
      answer: "",
    };
  }
}

// --- Reporte ----------------------------------------------------------------

function money(usd: number | null): string {
  return usd === null ? "—" : `$${usd.toFixed(5)}`;
}

function report(
  results: RunResult[],
  fixtures: Fixture[],
  chat: string,
  utility: string,
  runs: number,
): string {
  const lines: string[] = [
    `# Sonda de releer adjuntos — ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
    "",
    "Generado por `pnpm --filter @presencia/api sonda:releer` (`apps/api/scripts/reread-probe.ts`).",
    "",
    `- Cadena del chat: \`${chat}\``,
    `- Cadena utility (camino b): \`${utility}\``,
    `- Corridas por caso: ${String(runs)}`,
    "- Unidades: rate card vigente (`chat` para el turno, `content_digest` para la subllamada).",
    "",
    "## Fixtures",
    "",
    ...fixtures.map(
      (f) => `- **${f.id}** (\`${f.filename}\`): ${f.premise}. Dato a leer: \`${f.expected}\`.`,
    ),
    "",
    "## Resumen por camino, archivo y modelo que respondió",
    "",
    "| Camino | Archivo | Caída fingida | Respondió | OK | Llamó la tool | Correcta | Entrada (tokens) | Unidades turno | Unidades subllamada | USD total | ms |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  const groups = new Map<string, RunResult[]>();
  for (const r of results) {
    const key = [r.mode, r.fixture, r.variant].join("|");
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  for (const group of groups.values()) {
    const [first] = group;
    if (!first) continue;
    const n = group.length;
    const count = (pick: (r: RunResult) => boolean) =>
      `${String(group.filter(pick).length)}/${String(n)}`;
    // Los promedios, solo de las corridas que respondieron: una que truena no
    // gastó tokens del turno, y contarla como 0 bajaría el costo del camino.
    const ok = group.filter((r) => r.ok);
    const avg = (pick: (r: RunResult) => number) =>
      ok.length === 0 ? "—" : String(Math.round(ok.reduce((t, r) => t + pick(r), 0) / ok.length));
    const priced = ok.filter((r) => r.usd !== null && r.subUsd !== null);
    const usd =
      priced.length === 0
        ? null
        : priced.reduce((t, r) => t + (r.usd ?? 0) + (r.subUsd ?? 0), 0) / priced.length;
    lines.push(
      `| ${first.mode} | ${first.fixture} | ${first.variant} | ${[...new Set(group.map((r) => r.ran))].join(", ")} | ${count((r) => r.ok)} | ${first.mode === "usuario" ? "—" : count((r) => r.called)} | ${count((r) => r.correct)} | ${avg((r) => r.inputTokens)} | ${avg((r) => r.units)} | ${avg((r) => r.subUnits)} | ${money(usd)} | ${avg((r) => r.ms)} |`,
    );
  }
  lines.push("", "## Cada corrida", "");
  for (const r of results) {
    lines.push(
      `- **${r.mode} · ${r.fixture} · ${r.variant} → ${r.ran}**: ${r.ok ? `${r.correct ? "✅" : "❌"} ${String(r.steps)} pasos, ${String(r.inputTokens)} de entrada (${String(r.cachedInputTokens)} de caché), ${String(r.outputTokens)} de salida` : `💥 ${r.error ?? ""}`}`,
    );
    if (r.answer) lines.push(`  - Respuesta: "${r.answer}"`);
    if (r.subError) lines.push(`  - La subllamada falló: \`${r.subError}\``);
    for (const warning of r.warnings) lines.push(`  - Aviso del SDK: \`${warning.slice(0, 300)}\``);
  }
  lines.push(
    "",
    "## Veredicto (Jose)",
    "",
    "- [ ] Camino (a) confirmado / plan B / camino (b)",
    "",
  );
  return lines.join("\n");
}

async function main(): Promise<void> {
  const chat = process.env.AI_MODEL_CHAT ?? process.env.AI_MODEL ?? DEFAULT_MODEL_ID;
  const utility = process.env.AI_MODEL_UTILITY ?? process.env.AI_MODEL ?? DEFAULT_MODEL_ID;
  const chatEntries = parseModelChain(chat);
  const utilityEntries = parseModelChain(utility);
  const variants = (process.env.AI_PROBE_VARIANTS ?? "ninguno;openai;openai,google")
    .split(";")
    .map((v) => v.trim())
    .filter(Boolean);
  const runs = Number(process.env.AI_PROBE_RUNS ?? "1");
  if (!Number.isInteger(runs) || runs < 1) {
    throw new Error(
      `AI_PROBE_RUNS tiene que ser un entero ≥ 1, no "${process.env.AI_PROBE_RUNS ?? ""}"`,
    );
  }
  const modeFilter = process.env.AI_PROBE_MODES?.split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const unknown = modeFilter?.filter((m) => !(MODES as string[]).includes(m)) ?? [];
  if (unknown.length > 0) {
    throw new Error(`AI_PROBE_MODES no conoce ${unknown.join(", ")}; usa ${MODES.join(", ")}`);
  }
  const modes = modeFilter?.length ? MODES.filter((m) => modeFilter.includes(m)) : MODES;
  const fixtures = [await fachada(), await avisoEscaneado()];

  const results: RunResult[] = [];
  for (const variant of variants) {
    for (const fixture of fixtures) {
      for (const mode of modes) {
        for (let run = 0; run < runs; run++) {
          const result = await runOnce(mode, fixture, chatEntries, utilityEntries, variant);
          results.push(result);
          console.log(
            `${mode.padEnd(10)} ${fixture.id.padEnd(14)} ${variant.padEnd(14)} → ${result.ran.padEnd(30)} ${result.ok ? (result.correct ? "✅" : "❌") : `💥 ${result.error ?? ""}`}`,
          );
        }
      }
    }
  }

  const dir = path.join(findRepoRoot(process.cwd()), "docs/reference/releer-adjuntos");
  await mkdir(dir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  let file = path.join(dir, `${date}-sonda.md`);
  for (let n = 2; existsSync(file); n++) file = path.join(dir, `${date}-sonda-${String(n)}.md`);
  await writeFile(file, report(results, fixtures, chat, utility, runs), "utf8");
  console.log(`\nReporte: ${file}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
