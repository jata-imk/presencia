import type { ImageAspectRatio } from "@presencia/shared";
import type { SharedV4ProviderOptions } from "@ai-sdk/provider";
import type { ProviderId } from "../ai/provider-registry.js";

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
