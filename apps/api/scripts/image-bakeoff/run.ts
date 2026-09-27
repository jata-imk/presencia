// Bake-off de generadores de imagen (F10, ADR-025).
//
// Corre los mismos prompts —escritos como los escribiría el chat para un
// creator mexicano— contra cada modelo, con el MISMO adapter de producción
// (AiSdkImageProvider), y deja las imágenes en disco y un reporte markdown con
// latencia, tokens y bloqueos. El juicio de calidad es humano: el reporte deja
// el espacio para anotarlo.
//
// Uso: pnpm --filter @presencia/api bakeoff:imagenes
// IMAGE_BAKEOFF_MODELS="google:x,openai:y" cambia los modelos.
// IMAGE_BAKEOFF_PROMPTS="id1,id2" re-corre solo esos prompts.
//
// Cuesta dinero de verdad (~$0.15 por prompt con los 3 modelos default). Las
// imágenes NO se versionan (pesan MB): caen en scripts/image-bakeoff/out/, que
// está en .gitignore. El reporte sí, en docs/reference/bakeoff-imagenes/.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createImageModelResolver } from "../../src/ai/provider-registry.js";
import { AiSdkImageProvider } from "../../src/images/ai-sdk-image.provider.js";
import type { ImageAspectRatio, ImageRequest } from "../../src/images/image-provider.js";

const DEFAULT_MODELS = [
  "google:gemini-3.1-flash-image",
  "google:gemini-3.1-flash-lite-image",
  "openai:gpt-image-1.5",
];

interface BakeoffPrompt {
  id: string;
  aspectRatio: ImageAspectRatio;
  prompt: string;
  /** Si está, se edita la imagen que produjo ese prompt con esta instrucción. */
  editOf?: string;
}

// La regla de estilo por defecto de F10 (plan, decisión 4) va en cada prompt:
// fotográfico, natural, sin texto dentro de la imagen, ambientado en México.
const ESTILO =
  "Fotografía natural y realista, luz cálida, ambientada en México. Sin texto, letras ni logotipos dentro de la imagen.";

const PROMPTS: BakeoffPrompt[] = [
  {
    id: "marquesitas",
    aspectRatio: "4:5",
    prompt: `Un puesto de marquesitas en el Paseo de Montejo de Mérida al atardecer, con el vendedor preparando una marquesita con queso de bola. ${ESTILO}`,
  },
  {
    id: "cafe-centro",
    aspectRatio: "4:5",
    prompt: `Taza de café de olla sobre una mesa de madera en una cafetería del centro histórico de Mérida, paredes de colores y mosaico de pasta al fondo. ${ESTILO}`,
  },
  {
    id: "nutriologa",
    aspectRatio: "1:1",
    prompt: `Plato de desayuno saludable mexicano: chilaquiles verdes horneados con pollo, aguacate y frijoles, vista cenital, para una nutrióloga. ${ESTILO}`,
  },
  {
    id: "inmobiliaria",
    aspectRatio: "4:5",
    prompt: `Fachada de una casa colonial restaurada en el barrio de Santiago en Mérida, con puerta de madera y herrería, cielo despejado. ${ESTILO}`,
  },
  {
    id: "gym",
    aspectRatio: "4:5",
    prompt: `Mujer de 30 años entrenando con mancuernas en un gimnasio pequeño de barrio, energía y esfuerzo, sin marcas de ropa visibles. ${ESTILO}`,
  },
  {
    id: "linkedin-equipo",
    aspectRatio: "1:1",
    prompt: `Equipo pequeño de una agencia de marketing en Monterrey conversando alrededor de una laptop en una oficina luminosa. ${ESTILO}`,
  },
  {
    id: "x-cenote",
    aspectRatio: "16:9",
    prompt: `Cenote de Yucatán visto desde arriba con agua turquesa y raíces colgando, una persona flotando. ${ESTILO}`,
  },
  {
    id: "texto-en-imagen",
    aspectRatio: "1:1",
    // Control negativo a propósito: pide texto, que es lo que el producto
    // decidió NO pedirle al modelo. Mide qué tan mal (o bien) lo hace cada uno.
    prompt:
      "Cartel de promoción de una taquería que diga exactamente 'MARTES DE 2X1 EN TACOS DE COCHINITA', estilo cartel pintado a mano mexicano.",
  },
  {
    id: "marquesitas-calida",
    aspectRatio: "4:5",
    editOf: "marquesitas",
    prompt:
      "Hazla más cálida y quita a las personas del fondo; conserva el puesto y la composición.",
  },
  {
    id: "cafe-minimalista",
    aspectRatio: "4:5",
    editOf: "cafe-centro",
    prompt:
      "Cambia el fondo por una pared lisa color terracota, estilo minimalista; conserva la taza.",
  },
];

