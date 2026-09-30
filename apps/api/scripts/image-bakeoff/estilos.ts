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

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { IMAGE_STYLES } from "@presencia/shared";
import { createImageModelResolver } from "../../src/ai/provider-registry.js";
import { AiSdkImageProvider } from "../../src/images/ai-sdk-image.provider.js";
import { composeImagePrompt } from "../../src/images/image-prompt.js";

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

async function main() {
  const modelId =
    process.env.IMAGE_ESTILOS_MODEL ??
    process.env.AI_MODEL_IMAGE ??
    "google:gemini-3.1-flash-image";
  const only = process.env.IMAGE_ESTILOS?.split(",").map((s) => s.trim());
  const estilos = IMAGE_STYLES.filter((s) => !only || only.includes(s.id));
  const provider = new AiSdkImageProvider(createImageModelResolver(process.env)(modelId), modelId);
  await mkdir(OUT_DIR, { recursive: true });

  const fallas: string[] = [];
  for (const estilo of estilos) {
    for (const [escena, descripcion] of Object.entries(ESCENAS)) {
      const nombre = `${estilo.id}-${escena}`;
      const prompt = composeImagePrompt(descripcion, null, estilo.id);
      const arranque = Date.now();
      try {
        const result = await provider.generate({ prompt, aspectRatio: "4:5" });
        if (result.kind === "blocked") {
          fallas.push(`${nombre}: bloqueada`);
          continue;
        }
        const webp = await sharp(result.data)
          .resize({ width: 600, height: 750, fit: "cover" })
          .webp({ quality: 72 })
          .toBuffer();
        await writeFile(path.join(OUT_DIR, `${nombre}.webp`), webp);
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
