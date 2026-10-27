import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { READ_LINK_TOOL_NAME } from "@presencia/shared";
import { transcriptForSummary } from "./history-compaction.js";
import { estimateTokens } from "./history-window.js";
import {
  dietWebReads,
  RECENT_WEB_READ_TOKENS,
  webReadIdsIn,
  webReadLines,
  WEB_READ_MODEL_CHARS,
  type ReadLinkModelOutput,
  type WebReadForContext,
} from "./web-read-context.js";

// F10.10: qué páginas leídas viajan completas en un turno posterior, y que el
// techo las cuente.

const user = (id: string, text = "hola"): UIMessage => ({
  id,
  role: "user",
  parts: [{ type: "text", text }],
});

const readPart = (readId: string, estado: "ok" | "requiere_sesion" = "ok") => ({
  type: `tool-${READ_LINK_TOOL_NAME}`,
  toolCallId: `call-${readId}`,
  state: "output-available",
  input: { url: `https://x.mx/${readId}` },
  output: {
    readId,
    url: `https://x.mx/${readId}`,
    urlFinal: `https://x.mx/${readId}`,
    titulo: `Nota ${readId}`,
    dominio: "x.mx",
    estado,
    truncado: false,
    soloDescripcion: false,
  },
});

const assistant = (id: string, ...readIds: string[]): UIMessage =>
  ({
    id,
    role: "assistant",
    parts: [...readIds.map((r) => readPart(r)), { type: "text", text: "listo" }],
  }) as UIMessage;

const row = (id: string, tokens: number, description: string | null = null): WebReadForContext => ({
  id,
  url: `https://x.mx/${id}`,
  finalUrl: `https://x.mx/${id}`,
  title: `Nota ${id}`,
  siteName: "X",
  extractedText: "t".repeat(tokens * 4),
  truncated: false,
  onlyDescription: false,
  tokenEstimate: tokens,
  description,
});

const viewOf = (messages: UIMessage[], readId: string) =>
  messages
    .flatMap((m) => m.parts)
    .map((p) => (p as { output?: ReadLinkModelOutput }).output)
    .find((o) => o?.readId === readId)?.contexto;

describe("dietWebReads", () => {
  it("una lectura del turno anterior viaja completa, con su texto pegado a la parte", () => {
    const messages = [user("u1"), assistant("a1", "r1"), user("u2")];
    const out = dietWebReads(messages, new Map([["r1", row("r1", 500)]]));
    expect(viewOf(out, "r1")).toMatchObject({ vista: "completa", titulo: "Nota r1" });
  });

  it("el techo cuenta el texto pegado, no solo la referencia", () => {
    const messages = [user("u1"), assistant("a1", "r1"), user("u2")];
    const before = estimateTokens(messages);
    const after = estimateTokens(dietWebReads(messages, new Map([["r1", row("r1", 2_000)]])));
    expect(after - before).toBeGreaterThan(1_900);
  });

  it("fuera de la ventana de 3 turnos, una línea con la descripción", () => {
    const messages = [
      user("u1"),
      assistant("a1", "vieja"),
      user("u2"),
      assistant("a2"),
      user("u3"),
      assistant("a3"),
      user("u4"),
    ];
    const out = dietWebReads(messages, new Map([["vieja", row("vieja", 100, "De qué trata.")]]));
    expect(viewOf(out, "vieja")).toEqual({ vista: "linea", descripcion: "De qué trata." });
  });

  it("dentro de la ventana, las que no caben en el presupuesto van como línea, las nuevas primero", () => {
    const grande = Math.floor(RECENT_WEB_READ_TOKENS * 0.45);
    const messages = [
      user("u1"),
      assistant("a1", "vieja"),
      user("u2"),
      assistant("a2", "media", "nueva"),
      user("u3"),
    ];
    const out = dietWebReads(
      messages,
      new Map([
        ["vieja", row("vieja", grande)],
        ["media", row("media", grande)],
        ["nueva", row("nueva", grande)],
      ]),
    );
    expect(viewOf(out, "nueva")?.vista).toBe("completa");
    expect(viewOf(out, "media")?.vista).toBe("completa");
    expect(viewOf(out, "vieja")?.vista).toBe("linea");
  });

  it("una página más larga que el tope del modelo cuenta solo lo que ve", () => {
    const enorme = row("enorme", 50_000);
    const messages = [user("u1"), assistant("a1", "enorme"), user("u2")];
    const view = viewOf(dietWebReads(messages, new Map([["enorme", enorme]])), "enorme");
    expect(view).toMatchObject({ vista: "completa", recortada: true });
    expect(view?.vista === "completa" && view.texto.length).toBe(WEB_READ_MODEL_CHARS + 1);
  });

  it("si la lectura de filas falló, cada página queda nombrada y sin texto", () => {
    const messages = [user("u1"), assistant("a1", "r1"), user("u2")];
    expect(viewOf(dietWebReads(messages, null), "r1")).toEqual({ vista: "no_disponible" });
  });

  it("una lectura fallida no se toca: su motivo ya es corto", () => {
    const fallida = {
      id: "a1",
      role: "assistant",
      parts: [readPart("r9", "requiere_sesion")],
    } as UIMessage;
    const messages = [user("u1"), fallida, user("u2")];
    expect(dietWebReads(messages, new Map())).toEqual(messages);
    expect(webReadIdsIn(messages)).toEqual([]);
  });
});

describe("webReadLines", () => {
  it("nombra las páginas leídas, sin su texto, para el resumen y la memoria", () => {
    const fallida = { ...readPart("r2", "requiere_sesion") };
    const message = {
      id: "a1",
      role: "assistant",
      parts: [readPart("r1"), fallida, { type: "text", text: "listo" }],
    } as UIMessage;
    expect(webReadLines(message)).toEqual(['[Presencia leyó la página "Nota r1" (x.mx)]']);
  });

  it("la transcripción de la compactación las incluye", () => {
    expect(transcriptForSummary([user("u1", "léeme esto"), assistant("a1", "r1")])).toContain(
      'Presencia leyó la página "Nota r1"',
    );
  });
});