// pnpm --filter corre el script con apps/api como cwd.
const OUT_DIR = path.resolve("scripts/image-bakeoff/out");
const REPORT_DIR = path.resolve("../../docs/reference/bakeoff-imagenes");

function extension(mediaType: string) {
  return mediaType.split("/")[1]?.replace("jpeg", "jpg") ?? "bin";
}

async function main() {
  const models = (process.env.IMAGE_BAKEOFF_MODELS?.split(",") ?? DEFAULT_MODELS).map((m) =>
    m.trim(),
  );
  const only = process.env.IMAGE_BAKEOFF_PROMPTS?.split(",").map((p) => p.trim());
  // Una edición necesita su base: pedir solo "marquesitas-calida" corre
  // también "marquesitas", o la edición no tendría qué editar.
  const bases = PROMPTS.filter((p) => only?.includes(p.id) && p.editOf).map((p) => p.editOf);
  const prompts = only
    ? PROMPTS.filter(
        (p) => only.includes(p.id) || bases.includes(p.id) || only.includes(p.editOf ?? ""),
      )
    : PROMPTS;
  const resolve = createImageModelResolver(process.env);
  const fecha = new Date().toISOString().slice(0, 10);
  const rows: string[] = [];

  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(REPORT_DIR, { recursive: true });

  for (const modelId of models) {
    const provider = new AiSdkImageProvider(resolve(modelId), modelId);
    const slug = modelId.replace(/[:/]/g, "_");
    const producidas = new Map<string, { file: string; mediaType: string }>();

    for (const p of prompts) {
      const request: ImageRequest = { prompt: p.prompt, aspectRatio: p.aspectRatio };
      if (p.editOf) {
        const base = producidas.get(p.editOf);
        if (!base) {
          rows.push(
            `| ${modelId} | ${p.id} | — | — | — | sin base (${p.editOf} no produjo imagen) |`,
          );
          continue;
        }
        request.reference = { data: await readFile(base.file), mediaType: base.mediaType };
      }

      const arranque = Date.now();
      try {
        const result = await provider.generate(request);
        const segundos = ((Date.now() - arranque) / 1000).toFixed(1);
        if (result.kind === "blocked") {
          rows.push(`| ${modelId} | ${p.id} | ${segundos} s | — | — | **bloqueada** |`);
          console.log(`[${modelId}] ${p.id}: bloqueada (${segundos} s)`);
          continue;
        }
        const file = path.join(OUT_DIR, `${fecha}_${slug}_${p.id}.${extension(result.mediaType)}`);
        await writeFile(file, result.data);
        producidas.set(p.id, { file, mediaType: result.mediaType });
        const kb = Math.round(result.data.byteLength / 1024);
        const tokens = `${result.usage.inputTokens ?? "?"} / ${result.usage.outputTokens ?? "?"}`;
        rows.push(`| ${modelId} | ${p.id} | ${segundos} s | ${tokens} | ${kb} KB | |`);
        console.log(`[${modelId}] ${p.id}: ok ${segundos} s, ${kb} KB`);
      } catch (error) {
        const segundos = ((Date.now() - arranque) / 1000).toFixed(1);
        const mensaje =
          error instanceof Error ? error.message.replace(/\|/g, "/").slice(0, 160) : String(error);
        rows.push(`| ${modelId} | ${p.id} | ${segundos} s | — | — | error: ${mensaje} |`);
        console.error(`[${modelId}] ${p.id}: error`, error);
      }
    }
  }

  const report = [
    `# Bake-off de generadores de imagen — ${fecha}`,
    "",
    "Generado por `apps/api/scripts/image-bakeoff/run.ts` (ADR-025). Las imágenes quedan en",
    "`apps/api/scripts/image-bakeoff/out/` (no versionadas).",
    "",
    "| Modelo | Prompt | Latencia | Tokens in / out | Peso | Notas |",
    "|---|---|---|---|---|---|",
    ...rows,
    "",
    "## Prompts",
    "",
    ...prompts.map(
      (p) =>
        `- **${p.id}** (${p.aspectRatio}${p.editOf ? `, edita ${p.editOf}` : ""}): ${p.prompt}`,
    ),
    "",
  ].join("\n");
  // Nunca pisa un reporte: el de una corrida completa es la evidencia que cita
  // ADR-025, y una re-corrida parcial del mismo día lo reemplazaría con una
  // tabla a medias. Cada corrida lleva su hora.
  const hora = new Date().toISOString().slice(11, 16).replace(":", "");
  const parcial = only ? "-parcial" : "";
  const reportFile = path.join(REPORT_DIR, `${fecha}-${hora}-reporte${parcial}.md`);
  await writeFile(reportFile, report, { flag: "wx" });
  console.log(`\nReporte: ${reportFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
