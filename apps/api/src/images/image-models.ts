import type { ImageAspectRatio } from "@presencia/shared";
import type { SharedV4ProviderOptions } from "@ai-sdk/provider";
import {
  DEFAULT_IMAGE_MODEL_ID,
  parseModelChain,
  type ProviderId,
} from "../ai/provider-registry.js";

// Lo que cambia entre generadores al pedir una imagen (ADR-025): cómo se
// pide la proporción y la resolución. Es dato del modelo, no del operador:
// vive en código, versionado, y el `.env` solo elige qué modelo corre.
//
// Resolución: 1K en todos (F10.7, decisión de Jose 2026-09-30). Instagram
// muestra 4:5 a 1080×1350; con menos la red la estira y se ve borrosa en el
// celular, y 2K/4K se pierden en la compresión de la red. Cada proveedor la
// llama distinto, por eso cada rama la pide a su manera.

// OpenAI no acepta proporciones, solo tres tamaños fijos. 4:5 no existe: el
// más cercano es 2:3 (1024x1536), y el recorte a 4:5 lo hace quien guarda la
// imagen (image-fit.ts), no el adapter.
const OPENAI_SIZES: Record<ImageAspectRatio, `${number}x${number}`> = {
  "1:1": "1024x1024",
  "4:5": "1024x1536",
  "16:9": "1536x1024",
};

// gpt-image-2 acepta tamaños libres (múltiplos de 16, proporción entre 1:3 y
// 3:1): la proporción pedida sale exacta y no hay nada que recortar después.
const EXACT_OPENAI_SIZES: Record<ImageAspectRatio, `${number}x${number}`> = {
  "1:1": "1024x1024",
  "4:5": "1024x1280",
  "16:9": "1536x864",
};

/**
 * Generadores que no tienen 4:5 (Grok Imagine; MAI-Image por OpenRouter): se
 * les pide 3:4, la más cercana que es MÁS alta, y el recorte quita ~6% de
 * arriba y de abajo. Pedir 1:1 sería recortar 20% de los lados. El encuadre
 * seguro de los prompts (SAFE_FRAMING) deja fondo en los bordes para eso.
 */
const WITHOUT_4_5 = [/^xai:grok-imagine-image/, /^openrouter:microsoft\/mai-image/];

export interface ImageCallOptions {
  size?: `${number}x${number}`;
  aspectRatio?: `${number}:${number}`;
  providerOptions?: SharedV4ProviderOptions;
}

export function imageCallOptions(
  provider: ProviderId | "fake",
  modelName: string,
  aspect: ImageAspectRatio,
): ImageCallOptions {
  // Por familia y no por versión: un alias o la versión siguiente heredan
  // la regla, en vez de pedir 4:5 y fallar todas las imágenes del feed.
  const without45 = WITHOUT_4_5.some((family) => family.test(`${provider}:${modelName}`));
  const asked = without45 && aspect === "4:5" ? "3:4" : aspect;
  switch (provider) {
    case "openai":
      return {
        size: modelName.startsWith("gpt-image-2")
          ? EXACT_OPENAI_SIZES[aspect]
          : OPENAI_SIZES[aspect],
        // Explícito: el default de gpt-image es "auto", que en la práctica
        // elige "high" y cuesta 4x lo que se tarifó (ADR-025).
        providerOptions: { openai: { quality: "medium" } },
      };
    case "google":
      return {
        aspectRatio: asked,
        // El SDK junta este `imageConfig` con la proporción de arriba.
        providerOptions: { google: { imageConfig: { imageSize: "1K" } } },
      };
    case "xai":
      return { aspectRatio: asked, providerOptions: { xai: { resolution: "1k" } } };
    case "openrouter":
      return { aspectRatio: asked, providerOptions: { openrouter: { resolution: "1K" } } };
    default:
      return { aspectRatio: asked };
  }
}

/**
 * Los ids de la lista de generadores. AI_MODEL_IMAGE_ALT (hasta F10.7, el de
 * "Probar con otro generador") entra en la posición 2 si no estaba ya en la
 * lista, con un aviso: un despliegue que todavía lo tiene puesto sigue
 * funcionando igual en vez de no arrancar, y un pedido viejo de "alternate"
 * (que se traduce al 2) sigue yendo al modelo que el operador configuró.
 */
export function imageGeneratorIds(chain: string | undefined, legacyAlternate: string | undefined) {
  const ids = parseModelChain(chain ?? DEFAULT_IMAGE_MODEL_ID).map(({ id }) => id);
  if (legacyAlternate && ids[0] !== legacyAlternate && ids[1] !== legacyAlternate) {
    console.warn(
      `[images] AI_MODEL_IMAGE_ALT está obsoleta (F10.7): "${legacyAlternate}" quedó como segundo de AI_MODEL_IMAGE. Muévelo a esa lista.`,
    );
    // Si ya estaba más abajo, se mueve: un "alternate" viejo es el 2.
    const at = ids.indexOf(legacyAlternate);
    if (at !== -1) ids.splice(at, 1);
    ids.splice(1, 0, legacyAlternate);
  }
  return ids;
}

/**
 * Para qué es mejor cada generador, en palabras del creator: lo que se lee
 * bajo "Probar con otro generador" ("Mejor para personas y realismo"). Es
 * dato medido, no marketing: cada fuerte sale de un bake-off a ciegas y se
 * cambia con el siguiente. Un modelo sin medir no tiene fuerte, y la UI dice
 * lo de siempre. Por id exacto (con sus snapshots fechados), NO por familia
 * como WITHOUT_4_5: aquel es una limitación técnica que hereda la versión
 * siguiente; un fuerte medido no se hereda — gpt-image-2-mini no es
 * gpt-image-2.
 */
const GENERATOR_STRENGTHS: { family: RegExp; strength: string }[] = [
  // Bake-off 2026-10-07: empata con Nano Banana 2 en promedio, gana en
  // lugares, producto sin logotipos y texto en español.
  { family: /^openai:gpt-image-2(?:-\d{4}-\d{2}-\d{2})?$/, strength: "Uso general" },
  // Bake-off 2026-10-07: el mejor con personas (gym 4.5 contra 4.0, cenote
  // 4.5 contra 3.0) y el más realista según las notas de Jose.
  { family: /^google:gemini-3\.1-flash-image(?:-preview)?$/, strength: "Personas y realismo" },
];

export function generatorStrength(id: string): string | null {
  return GENERATOR_STRENGTHS.find(({ family }) => family.test(id))?.strength ?? null;
}
