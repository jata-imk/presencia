import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import type { CardContent } from "@presencia/shared";
import { assembleContext, cardIdsForContext } from "./context-builder.js";
import type { LiveCard } from "./context-diet.js";

// El ContextBuilder (F10.8.1): lo que el modelo ve en cada turno. Puro.

const msg = (id: string, role: "user" | "assistant", text = `mensaje ${id}`): UIMessage => ({
  id,
  role,
  parts: [{ type: "text", text }],
});

function conversacion(n: number, texto?: (i: number) => string): UIMessage[] {
  return Array.from({ length: n }, (_, i) => [
    msg(`u${String(i)}`, "user", texto?.(i)),
    msg(`a${String(i)}`, "assistant", texto?.(i)),
  ]).flat();
}

const VISUAL: CardContent = {
  archetype: "visual_first",
  caption: "Marquesitas recién hechas",
  hashtags: [],
  assetIds: [],
};

function conCard(id: string, cardId: string): UIMessage {
  return {
    id,
    role: "assistant",
    parts: [
      {
        type: "tool-crear_borrador_visual",
        toolCallId: `t-${id}`,
        state: "output-available",
        input: {},
        output: { cardId, network: "instagram", status: "draft", content: VISUAL },
      },
    ],
  } as unknown as UIMessage;
}

describe("assembleContext", () => {
  it("sin resumen ni techo, viaja todo", () => {
    const chat = conversacion(3);
    const context = assembleContext(chat, null, new Map(), 120_000);
    expect(context.messages.map((m) => m.id)).toEqual(chat.map((m) => m.id));
    expect(context.oldestVisibleMessageId).toBe("u0");
  });

  it("con resumen, viaja el resumen y después lo que no cubre", () => {
    const chat = conversacion(6);
    const context = assembleContext(
      chat,
      {
        blocks: [{ summary: "- Vende marquesitas.", throughCreatedAt: "2026-10-07T18:00:00.000Z" }],
        throughMessageId: "a2",
        cards: [],
      },
      new Map(),
      120_000,
    );
    expect(context.messages[0]!.id.startsWith("presencia-")).toBe(true);
    expect(context.messages.find((m) => !m.id.startsWith("presencia-"))!.id).toBe("u3");
    // Lo anterior solo lo ve resumido: la memoria puede buscar ahí (F10.8.1).
    expect(context.oldestVisibleMessageId).toBe("u3");
  });

  it("con el techo, viaja la nota y lo más reciente que cupo", () => {
    const chat = conversacion(10, () => "x".repeat(4_000));
    const context = assembleContext(chat, null, new Map(), 3_000);
    const reales = context.messages.filter((m) => !m.id.startsWith("presencia-"));
    expect(reales.length).toBeLessThan(chat.length);
    expect(context.oldestVisibleMessageId).toBe(reales[0]!.id);
  });

  it("describe las cards como son hoy; si la lectura falló, se queda con la foto", () => {
    const chat = [msg("u0", "user"), conCard("a0", "c-1")];
    const hoy: LiveCard = { content: { ...VISUAL, caption: "Editada hoy" }, status: "scheduled" };
    const vivo = assembleContext(chat, null, new Map([["c-1", hoy]]), 120_000);
    expect(JSON.stringify(vivo.messages[1]!.parts)).toContain("Editada hoy");
    const foto = assembleContext(chat, null, null, 120_000);
    expect(JSON.stringify(foto.messages[1]!.parts)).toContain("Marquesitas recién hechas");
  });
});

describe("cardIdsForContext", () => {
  it("junta las cards del resumen y las de la ventana, sin repetir, para leerlas de una vez", () => {
    const chat = [
      msg("u0", "user"),
      conCard("a0", "c-viejo"),
      msg("u1", "user"),
      conCard("a1", "c-1"),
    ];
    const ids = cardIdsForContext(chat, {
      blocks: [{ summary: "", throughCreatedAt: "2026-10-07T18:00:00.000Z" }],
      throughMessageId: "a0",
      cards: [
        { cardId: "c-viejo", network: "instagram", status: "draft", resumen: "" },
        { cardId: "c-1", network: "instagram", status: "draft", resumen: "" },
      ],
    });
    expect(ids.sort()).toEqual(["c-1", "c-viejo"]);
  });
});
