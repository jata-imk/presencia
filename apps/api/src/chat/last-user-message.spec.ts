import { BadRequestException, PayloadTooLargeException } from "@nestjs/common";
import { MAX_MESSAGE_CHARS } from "@presencia/shared";
import { describe, expect, it } from "vitest";
import { parseLastUserMessage } from "./last-user-message.js";

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

  // El id se guarda tal cual (F10.8.2): uno que no es uuid no entra a la base.
  it("rechaza un id que no es uuid", async () => {
    await expect(parseLastUserMessage({ messages: [user("abc123", "hola")] })).rejects.toThrow(
      BadRequestException,
    );
  });

  it("rechaza un último mensaje que no es del creator", async () => {
    const assistant = { ...user(ID, "hola"), role: "assistant" };
    await expect(parseLastUserMessage({ messages: [assistant] })).rejects.toThrow(
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
