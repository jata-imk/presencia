import { BadRequestException, PayloadTooLargeException } from "@nestjs/common";
import { MAX_MESSAGE_CHARS } from "@presencia/shared";
import { describe, expect, it } from "vitest";
import { parseLastUserMessage, storableMessageId } from "./last-user-message.js";

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
