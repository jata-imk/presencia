import { WEB_SEARCH_TOOL_NAME } from "@presencia/shared";
import type { ModelEntry } from "../ai/provider-registry.js";

// F10.10 (ADR-028): cómo obliga "Buscar en la web" del menú ＋ a buscar en el
// primer paso. Puro, para probarlo sin el turno.
//
// - La instrucción en el prompt de sistema va SIEMPRE. Sonnet 5.5 rechaza
//   cualquier tool forzada (razona siempre; el AI SDK lo sabe y manda la tool
//   sola con `auto`, avisando que hay que pedirlo en el prompt): sin la
//   instrucción, nada lo obligaba a buscar. Lo vio el respaldo forzado en
//   vivo (2026-10-28).
// - `toolChoice` encima, para los que sí lo cumplen (OpenAI, Gemini). Se quita
//   si la cadena tiene un Anthropic con razonamiento explícito (`@esfuerzo`):
//   un modelo que el SDK no conozca respondería 400 a la tool forzada, y en la
//   cadena del chat un 400 no cae al respaldo, tumbaría el turno.

export const FORCE_SEARCH_NOTE =
  "El usuario activó «Buscar en la web» para este mensaje: empieza llamando " +
  `${WEB_SEARCH_TOOL_NAME}, aunque creas saber la respuesta.`;

/** Si se puede forzar la tool con `toolChoice` sin arriesgar un 400 en la cadena. */
export function canForceToolChoice(chain: readonly ModelEntry[]): boolean {
  return !chain.some(
    (entry) =>
      entry.provider === "anthropic" && entry.reasoning !== undefined && entry.reasoning !== "none",
  );
}

/** Lo que `prepareStep` le cambia al paso 0 de un mensaje con "Buscar en la web". */
export function forcedSearchStep(
  chain: readonly ModelEntry[],
  system: string,
): {
  system: string;
  toolChoice?: { type: "tool"; toolName: typeof WEB_SEARCH_TOOL_NAME };
} {
  const withNote = `${system}\n\n${FORCE_SEARCH_NOTE}`;
  return canForceToolChoice(chain)
    ? { system: withNote, toolChoice: { type: "tool", toolName: WEB_SEARCH_TOOL_NAME } }
    : { system: withNote };
}
