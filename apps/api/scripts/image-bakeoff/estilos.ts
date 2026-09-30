// Ejemplos de la galería de "Estilo visual" (F10.6, Configuración).
//
// Genera la MISMA escena en cada estilo, más tres escenas por estilo para el
// detalle (comida, persona, producto), con el generador de producción y el
// prompt compuesto de verdad (composeImagePrompt): lo que se ve en la galería
// es lo que el creator va a obtener. De paso es el mini bake-off de los textos
// de estilo: si uno no dibuja lo que promete, se corrige su `prompt` en
// packages/shared/src/image-styles.ts y se vuelve a correr.
//
// Uso: pnpm --filter @presencia/api estilos:imagenes
// IMAGE_ESTILOS="neo,3d" regenera solo esos estilos.
// IMAGE_ESTILOS_MODEL cambia el modelo (default: el de AI_MODEL_IMAGE o Gemini).
//
// Cuesta dinero de verdad: 28 imágenes ≈ $1.75 con Gemini 3.1 Flash Image. Las
// imágenes SÍ se versionan (son parte de la app), comprimidas a webp de ~600 px.
//
// De cada imagen queda además:
// - su entrada en `manifest.json` (junto a los webp, versionado): el prompt
//   EXACTO que se mandó, el modelo y la fecha. Sin él, saber qué produjo un
//   ejemplo dependería de reconstruir el prompt con el código de ese commit, y
//   comparar generadores sería adivinar.
// - el original en tamaño completo en scripts/image-bakeoff/out/estilos/
//   (gitignored, ~1-2 MB cada uno): solo en la máquina que lo corrió.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { IMAGE_STYLES } from "@presencia/shared";
import { createImageModelResolver } from "../../src/ai/provider-registry.js";
import { AiSdkImageProvider } from "../../src/images/ai-sdk-image.provider.js";
import { composeImagePrompt } from "../../src/images/image-prompt.js";
import { registrarGasto, splitModelId } from "../gasto-local.js";

/** Las escenas, descritas como las escribiría el chat en F10.6: el QUÉ, sin estilo. */
const ESCENAS = {
  base: "Una taza de café de olla y un pan dulce sobre una mesa, en una cafetería del centro de Mérida.",
  comida:
    "Tres tacos de cochinita pibil con cebolla morada y habanero en un plato, sobre una mesa.",
  persona:
    "Una emprendedora joven trabajando en su laptop en un escritorio con plantas, sonriendo.",
  producto:
    "Una botella de agua reutilizable junto a unos audífonos inalámbricos sobre una superficie.",
} as const;

// pnpm --filter corre el script con apps/api como cwd.
const OUT_DIR = path.resolve("../web/public/assets/estilos");
const ORIGINALES_DIR = path.resolve("scripts/image-bakeoff/out/estilos");
const MANIFEST = path.join(OUT_DIR, "manifest.json");

interface EntradaDeManifest {
  estilo: string;
  escena: string;
  modelo: string;
  generadaEl: string;
  prompt: string;
}

async function leerManifest(): Promise<Record<string, EntradaDeManifest>> {
  try {
    return JSON.parse(await readFile(MANIFEST, "utf8")) as Record<string, EntradaDeManifest>;
  } catch {
    return {};
  }
}

const EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

async function main() {
  const modelId =
    process.env.IMAGE_ESTILOS_MODEL ??
    process.env.AI_MODEL_IMAGE ??
    "google:gemini-3.1-flash-image";
  const only = process.env.IMAGE_ESTILOS?.split(",").map((s) => s.trim());
  const estilos = IMAGE_STYLES.filter((s) => !only || only.includes(s.id));
  const provider = new AiSdkImageProvider(createImageModelResolver(process.env)(modelId), modelId);
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(ORIGINALES_DIR, { recursive: true });
  // Se fusiona con lo que ya había: correr un solo estilo no borra los demás.
  const manifest = await leerManifest();

  const fallas: string[] = [];
  for (const estilo of estilos) {
    for (const [escena, descripcion] of Object.entries(ESCENAS)) {
      const nombre = `${estilo.id}-${escena}`;
      const prompt = composeImagePrompt(descripcion, null, estilo.id);
      const arranque = Date.now();
      try {
        const result = await provider.generate({ prompt, aspectRatio: "4:5" });
        if (result.usage) {
          await registrarGasto({
            script: "estilos",
            ...splitModelId(modelId),
            task: "image_generate",
            inputTokens: result.usage.inputTokens ?? 0,
            outputTokens: result.usage.outputTokens ?? 0,
            imagesCount: result.kind === "blocked" ? 0 : 1,
          });
        }
        if (result.kind === "blocked") {
          fallas.push(`${nombre}: bloqueada`);
          continue;
        }
        const webp = await sharp(result.data)
          .resize({ width: 600, height: 750, fit: "cover" })
          .webp({ quality: 72 })
          .toBuffer();
        await writeFile(path.join(OUT_DIR, `${nombre}.webp`), webp);
        const ext = EXTENSION[result.mediaType] ?? "bin";
        await writeFile(path.join(ORIGINALES_DIR, `${nombre}.${ext}`), result.data);
        manifest[nombre] = {
          estilo: estilo.id,
          escena,
          modelo: modelId,
          generadaEl: new Date().toISOString(),
          prompt,
        };
        // Después de cada imagen y no al final: si la corrida se cae a medias
        // (el 402 de saldo agotado pasó), lo generado queda registrado.
        await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
        const segundos = ((Date.now() - arranque) / 1000).toFixed(1);
        console.log(`${nombre}: ok ${segundos} s, ${Math.round(webp.byteLength / 1024)} KB`);
      } catch (error) {
        fallas.push(`${nombre}: ${error instanceof Error ? error.message : String(error)}`);
        console.error(`${nombre}: error`, error);
      }
    }
  }
  if (fallas.length > 0) {
    console.error(`\nFallaron ${String(fallas.length)}:\n${fallas.join("\n")}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
