import { BadRequestException, PayloadTooLargeException } from "@nestjs/common";
import { MAX_MESSAGE_CHARS } from "@presencia/shared";
import { describe, expect, it } from "vitest";
import { lastTurnOf, parseLastUserMessage, storableMessageId } from "./last-user-message.js";

const ID = "6f1c2b9e-3a4d-4e5f-8a7b-1c2d3e4f5a6b";

const user = (id: string, text: string) => ({
  id,
  role: "user",
  parts: [{ type: "text", text }],
});

describe("parseLastUserMessage", () => {
  it("devuelve el último mensaje con el id que mandó la web", async () => {
    const message = await parseLastUserMessage({ messages: [user(ID, "hola")] });
    expect(message.id).toBe(ID);
  });

  it("rechaza un último mensaje que no es del creator", async () => {
    const assistant = { ...user(ID, "hola"), role: "assistant" };
    await expect(parseLastUserMessage({ messages: [assistant] })).rejects.toThrow(
      BadRequestException,
    );
  });

  // El tope se mide en texto: otra parte lo esquivaría.
  it("rechaza partes que no son texto", async () => {
    const conArchivo = {
      ...user(ID, "hola"),
      parts: [
        { type: "text", text: "hola" },
        { type: "file", mediaType: "text/plain", url: "data:text/plain;base64,aG9sYQ==" },
      ],
    };
    await expect(parseLastUserMessage({ messages: [conArchivo] })).rejects.toThrow(
      BadRequestException,
    );
  });

  it("acepta un mensaje justo en el tope y rechaza uno que lo pasa, con 413", async () => {
    const enElTope = "a".repeat(MAX_MESSAGE_CHARS);
    await expect(parseLastUserMessage({ messages: [user(ID, enElTope)] })).resolves.toBeDefined();
    await expect(parseLastUserMessage({ messages: [user(ID, `${enElTope}a`)] })).rejects.toThrow(
      PayloadTooLargeException,
    );
  });
});

describe("storableMessageId", () => {
  it("guarda con el id de la web si es uuid", () => {
    expect(storableMessageId({ id: ID, role: "user", parts: [] })).toBe(ID);
  });

  // Una pestaña con el bundle anterior al deploy: la base genera el id, como antes.
  it("deja que la base lo genere si no es uuid", () => {
    expect(storableMessageId({ id: "aB3xYz9", role: "user", parts: [] })).toBeUndefined();
  });
});

// Solo el último turno se vuelve a correr (regenerar, reintentar, editar).
describe("lastTurnOf", () => {
  const m = (id: string, role: "user" | "assistant") => ({ id, role });
  const chat = [m("u0", "user"), m("a0", "assistant"), m("u1", "user"), m("a1", "assistant")];

  it("el penúltimo mensaje del creator, con su respuesta", () => {
    expect(lastTurnOf(chat, "u1")).toEqual({ index: 2, staleReply: chat[3] });
  });

  it("el último mensaje, que se quedó sin respuesta guardada", () => {
    expect(lastTurnOf(chat.slice(0, 3), "u1")).toEqual({ index: 2, staleReply: undefined });
  });

  it("null para un turno de en medio, una respuesta o un id que no existe", () => {
    expect(lastTurnOf(chat, "u0")).toBeNull();
    expect(lastTurnOf(chat, "a1")).toBeNull();
    expect(lastTurnOf(chat, "nada")).toBeNull();
  });
});
