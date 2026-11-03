import { HttpException, HttpStatus } from "@nestjs/common";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TelegramConversationService as Conversation } from "./telegram-conversation.service.js";
import type { TelegramSink } from "./telegram-sink.js";
import type { TelegramPlace, TelegramThreadRow } from "./telegram-threads.repository.js";

// De un mensaje de Telegram al turno (F11 PR4): qué chat recibe cada tema, la
// fila por tema, los errores que el creator lee, "Reintentar", /new y el
// renombre del tema. El turno y la base van de mentira: el turno lo prueba
// chat.service.spec; la tabla de temas, telegram-threads.repository.spec.

let Service: typeof Conversation;
let copy: typeof import("./telegram.copy.js").copy;
let webUrl: string;

beforeAll(async () => {
  try {
    process.loadEnvFile("../../.env");
  } catch {
    // sin .env: se usa el process.env tal cual (CI)
  }
  ({ TelegramConversationService: Service } = await import("./telegram-conversation.service.js"));
  ({ copy } = await import("./telegram.copy.js"));
  ({ WEB_URL: webUrl } = (await import("../env.js")).env);
});

const TEMA: TelegramPlace = { telegramChatId: 500, threadId: 7 };
const OTRO_TEMA: TelegramPlace = { telegramChatId: 500, threadId: 8 };
const SIN_TEMA: TelegramPlace = { telegramChatId: 500, threadId: null };
const YO = { id: 500 };

/** Deja correr lo que ya está en camino (promesas encadenadas). */
const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
};

function montar({ conectado = true } = {}) {
  const filas: TelegramThreadRow[] = [];
  let chats = 0;
  const mismoLugar = (r: TelegramThreadRow, p: TelegramPlace) =>
    r.telegramChatId === p.telegramChatId && r.messageThreadId === p.threadId;
  const threads = {
    findByPlace: (_tx: unknown, p: TelegramPlace) =>
      Promise.resolve(filas.find((r) => mismoLugar(r, p))),
    findByChat: (_tx: unknown, chatId: string) =>
      Promise.resolve(filas.find((r) => r.chatId === chatId)),
    insert: (
      _tx: unknown,
      v: { userId: string; chatId: string; place: TelegramPlace; renameTopic: boolean },
    ) => {
      const row = {
        id: `fila-${String(filas.length)}`,
        userId: v.userId,
        chatId: v.chatId,
        telegramChatId: v.place.telegramChatId,
        messageThreadId: v.place.threadId,
        renameTopic: v.renameTopic,
        createdAt: new Date(),
      };
      filas.push(row);
      return Promise.resolve(row);
    },
    releaseUnthreaded: (_tx: unknown, tg: number) => {
      const i = filas.findIndex((r) => r.telegramChatId === tg && r.messageThreadId === null);
      if (i !== -1) filas.splice(i, 1);
      return Promise.resolve(i !== -1);
    },
  };
  const createChat = vi.fn((_tx: unknown, _user: string, title?: string) =>
    Promise.resolve({ id: `chat-${String(++chats)}`, title }),
  );

  // Cada turno: el sink queda "entregándose" hasta que el caso lo termine.
  const turnos: { chatId: string; sink: TelegramSink; terminar: () => void }[] = [];
  const correr = (chatId: string, sink: TelegramSink) => {
    const s = sink as unknown as { started: boolean; resolveFinished: () => void };
    s.started = true;
    turnos.push({ chatId, sink, terminar: () => s.resolveFinished() });
    return Promise.resolve();
  };
  const chat = {
    streamChat: vi.fn((_u: string, chatId: string, _m: unknown, sink: TelegramSink) =>
      correr(chatId, sink),
    ),
    regenerateChat: vi.fn((_u: string, chatId: string, _id: string, sink: TelegramSink) =>
      correr(chatId, sink),
    ),
  };
  const api = {
    sendMessage: vi.fn<(...a: unknown[]) => Promise<never>>(() => Promise.resolve({} as never)),
    sendMessageDraft: vi.fn<(...a: unknown[]) => Promise<true>>(() => Promise.resolve(true)),
    editForumTopic: vi.fn<(...a: unknown[]) => Promise<true>>(() => Promise.resolve(true)),
  };
  const service = new Service(
    { runWithTenant: (_u: string, fn: (tx: unknown) => unknown) => fn({}) } as never,
    { resolveUser: () => Promise.resolve(conectado ? "u1" : null) } as never,
    threads,
    { createChat } as never,
    chat as never,
    { findById: () => Promise.resolve({ timezone: "America/Merida" }) } as never,
  );
  const avisos = () => api.sendMessage.mock.calls.map((c) => c[1]);
  return { service, api, chat, createChat, filas, turnos, avisos };
}

