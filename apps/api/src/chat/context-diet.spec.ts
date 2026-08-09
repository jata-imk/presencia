import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import type { CardContent, SocialNetwork } from "@presencia/shared";
import { compressToolOutputsForModel } from "./context-diet.js";

function textPart(text: string) {
  return { type: "text" as const, text };
}

function stepStartPart() {
  return { type: "step-start" as const };
}

function visualContent(caption: string): CardContent {
  return { archetype: "visual_first", caption, hashtags: [], assetIds: [] };
}

function cardToolPart(
  cardId: string,
  network: SocialNetwork,
  content: CardContent,
  extra: Record<string, unknown> = {},
) {
  return {
    type: "tool-crear_borrador_visual" as const,
    toolCallId: `call-${cardId}`,
    state: "output-available" as const,
    input: { network, caption: "irrelevante" },
    output: { cardId, network, status: "draft", content, ...extra },
  };
}

function assistantMessage(id: string, parts: unknown[]): UIMessage {
  return { id, role: "assistant", parts: parts as UIMessage["parts"] };
}

function userMessage(id: string, text: string): UIMessage {
  return { id, role: "user", parts: [textPart(text)] as UIMessage["parts"] };
}

describe("compressToolOutputsForModel", () => {
  it("deja las últimas 2 tool outputs íntegras y comprime las 3 más viejas", () => {
    const history: UIMessage[] = [
      userMessage("u1", "hazme un post 1"),
      assistantMessage("a1", [
        stepStartPart(),
        cardToolPart(
          "card-1",
          "instagram",
          visualContent("Caption uno bien largo para probar el truncado"),
        ),
      ]),
      userMessage("u2", "hazme un post 2"),
      assistantMessage("a2", [cardToolPart("card-2", "instagram", visualContent("Caption dos"))]),
      userMessage("u3", "hazme un post 3"),
      assistantMessage("a3", [cardToolPart("card-3", "instagram", visualContent("Caption tres"))]),
      userMessage("u4", "hazme un post 4"),
      assistantMessage("a4", [
        cardToolPart("card-4", "instagram", visualContent("Caption cuatro")),
      ]),
      userMessage("u5", "hazme un post 5"),
      assistantMessage("a5", [cardToolPart("card-5", "instagram", visualContent("Caption cinco"))]),
    ];

    const compressed = compressToolOutputsForModel(history, 2);

    const outputs = compressed
      .flatMap((m) => m.parts)
      .filter((p) => typeof p === "object" && p !== null && "output" in p)
      .map((p) => (p as unknown as { output: Record<string, unknown> }).output);

    // Las 3 primeras (card-1..3) comprimidas: sin `content`, con `resumen`.
    expect(outputs[0]).not.toHaveProperty("content");
    expect(outputs[0]).toMatchObject({ cardId: "card-1", network: "instagram", status: "draft" });
    expect(typeof (outputs[0] as { resumen: string }).resumen).toBe("string");
    expect(outputs[1]).not.toHaveProperty("content");
    expect(outputs[2]).not.toHaveProperty("content");

    // Las últimas 2 (card-4, card-5) intactas, con `content` completo.
    expect(outputs[3]).toMatchObject({
      cardId: "card-4",
      content: visualContent("Caption cuatro"),
    });
    expect(outputs[4]).toMatchObject({ cardId: "card-5", content: visualContent("Caption cinco") });
  });

  it("el resumen trunca captions largos y no explota con captions cortos", () => {
    const longCaption = "x".repeat(200);
    const history: UIMessage[] = [
      assistantMessage("a1", [cardToolPart("card-1", "instagram", visualContent(longCaption))]),
      assistantMessage("a2", [cardToolPart("card-2", "instagram", visualContent("corto"))]),
      assistantMessage("a3", [cardToolPart("card-3", "instagram", visualContent("otro"))]),
    ];

    const compressed = compressToolOutputsForModel(history, 2);
    const firstOutput = (compressed[0]!.parts[0] as { output: { resumen: string } }).output;
    expect(firstOutput.resumen.length).toBeLessThan(longCaption.length);
    expect(firstOutput.resumen).toContain("…");
  });

  it("no toca texto ni step-start", () => {
    const history: UIMessage[] = [
      userMessage("u1", "hola"),
      assistantMessage("a1", [
        textPart("aquí va tu post"),
        stepStartPart(),
        cardToolPart("card-1", "instagram", visualContent("uno")),
        cardToolPart("card-2", "instagram", visualContent("dos")),
        cardToolPart("card-3", "instagram", visualContent("tres")),
      ]),
    ];

    const compressed = compressToolOutputsForModel(history, 2);
    const parts = compressed[1]!.parts;
    expect(parts[0]).toEqual(textPart("aquí va tu post"));
    expect(parts[1]).toEqual(stepStartPart());
  });

  it("deja intactas las tool parts legacy sin `content` (pre F3 PR3)", () => {
    const legacyPart = {
      type: "tool-crear_borrador_visual" as const,
      toolCallId: "call-legacy",
      state: "output-available" as const,
      input: { network: "instagram", caption: "x" },
      output: { cardId: "card-legacy", network: "instagram", status: "draft" }, // sin content
    };
    const history: UIMessage[] = [
      assistantMessage("a1", [legacyPart]),
      assistantMessage("a2", [cardToolPart("card-2", "instagram", visualContent("dos"))]),
      assistantMessage("a3", [cardToolPart("card-3", "instagram", visualContent("tres"))]),
      assistantMessage("a4", [cardToolPart("card-4", "instagram", visualContent("cuatro"))]),
    ];

    const compressed = compressToolOutputsForModel(history, 2);
    expect(compressed[0]!.parts[0]).toEqual(legacyPart);
  });

  it("historial sin tool parts (o con menos que keepFull) sale idéntico por referencia", () => {
    const history: UIMessage[] = [
      userMessage("u1", "hola"),
      assistantMessage("a1", [textPart("solo texto, sin cards")]),
    ];
    expect(compressToolOutputsForModel(history, 2)).toBe(history);

    const shortHistory: UIMessage[] = [
      assistantMessage("a1", [cardToolPart("card-1", "instagram", visualContent("única"))]),
    ];
    expect(compressToolOutputsForModel(shortHistory, 2)).toBe(shortHistory);
  });
});
