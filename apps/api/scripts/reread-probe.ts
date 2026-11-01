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
// se fingen (default: las tres), y AI_PROBE_RUNS cuántas veces corre cada caso.
// Reporte en docs/reference/releer-adjuntos/.

import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
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
import { registrarGasto, splitModelId } from "./gasto-local.js";

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

// --- Fixtures -------------------------------------------------------------

/** La fachada de un café con un cartel chico: el código solo se lee de cerca. */
async function fachada(): Promise<Fixture> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="1536">
  <rect width="2048" height="1536" fill="#d9cdb4"/>
  <rect x="160" y="300" width="1728" height="1100" fill="#2f6b4f"/>
  <rect x="260" y="420" width="700" height="980" fill="#1d3b2c"/>
  <rect x="1060" y="420" width="700" height="560" fill="#9fc4d6"/>
  <text x="1024" y="230" font-family="Georgia, serif" font-size="150" font-weight="bold" fill="#2f2a22" text-anchor="middle">CAFÉ LA CEIBA</text>
  <rect x="1500" y="1150" width="330" height="170" fill="#fffdf5" stroke="#2f2a22" stroke-width="4"/>
  <text x="1665" y="1205" font-family="Arial, sans-serif" font-size="28" fill="#2f2a22" text-anchor="middle">Promo de la semana</text>
  <text x="1665" y="1255" font-family="Arial, sans-serif" font-size="30" font-weight="bold" fill="#2f2a22" text-anchor="middle">Código: MANGO-47</text>
  <text x="1665" y="1298" font-family="Arial, sans-serif" font-size="22" fill="#2f2a22" text-anchor="middle">en tu segundo frappé</text>
</svg>`;
  const png = new Uint8Array(await sharp(Buffer.from(svg)).png().toBuffer());
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
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1275" height="1650">
  <rect width="1275" height="1650" fill="#f4f1ea"/>
  <text x="637" y="200" font-family="Georgia, serif" font-size="64" font-weight="bold" fill="#222" text-anchor="middle">AVISO A PROVEEDORES</text>
  <text x="140" y="360" font-family="Georgia, serif" font-size="36" fill="#222">Las entregas de leche y pan cambian de horario.</text>
  <text x="140" y="420" font-family="Georgia, serif" font-size="36" fill="#222">A partir del lunes se reciben de 6:30 a 8:00.</text>
  <text x="140" y="1500" font-family="Arial, sans-serif" font-size="22" fill="#444">Vigente hasta el 30 de noviembre de 2026 · Folio PX-2291 · Café La Ceiba</text>
</svg>`;
  const jpeg = await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
  const meta = await sharp(jpeg).metadata();
  const pdf = scannedPdf(jpeg, meta.width ?? 1275, meta.height ?? 1650);
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

/** Un PDF de una página que es solo una imagen JPEG, armado a mano: no hay librería de PDF en el repo. */
function scannedPdf(jpeg: Buffer, width: number, height: number): Uint8Array {
  const parts: Buffer[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (chunk: Buffer | string) => {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk, "latin1") : chunk;
    parts.push(buffer);
    length += buffer.length;
  };
  const object = (body: () => void) => {
    offsets.push(length);
    body();
  };
  const content = "q 612 0 0 792 0 0 cm /Im0 Do Q";
  push("%PDF-1.4\n");
  object(() => push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"));
  object(() => push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"));
  object(() =>
    push(
      "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
        "/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    ),
  );
  object(() => {
    push(
      `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${String(width)} /Height ${String(height)} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${String(jpeg.length)} >>\nstream\n`,
    );
    push(jpeg);
    push("\nendstream\nendobj\n");
  });
  object(() =>
    push(
      `5 0 obj\n<< /Length ${String(content.length)} >>\nstream\n${content}\nendstream\nendobj\n`,
    ),
  );
  const xref = length;
  push(`xref\n0 ${String(offsets.length + 1)}\n0000000000 65535 f \n`);
  for (const offset of offsets) push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  push(
    `trailer\n<< /Size ${String(offsets.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`,
  );
  return new Uint8Array(Buffer.concat(parts));
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
  const sub = { inputTokens: 0, units: 0, usd: 0 as number | null };
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
      const answer = await generateText({
        model: utility.model,
        system:
          "Miras un archivo que un creator mandó y contestas una pregunta sobre él, en español, en una " +
          "o dos frases. Copia los datos tal cual. Si no se alcanza a leer, dilo; no inventes.",
        messages: [userWithFile(pregunta ?? "Describe con detalle qué dice el archivo.", fixture)],
        maxOutputTokens: 300,
      });
      sub.inputTokens += answer.usage.inputTokens ?? 0;
      sub.units += quoteChatTurn(chargeUsageOf(answer.usage), "content_digest");
      const cost = usageCost(utility.ran, answer.usage);
      sub.usd = sub.usd === null || cost === null ? null : sub.usd + cost;
      void registrarGasto({
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
    void registrarGasto({
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
    const avg = (pick: (r: RunResult) => number) =>
      Math.round(group.reduce((total, r) => total + pick(r), 0) / n);
    const usd = group.every((r) => r.usd !== null && r.subUsd !== null)
      ? group.reduce((total, r) => total + (r.usd ?? 0) + (r.subUsd ?? 0), 0) / n
      : null;
    lines.push(
      `| ${first.mode} | ${first.fixture} | ${first.variant} | ${[...new Set(group.map((r) => r.ran))].join(", ")} | ${count((r) => r.ok)} | ${first.mode === "usuario" ? "—" : count((r) => r.called)} | ${count((r) => r.correct)} | ${String(avg((r) => r.inputTokens))} | ${String(avg((r) => r.units))} | ${String(avg((r) => r.subUnits))} | ${money(usd)} | ${String(avg((r) => r.ms))} |`,
    );
  }
  lines.push("", "## Cada corrida", "");
  for (const r of results) {
    lines.push(
      `- **${r.mode} · ${r.fixture} · ${r.variant} → ${r.ran}**: ${r.ok ? `${r.correct ? "✅" : "❌"} ${String(r.steps)} pasos, ${String(r.inputTokens)} de entrada (${String(r.cachedInputTokens)} de caché), ${String(r.outputTokens)} de salida` : `💥 ${r.error ?? ""}`}`,
    );
    if (r.answer) lines.push(`  - Respuesta: "${r.answer}"`);
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
  const chat = process.env.AI_MODEL_CHAT ?? process.env.AI_MODEL ?? DEFAULT_MODEL_ID;
  const utility = process.env.AI_MODEL_UTILITY ?? process.env.AI_MODEL ?? DEFAULT_MODEL_ID;
  const chatEntries = parseModelChain(chat);
  const utilityEntries = parseModelChain(utility);
  const variants = (process.env.AI_PROBE_VARIANTS ?? "ninguno;openai;openai,google")
    .split(";")
    .map((v) => v.trim())
    .filter(Boolean);
  const runs = Number(process.env.AI_PROBE_RUNS ?? "1");
  const modeFilter = process.env.AI_PROBE_MODES?.split(",").map((m) => m.trim());
  const modes = modeFilter ? MODES.filter((m) => modeFilter.includes(m)) : MODES;
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
