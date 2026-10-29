import { describe, expect, it } from "vitest";
import { parseModelChain } from "../ai/provider-registry.js";
import { canForceToolChoice, FORCE_SEARCH_NOTE, forcedSearchStep } from "./force-search.js";

// F10.10: "Buscar en la web" siempre lo pide en el prompt (Sonnet 5.5 rechaza
// una tool forzada), y además fuerza la tool salvo que la cadena tenga un
// Anthropic con razonamiento explícito.

describe("forcedSearchStep", () => {
  it("con la cadena de hoy (Sonnet sin esfuerzo) fuerza la tool y además lo pide", () => {
    const chain = parseModelChain(
      "openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5",
    );
    expect(canForceToolChoice(chain)).toBe(true);
    expect(forcedSearchStep(chain, "SISTEMA")).toEqual({
      system: `SISTEMA\n\n${FORCE_SEARCH_NOTE}`,
      toolChoice: { type: "tool", toolName: "buscar_en_web" },
    });
  });

  it("si Sonnet razona, lo pide con una instrucción en vez de forzarlo", () => {
    const chain = parseModelChain("openai:gpt-6-luna@high,anthropic:claude-sonnet-5-5@medium");
    expect(canForceToolChoice(chain)).toBe(false);
    expect(forcedSearchStep(chain, "SISTEMA")).toEqual({
      system: `SISTEMA\n\n${FORCE_SEARCH_NOTE}`,
    });
  });
});
