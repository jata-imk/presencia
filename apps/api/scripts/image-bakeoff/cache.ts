import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseModelId } from "../../src/ai/provider-registry.js";
import type { ImageAspectRatio } from "../../src/images/image-provider.js";
import { imageCallOptions } from "../../src/images/image-models.js";

// Caché del bake-off (F10.7, idea de Jose): una imagen que ya se generó con el
// MISMO modelo, el MISMO prompt, la misma forma de pedirla (proporción,
// tamaño, calidad: imageCallOptions) y la misma variante —y, en una edición,
// a partir de la misma imagen— no se vuelve a pagar. Si cambia cualquiera de
// esas cosas, la huella cambia y se genera de nuevo: no se compara una imagen
// hecha con otro prompt u otra resolución como si fuera la misma prueba.
//
// Un bloqueo también se guarda: re-correrlo cobraría otra vez la entrada
// (Gemini cobra los tokens de un bloqueo) para, casi siempre, el mismo "no".
//
// Vive en out/cache/ (gitignored, como el resto de las imágenes). Para forzar
// imágenes nuevas aunque estén en caché: IMAGE_BAKEOFF_FRESH=1.

// pnpm --filter corre el script con apps/api como cwd.
export const OUT_ROOT = path.resolve("scripts/image-bakeoff/out");
const CACHE_DIR = path.join(OUT_ROOT, "cache");

export interface CacheKeyInput {
  model: string;
  prompt: string;
  aspectRatio: ImageAspectRatio;
  variant: number;
  /**
   * En una edición, la huella de la imagen de partida. La huella y no sus
   * bytes: los bytes salen de recortarla con sharp, y otra versión de sharp
   * los recodifica distinto aunque la imagen sea la misma.
   */
  baseKey?: string;
}

export interface CachedImage {
  model: string;
  promptId: string;
  variant: number;
  status: "ok" | "bloqueada";
  /** Solo con status "ok". */
  mediaType?: string;
  /** ISO: cuándo se generó y se pagó de verdad. */
  generatedAt: string;
  segundos: number;
  costUsd: number | null;
}

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** La huella de una imagen: todo lo que, si cambia, hace otra prueba. */
export function cacheKey(input: CacheKeyInput): string {
  const { provider, model } = parseModelId(input.model);
  return sha256(
    JSON.stringify({
      model: input.model,
      prompt: input.prompt,
      // Lo que de verdad viaja al proveedor: la proporción pedida (3:4 donde
      // no hay 4:5), el tamaño y la calidad, que viven en image-models.ts.
      options: imageCallOptions(provider, model, input.aspectRatio),
      variant: input.variant,
      base: input.baseKey ?? null,
    }),
  ).slice(0, 24);
}

/** La ficha y, si no fue un bloqueo, la imagen original (sin recortar). */
export async function readCached(
  key: string,
): Promise<{ meta: CachedImage; data: Uint8Array | null } | null> {
  try {
    const meta = JSON.parse(
      await readFile(path.join(CACHE_DIR, `${key}.json`), "utf8"),
    ) as CachedImage;
    if (meta.status !== "ok") return { meta, data: null };
    const data = new Uint8Array(await readFile(path.join(CACHE_DIR, `${key}.img`)));
    return { meta, data };
  } catch {
    return null;
  }
}

export async function writeCached(key: string, meta: CachedImage, data: Uint8Array | null) {
  await mkdir(CACHE_DIR, { recursive: true });
  if (data) await writeFile(path.join(CACHE_DIR, `${key}.img`), data);
  // La ficha al final: sin ella no hay entrada, así que una imagen a medio
  // escribir nunca se lee como buena.
  await writeFile(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(meta, null, 1));
}
