import { randomUUID } from "node:crypto";
import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { attachmentContentUrl } from "@presencia/shared";
import {
  attachmentIdsIn,
  attachmentLines,
  dietAttachments,
  recentTurnsStart,
  type AttachmentForContext,
} from "./attachment-context.js";
import { assembleContext } from "./context-builder.js";
import { transcriptForSummary } from "./history-compaction.js";
import { estimateTokens } from "./history-window.js";

// Lo que el modelo ve de los adjuntos (F10.9): completos los de los últimos
// tres turnos, una línea los de antes, y el techo contando lo que pesan.

function attachment(over: Partial<AttachmentForContext> = {}): AttachmentForContext {
  return {
    id: randomUUID(),
    kind: "image",
    filename: "foto.jpg",
    pages: null,
    scanned: false,
    extractedText: null,
    truncated: false,
    tokenEstimate: 1_600,
    description: null,
    ...over,
  };
}

const fileOf = (a: AttachmentForContext) => ({
  type: "file" as const,
  mediaType: a.kind === "image" ? "image/jpeg" : "text/markdown",
  filename: a.filename,
  url: attachmentContentUrl(a.id),
});

const user = (text: string, files: AttachmentForContext[] = []): UIMessage => ({
  id: randomUUID(),
  role: "user",
  parts: [...files.map(fileOf), { type: "text", text }],
});
const reply = (text: string): UIMessage => ({
  id: randomUUID(),
  role: "assistant",
  parts: [{ type: "text", text }],
});

const textOf = (m: UIMessage) =>
  m.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n");

describe("recentTurnsStart", () => {
  it("abre en el mensaje del creator del tercer turno contando desde el final", () => {
    const chat = [user("1"), reply("a"), user("2"), reply("b"), user("3"), reply("c"), user("4")];
    expect(recentTurnsStart(chat)).toBe(2);
    expect(recentTurnsStart(chat.slice(0, 3))).toBe(0);
  });
});

describe("dietAttachments", () => {
  it("una imagen reciente se queda como parte file, con su nombre y su peso", () => {
    const foto = attachment();
    const [out] = dietAttachments([user("¿qué ves?", [foto])], new Map([[foto.id, foto]]));
    expect(out!.parts[0]).toEqual({ type: "text", text: '[Adjunto: imagen "foto.jpg"]' });
    expect(out!.parts[1]).toMatchObject({
      type: "file",
      url: attachmentContentUrl(foto.id),
      providerMetadata: { presencia: { tokens: 1_600 } },
    });
  });

  it("un texto reciente viaja como texto, envuelto en <adjunto>, con aviso si se recortó", () => {
    const menu = attachment({
      kind: "text",
      filename: 'menu "nuevo".md',
      extractedText: "# Menú\n- Marquesita $45",
      truncated: true,
      tokenEstimate: 10,
    });
    const [out] = dietAttachments([user("úsalo", [menu])], new Map([[menu.id, menu]]));
    const text = textOf(out!);
    expect(text).toContain(`<adjunto nombre="menu 'nuevo'.md" tipo="archivo de texto">`);
    expect(text).toContain("- Marquesita $45\n</adjunto>");
    expect(text).toContain("Solo se leyó una parte");
    expect(out!.parts.some((p) => p.type === "file")).toBe(false);
  });

  it("un adjunto de hace más de tres turnos viaja como su descripción", () => {
    const vieja = attachment({ description: "Una marquesita de queso en un plato azul." });
    const chat = [
      user("mira", [vieja]),
      reply("ok"),
      user("2"),
      reply("b"),
      user("3"),
      reply("c"),
      user("4"),
    ];
    const out = dietAttachments(chat, new Map([[vieja.id, vieja]]));
    expect(out[0]!.parts.some((p) => p.type === "file")).toBe(false);
    expect(textOf(out[0]!)).toContain(
      'Adjunto de antes (imagen "foto.jpg"): Una marquesita de queso en un plato azul.',
    );
  });

  it("sin descripción todavía, un texto viejo viaja como su principio", () => {
    const viejo = attachment({ kind: "text", extractedText: "Horario: martes a domingo." });
    const chat = [user("ten", [viejo]), reply("ok"), user("2"), reply("b"), user("3")];
    const out = dietAttachments(chat, new Map([[viejo.id, viejo]]), 2);
    expect(textOf(out[0]!)).toContain('empieza así: "Horario: martes a domingo.…"');
  });

  it("si la lectura falló, el adjunto queda nombrado sin contenido", () => {
    const foto = attachment();
    const [out] = dietAttachments([user("¿y esto?", [foto])], null);
    expect(textOf(out!)).toContain('[Adjunto: "foto.jpg" — no está disponible');
    expect(out!.parts.some((p) => p.type === "file")).toBe(false);
  });
});

describe("el techo cuenta lo que pesa un adjunto, no su JSON", () => {
  it("una imagen pesa su estimado, aunque la parte sea una URL corta", () => {
    const foto = attachment({ tokenEstimate: 1_600 });
    const [dieted] = dietAttachments([user("", [foto])], new Map([[foto.id, foto]]));
    expect(estimateTokens([dieted!])).toBeGreaterThanOrEqual(1_600);
  });

  it("assembleContext arma la ventana con los adjuntos y respeta el techo", () => {
    const fotos = Array.from({ length: 4 }, () => attachment({ tokenEstimate: 5_000 }));
    const chat = fotos.flatMap((f, i) => [user(`foto ${i}`, [f]), reply("va")]);
    chat.push(user("¿cuál te gusta más?"));
    const rows = new Map(fotos.map((f) => [f.id, f]));
    // Sin techo apretado: las dos últimas fotos van completas, las dos primeras como línea.
    const holgado = assembleContext(chat, null, new Map(), 100_000, rows);
    expect(holgado.messages.flatMap((m) => m.parts).filter((p) => p.type === "file")).toHaveLength(
      2,
    );
    // Con techo apretado, se cortan mensajes viejos enteros.
    const apretado = assembleContext(chat, null, new Map(), 6_000, rows);
    expect(apretado.messages.length).toBeLessThan(holgado.messages.length);
  });
});

describe("transcripts", () => {
  it("el resumen y la memoria saben que hubo un archivo, por su nombre", () => {
    const menu = attachment({ kind: "text", filename: "menu.md" });
    const message = user("hazme un post con esto", [menu]);
    expect(attachmentLines(message)).toEqual(['[El creator adjuntó "menu.md"]']);
    expect(transcriptForSummary([message])).toContain('[El creator adjuntó "menu.md"]');
    expect(attachmentIdsIn([message])).toEqual([menu.id]);
  });
});
