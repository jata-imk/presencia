import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import {
  KEEP_RECENT_TOKENS,
  MIN_KEEP_MESSAGES,
  applySummary,
  capHistory,
  compactionCut,
  estimateTokens,
  pendingTokensAfterSummary,
} from "./history-window.js";

// La ventana del historial de un chat largo (F10.8): qué parte se resume, cómo
// entra el resumen y el techo mecánico. Todo puro.

const msg = (id: string, role: "user" | "assistant", text = `mensaje ${id}`): UIMessage => ({
  id,
  role,
  parts: [{ type: "text", text }],
});

/** n intercambios: u0, a0, u1, a1… */
function conversacion(n: number, texto?: (i: number) => string): UIMessage[] {
  return Array.from({ length: n }, (_, i) => [
    msg(`u${String(i)}`, "user", texto?.(i)),
    msg(`a${String(i)}`, "assistant", texto?.(i)),
  ]).flat();
}

describe("compactionCut", () => {
  const grande = () => "x".repeat(4_000); // ~1k tokens por mensaje

  it("conserva lo reciente que cabe en el presupuesto, sin partir un turno", () => {
    const chat = conversacion(10, grande); // 20 mensajes de ~1k
    const cut = compactionCut(chat);
    // Caben 11 (~11k); el corte cae en una respuesta y retrocede al creator.
    expect(cut).toBe(8);
    expect(chat[cut]!.role).toBe("user");
    expect(estimateTokens(chat.slice(cut))).toBeLessThanOrEqual(KEEP_RECENT_TOKENS + 1_100);
  });

  it("con mensajes cortos conserva más mensajes; con cards pesadas, menos", () => {
    const cortos = conversacion(20); // 40 mensajes diminutos
    expect(compactionCut(cortos, 300)).toBeLessThan(40 - 10);
    expect(compactionCut(conversacion(10, grande))).toBeGreaterThan(20 - 13);
  });

  it("nunca conserva menos de dos intercambios, aunque pesen más que el presupuesto", () => {
    const chat = conversacion(5, () => "x".repeat(60_000)); // ~15k cada uno
    expect(compactionCut(chat)).toBe(10 - MIN_KEEP_MESSAGES);
  });

  it("con pocos mensajes no compacta nada", () => {
    expect(compactionCut(conversacion(3))).toBe(0);
  });
});

describe("pendingTokensAfterSummary", () => {
  it("mide lo que el resumen todavía no cubre", () => {
    const chat = conversacion(4);
    const todo = pendingTokensAfterSummary(chat, null);
    const despues = pendingTokensAfterSummary(chat, {
      summary: "",
      throughMessageId: "a1",
      cards: [],
    });
    expect(todo).toBe(estimateTokens(chat));
    expect(despues).toBe(estimateTokens(chat.slice(4)));
  });
});

describe("applySummary", () => {
  it("sustituye el tramo viejo por un intercambio con el resumen y la lista de cards", () => {
    const chat = conversacion(8);
    const window = applySummary(chat, {
      summary: "- El creator vende marquesitas en Santa Ana.",
      throughMessageId: "a4",
      cards: [{ cardId: "c-1", network: "instagram", status: "draft", resumen: "Promo 2×1" }],
    });
    expect(window.map((m) => m.role).slice(0, 3)).toEqual(["user", "assistant", "user"]);
    expect(window[2]!.id).toBe("u5");
    expect(window).toHaveLength(2 + 6);
    const contexto = JSON.stringify(window[0]!.parts);
    expect(contexto).toContain("marquesitas en Santa Ana");
    expect(contexto).toContain("c-1");
    // Los mensajes conservados viajan ENTEROS: el mismo objeto, sin tocar.
    expect(window[2]).toBe(chat[10]);
  });

  it("sin resumen, o si su último mensaje ya no está, devuelve el historial tal cual", () => {
    const chat = conversacion(3);
    expect(applySummary(chat, null)).toBe(chat);
    expect(applySummary(chat, { summary: "x", throughMessageId: "no-existe", cards: [] })).toBe(
      chat,
    );
  });
});

describe("applySummary con las cards de hoy", () => {
  const resumen = {
    summary: "resumen",
    throughMessageId: "a1",
    cards: [
      { cardId: "c-1", network: "instagram" as const, status: "draft" as const, resumen: "Vieja" },
      { cardId: "c-2", network: "facebook" as const, status: "draft" as const, resumen: "Borrada" },
    ],
  };

  it("describe cada card como es hoy y saca las borradas", () => {
    const live = new Map([
      [
        "c-1",
        {
          status: "published" as const,
          content: {
            archetype: "text_first" as const,
            body: "Promo nueva del martes",
            hashtags: [],
            assetIds: [],
          },
        },
      ],
    ]);
    const contexto = JSON.stringify(applySummary(conversacion(3), resumen, live)[0]!.parts);
    expect(contexto).toContain("published");
    expect(contexto).toContain("Promo nueva");
    expect(contexto).not.toContain("c-2");
  });

  it("si no se pudieron leer (null), queda la foto del resumen", () => {
    const contexto = JSON.stringify(applySummary(conversacion(3), resumen, null)[0]!.parts);
    expect(contexto).toContain("c-2");
  });
});

describe("estimateTokens", () => {
  it("del razonamiento cuenta el texto, no su metadata cifrada", () => {
    const conRazonamiento: UIMessage = {
      id: "a",
      role: "assistant",
      parts: [
        {
          type: "reasoning",
          text: "pienso",
          providerMetadata: { openai: { reasoningEncryptedContent: "x".repeat(40_000) } },
        },
      ],
    };
    expect(estimateTokens([conRazonamiento])).toBeLessThan(10);
  });
});

describe("capHistory", () => {
  it("bajo el tope no toca nada", () => {
    const chat = conversacion(3);
    expect(capHistory(chat, 100_000)).toBe(chat);
  });

  it("arriba del tope: nota + los más recientes que caben, empezando en el creator", () => {
    const chat = conversacion(40, () => "x".repeat(400)); // ~110 tokens por mensaje
    const tope = 1_500;
    const window = capHistory(chat, tope);
    expect(window[0]!.id).toBe("presencia-nota-u");
    expect(window[2]!.role).toBe("user");
    expect(window.at(-1)).toBe(chat.at(-1));
    expect(estimateTokens(window)).toBeLessThanOrEqual(tope + 200);
    expect(window.length).toBeLessThan(chat.length);
  });

  it("conserva el resumen del principio aunque recorte lo demás", () => {
    const chat = conversacion(40, () => "x".repeat(400));
    const resumida = applySummary(chat, { summary: "resumen", throughMessageId: "a1", cards: [] });
    const window = capHistory(resumida, 1_500);
    expect(window[0]!.id).toBe("presencia-resumen-u");
    expect(window[2]!.id).toBe("presencia-nota-u");
  });

  it("aunque un solo mensaje pase del tope, la pregunta del turno siempre va", () => {
    const chat = [msg("u0", "user", "x".repeat(10_000))];
    const window = capHistory(chat, 2_000);
    expect(window.at(-1)).toBe(chat[0]);
  });
});
