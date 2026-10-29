import { WEB_SEARCH_TOOL_NAME } from "@presencia/shared";
import type { ModelEntry } from "../ai/provider-registry.js";

// F10.10 (ADR-028): cómo obliga "Buscar en la web" del menú ＋ a buscar en el
// primer paso. Lo normal es forzar la tool (`toolChoice`), pero Anthropic con
// razonamiento extendido rechaza un tool_choice forzado (400), y en la cadena
// del chat un 400 no cae al respaldo: tumbaría el turno. Si algún modelo de
// la cadena es así, se pide con una instrucción en vez de forzarlo. Puro, para
// probarlo sin el turno.

export const FORCE_SEARCH_NOTE =
  "El usuario activó «Buscar en la web» para este mensaje: empieza llamando " +
  `${WEB_SEARCH_TOOL_NAME}, aunque creas saber la respuesta.`;

/** Si se puede forzar la tool con `toolChoice` con cualquier modelo de la cadena. */
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
): { toolChoice: { type: "tool"; toolName: typeof WEB_SEARCH_TOOL_NAME } } | { system: string } {
  return canForceToolChoice(chain)
    ? { toolChoice: { type: "tool", toolName: WEB_SEARCH_TOOL_NAME } }
    : { system: `${system}\n\n${FORCE_SEARCH_NOTE}` };
}