describe("TelegramConversationService", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("el primer mensaje de un tema crea su chat; los siguientes caen en él", async () => {
    const t = montar();
    await t.service.text(t.api, YO, TEMA, "hola");
    await flush();
    t.turnos[0]!.terminar();
    await t.service.text(t.api, YO, TEMA, "otra cosa");
    await flush();
    expect(t.createChat).toHaveBeenCalledTimes(1);
    expect(t.chat.streamChat.mock.calls.map((c) => c[1])).toEqual(["chat-1", "chat-1"]);
    // Por el canal Telegram y con la zona del creator de la base.
    expect(t.chat.streamChat).toHaveBeenCalledWith(
      "u1",
      "chat-1",
      expect.anything(),
      expect.anything(),
      { channel: "telegram", timezone: "America/Merida" },
    );
  });

  it("un tema con nombre del creator le da su título al chat y no se renombra; uno implícito, sí", async () => {
    const t = montar();
    t.service.topicCreated(TEMA, "Ideas del gym", false);
    t.service.topicCreated(OTRO_TEMA, "hazme un post de", true);
    await t.service.text(t.api, YO, TEMA, "hola");
    await t.service.text(t.api, YO, OTRO_TEMA, "hazme un post de café");
    await flush();
    expect(t.createChat.mock.calls.map((c) => c[2])).toEqual(["Ideas del gym", undefined]);
    expect(t.filas.map((f) => f.renameTopic)).toEqual([false, true]);
  });

  it("en fila por tema: el segundo mensaje espera al primero; otro tema corre en paralelo", async () => {
    const t = montar();
    await t.service.text(t.api, YO, TEMA, "uno");
    await t.service.text(t.api, YO, TEMA, "dos");
    await t.service.text(t.api, YO, OTRO_TEMA, "aparte");
    await flush();
    expect(t.chat.streamChat).toHaveBeenCalledTimes(2);
    t.turnos[0]!.terminar();
    await flush();
    expect(t.chat.streamChat).toHaveBeenCalledTimes(3);
  });

  it("con la fila llena pide calma, sin encolar más", async () => {
    const t = montar();
    for (const m of ["1", "2", "3", "4"]) await t.service.text(t.api, YO, TEMA, m);
    await flush();
    expect(t.avisos()).toEqual([copy.queueFull]);
  });

  it("los rechazos del turno se dicen en el tema", async () => {
    const casos: [HttpException, string][] = [
      [
        new HttpException({ code: "quota_exhausted" }, HttpStatus.PAYMENT_REQUIRED),
        copy.noQuota(webUrl),
      ],
      [
        new HttpException("Esta respuesta todavía se está generando.", HttpStatus.CONFLICT),
        copy.busy,
      ],
    ];
    for (const [error, texto] of casos) {
      const t = montar();
      t.chat.streamChat.mockRejectedValueOnce(error);
      await t.service.text(t.api, YO, TEMA, "hola");
      await flush();
      expect(t.avisos()).toEqual([texto]);
      expect(t.api.sendMessage.mock.calls[0]?.[2]).toEqual({ message_thread_id: 7 });
    }
  });

  it("quien no está conectado recibe cómo conectarse, y no corre ningún turno", async () => {
    const t = montar({ conectado: false });
    await t.service.text(t.api, YO, TEMA, "hola");
    await flush();
    expect(t.chat.streamChat).not.toHaveBeenCalled();
    expect(t.avisos()).toEqual([copy.notLinked(webUrl)]);
  });

  it("detener llega al sink de ese draft", async () => {
    const t = montar();
    await t.service.text(t.api, YO, TEMA, "hola");
    await flush();
    const sink = t.turnos[0]!.sink;
    const draftId = (sink as unknown as { options: { draftId: number } }).options.draftId;
    t.service.stop(500, draftId + 1);
    expect(sink.gone).toBe(false);
    t.service.stop(500, draftId);
    expect(sink.gone).toBe(true);
  });

  it("Reintentar regenera ese mensaje en el chat del tema; sin chat, lo dice", async () => {
    const t = montar();
    await t.service.retry(t.api, YO, TEMA, "m-1");
    expect(t.avisos()).toEqual([copy.chatGone]);

    await t.service.text(t.api, YO, TEMA, "hola");
    await flush();
    t.turnos[0]!.terminar();
    await t.service.retry(t.api, YO, TEMA, "m-1");
    await flush();
    expect(t.chat.regenerateChat).toHaveBeenCalledWith("u1", "chat-1", "m-1", expect.anything(), {
      channel: "telegram",
      timezone: "America/Merida",
    });
  });

  it("/new sin tema suelta el chat actual; en un tema explica que basta abrir otro", async () => {
    const t = montar();
    await t.service.text(t.api, YO, SIN_TEMA, "hola");
    await flush();
    t.turnos[0]!.terminar();
    expect(await t.service.newChat(YO, SIN_TEMA)).toBe(copy.newChat);
    await t.service.text(t.api, YO, SIN_TEMA, "otro tema");
    await flush();
    expect(t.chat.streamChat.mock.calls.map((c) => c[1])).toEqual(["chat-1", "chat-2"]);
    expect(await t.service.newChat(YO, TEMA)).toBe(copy.newInTopic);
  });

  it("el título nuevo renombra el tema: el automático solo si el tema no tiene nombre del creator", async () => {
    const t = montar();
    t.service.topicCreated(OTRO_TEMA, "Mi tema", false);
    await t.service.text(t.api, YO, TEMA, "hola");
    await t.service.text(t.api, YO, OTRO_TEMA, "hola");
    await t.service.text(t.api, YO, SIN_TEMA, "hola");
    await flush();
    const largo = "x".repeat(200);
    await t.service.renameTopic(t.api, {
      userId: "u1",
      chatId: "chat-1",
      title: largo,
      source: "auto",
    });
    await t.service.renameTopic(t.api, {
      userId: "u1",
      chatId: "chat-2",
      title: "Auto",
      source: "auto",
    });
    await t.service.renameTopic(t.api, {
      userId: "u1",
      chatId: "chat-2",
      title: "De la web",
      source: "user",
    });
    await t.service.renameTopic(t.api, {
      userId: "u1",
      chatId: "chat-3",
      title: "Sin tema",
      source: "auto",
    });
    expect(t.api.editForumTopic.mock.calls).toEqual([
      [500, 7, { name: "x".repeat(128) }],
      [500, 8, { name: "De la web" }],
    ]);
  });
});
