import { HttpException, HttpStatus } from "@nestjs/common";
import { GrammyError } from "grammy";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

function montar({
  conectado = true,
  resolveUser,
}: { conectado?: boolean; resolveUser?: () => Promise<string | null> } = {}) {
  // F11 PR7b: el Telegram conectado del creator (su id es el del chat con el bot).
  let externalId: string | null = conectado ? String(YO.id) : null;
  // F11 PR6: la transcripción (la prueba transcription.service.spec).
  const transcription = {
    assertQuota: vi.fn<(userId: string, seconds: number) => Promise<void>>(() => Promise.resolve()),
    transcribe: vi.fn<
      (input: {
        userId: string;
        messageId: string;
        audio: Uint8Array;
        seconds: number;
        signal?: AbortSignal;
      }) => Promise<string>
    >(() => Promise.resolve("hazme 3 ideas para reels")),
  };
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
    deleteByChat: (_tx: unknown, chatId: string) => {
      const i = filas.findIndex((r) => r.chatId === chatId);
      if (i !== -1) filas.splice(i, 1);
      return Promise.resolve();
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
  // De qué chat es cada mensaje del creator ("Reintentar" lo busca así).
  const mensajes = new Map<string, string>();
  const chat = {
    streamChat: vi.fn((_u: string, chatId: string, m: { id: string }, sink: TelegramSink) => {
      mensajes.set(m.id, chatId);
      return correr(chatId, sink);
    }),
    regenerateChat: vi.fn((_u: string, chatId: string, _id: string, sink: TelegramSink) =>
      correr(chatId, sink),
    ),
  };
  const api = {
    sendMessage: vi.fn<(...a: unknown[]) => Promise<never>>(() => Promise.resolve({} as never)),
    sendMessageDraft: vi.fn<(...a: unknown[]) => Promise<true>>(() => Promise.resolve(true)),
    editForumTopic: vi.fn<(...a: unknown[]) => Promise<true>>(() => Promise.resolve(true)),
    // F11 PR7b: "Continuar en Telegram" abre un tema (el id sube con cada uno).
    createForumTopic: vi.fn((_chat: number, name: string) =>
      Promise.resolve({
        message_thread_id: 100 + api.createForumTopic.mock.calls.length,
        name,
        icon_color: 7322096,
      }),
    ),
    getFile: vi.fn((fileId: string) =>
      Promise.resolve({
        file_id: fileId,
        file_unique_id: fileId,
        file_path: `photos/${fileId}.jpg`,
      }),
    ),
  };
  // F11 PR5: la subida de adjuntos (la prueba attachments.service.spec).
  let subidos = 0;
  const attachments = {
    upload: vi.fn((input: { userId: string; chatId: string | null; filename: string }) => {
      const id = `adj-${String(++subidos)}`;
      return Promise.resolve({
        id,
        mediaType: "image/jpeg",
        filename: input.filename,
        url: `/api/attachments/${id}/content`,
      });
    }),
  };
  const service = new Service(
    { runWithTenant: (_u: string, fn: (tx: unknown) => unknown) => fn({}) } as never,
    {
      resolveUser: resolveUser ?? (() => Promise.resolve(conectado ? "u1" : null)),
      activeExternalId: () => Promise.resolve(externalId),
    } as never,
    threads,
    {
      createChat,
      // F11 PR7b: los chats de la web que se llevan a Telegram.
      getChat: (_tx: unknown, id: string) =>
        Promise.resolve(
          id === "no-existe"
            ? undefined
            : { id, title: "Precios del café", archivedAt: id === "archivado" ? new Date() : null },
        ),
      chatIdOfMessage: (_tx: unknown, id: string) => Promise.resolve(mensajes.get(id)),
    } as never,
    chat as never,
    { findById: () => Promise.resolve({ timezone: "America/Merida" }) } as never,
    attachments as never,
    transcription as never,
  );
  const avisos = () => api.sendMessage.mock.calls.map((c) => c[1]);
  /** El id del mensaje del creator de cada turno, en orden. */
  const idsDeMensajes = () => [...mensajes.keys()];
  return {
    service,
    api,
    chat,
    createChat,
    filas,
    turnos,
    avisos,
    idsDeMensajes,
    attachments,
    transcription,
    /** F11 PR7b: cambia el Telegram conectado (null = desconectado). */
    conectarComo: (id: string | null) => {
      externalId = id;
    },
  };
}

/** Un error del Bot API como lo lanza grammY. */
const errorDeTelegram = (code: number, description: string) =>
  new GrammyError(description, { ok: false, error_code: code, description }, "sendMessage", {});

describe("Continuar en Telegram (F11 PR7b)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("abre un tema con el título, liga el chat ANTES de escribir, y escribe ahí", async () => {
    const t = montar();
    const orden: string[] = [];
    t.api.sendMessage.mockImplementation(() => {
      orden.push(`mensaje con ${String(t.filas.length)} fila(s)`);
      return Promise.resolve({} as never);
    });
    await t.service.continueChat(t.api, "u1", "web-1");
    expect(t.api.createForumTopic).toHaveBeenCalledWith(500, "Precios del café");
    expect(t.filas).toMatchObject([
      { chatId: "web-1", telegramChatId: 500, messageThreadId: 101, renameTopic: true },
    ]);
    expect(orden).toEqual(["mensaje con 1 fila(s)"]);
    expect(t.api.sendMessage).toHaveBeenCalledWith(500, copy.continued("Precios del café"), {
      message_thread_id: 101,
    });
    // Lo que conteste ahí sigue ese chat, no abre otro.
    await t.service.text(t.api, YO, { telegramChatId: 500, threadId: 101 }, "va");
    await flush();
    expect(t.createChat).not.toHaveBeenCalled();
    expect(t.chat.streamChat.mock.calls[0]![1]).toBe("web-1");
  });

  it("si el chat ya tiene tema, el aviso va ahí y no abre otro", async () => {
    const t = montar();
    await t.service.continueChat(t.api, "u1", "web-1");
    await t.service.continueChat(t.api, "u1", "web-1");
    expect(t.api.createForumTopic).toHaveBeenCalledTimes(1);
    expect(t.api.sendMessage).toHaveBeenLastCalledWith(
      500,
      copy.continuedHere("Precios del café"),
      { message_thread_id: 101 },
    );
  });

  it("si el creator borró el tema, lo suelta y abre otro", async () => {
    const t = montar();
    await t.service.continueChat(t.api, "u1", "web-1");
    t.api.sendMessage.mockRejectedValueOnce(
      errorDeTelegram(400, "Bad Request: message thread not found"),
    );
    await t.service.continueChat(t.api, "u1", "web-1");
    expect(t.api.createForumTopic).toHaveBeenCalledTimes(2);
    expect(t.filas).toMatchObject([{ chatId: "web-1", messageThreadId: 102 }]);
  });

  it("un tema de otro Telegram (se conectó otra cuenta) no se reusa", async () => {
    const t = montar();
    await t.service.continueChat(t.api, "u1", "web-1");
    t.conectarComo("777");
    await t.service.continueChat(t.api, "u1", "web-1");
    expect(t.api.createForumTopic).toHaveBeenLastCalledWith(777, "Precios del café");
    expect(t.filas).toMatchObject([{ chatId: "web-1", telegramChatId: 777 }]);
  });

  it("un doble clic abre un solo tema", async () => {
    const t = montar();
    await Promise.all([
      t.service.continueChat(t.api, "u1", "web-1"),
      t.service.continueChat(t.api, "u1", "web-1"),
    ]);
    expect(t.api.createForumTopic).toHaveBeenCalledTimes(1);
    expect(t.api.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("sin Telegram conectado: 409; sin chat: 404; nada sale a Telegram", async () => {
    const t = montar({ conectado: false });
    await expect(t.service.continueChat(t.api, "u1", "web-1")).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
    });
    t.conectarComo(String(YO.id));
    await expect(t.service.continueChat(t.api, "u1", "no-existe")).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
    });
    // Archivado: 409 (en Recientes no se vería lo que hablara ahí).
    await expect(t.service.continueChat(t.api, "u1", "archivado")).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
    });
    expect(t.api.createForumTopic).not.toHaveBeenCalled();
    expect(t.api.sendMessage).not.toHaveBeenCalled();
  });

  it("con el bot bloqueado: 409 con qué hacer; otro error de Telegram: 503", async () => {
    const t = montar();
    t.api.createForumTopic.mockRejectedValueOnce(
      errorDeTelegram(403, "Forbidden: bot was blocked by the user"),
    );
    await expect(t.service.continueChat(t.api, "u1", "web-1")).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      message: expect.stringContaining("toca Iniciar") as unknown,
    });
    t.api.createForumTopic.mockRejectedValueOnce(errorDeTelegram(500, "Internal Server Error"));
    await expect(t.service.continueChat(t.api, "u1", "web-2")).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
    });
  });
});

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

  it("Reintentar regenera ese mensaje en su chat; un mensaje que ya no existe, lo dice", async () => {
    const t = montar();
    await t.service.retry(t.api, YO, TEMA, "no-existe");
    expect(t.avisos()).toEqual([copy.chatGone]);

    await t.service.text(t.api, YO, TEMA, "hola");
    await flush();
    t.turnos[0]!.terminar();
    const [id] = t.idsDeMensajes();
    await t.service.retry(t.api, YO, TEMA, id!);
    await flush();
    expect(t.chat.regenerateChat).toHaveBeenCalledWith("u1", "chat-1", id, expect.anything(), {
      channel: "telegram",
      timezone: "America/Merida",
    });
  });

  it("Reintentar después de /new va al chat del mensaje, no al que ahora ocupa el lugar", async () => {
    const t = montar();
    await t.service.text(t.api, YO, SIN_TEMA, "primero");
    await flush();
    t.turnos[0]!.terminar();
    const [viejo] = t.idsDeMensajes();
    await t.service.newChat(YO, SIN_TEMA);
    await t.service.text(t.api, YO, SIN_TEMA, "otro chat");
    await flush();
    t.turnos[1]!.terminar();
    await t.service.retry(t.api, YO, SIN_TEMA, viejo!);
    await flush();
    expect(t.chat.regenerateChat.mock.calls[0]?.[1]).toBe("chat-1");
  });

  it("un 404 se dice según el caso: al reintentar, que ya no se puede; al escribir, que el chat no existe", async () => {
    const t = montar();
    await t.service.text(t.api, YO, TEMA, "hola");
    await flush();
    t.turnos[0]!.terminar();
    const [id] = t.idsDeMensajes();
    t.chat.regenerateChat.mockRejectedValueOnce(new HttpException("cualquier texto", 404));
    await t.service.retry(t.api, YO, TEMA, id!);
    await flush();
    t.chat.streamChat.mockRejectedValueOnce(new HttpException("otro texto", 404));
    await t.service.text(t.api, YO, TEMA, "sigue");
    await flush();
    expect(t.avisos()).toEqual([copy.cantRetry, copy.chatGone]);
  });

  it("si la base falla al saber de quién es el mensaje, se dice y nada truena", async () => {
    const t = montar({ resolveUser: () => Promise.reject(new Error("túnel caído")) });
    await expect(t.service.text(t.api, YO, TEMA, "hola")).resolves.toBeUndefined();
    await expect(t.service.retry(t.api, YO, TEMA, "m-1")).resolves.toBeUndefined();
    await flush();
    expect(t.avisos()).toEqual([copy.turnFailed, copy.turnFailed]);
    expect(t.chat.streamChat).not.toHaveBeenCalled();
  });

  it("el nombre del tema entra al título con el tope de un título", async () => {
    const t = montar();
    t.service.topicCreated(TEMA, "n".repeat(128), false);
    await t.service.text(t.api, YO, TEMA, "hola");
    await flush();
    expect(t.createChat.mock.calls[0]?.[2]).toBe("n".repeat(120));
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

// F11 PR5: fotos, álbumes y documentos. La bajada usa el fetch de mentira; la
// subida, AttachmentsService de mentira (montar).
describe("TelegramConversationService · adjuntos", () => {
  let ALBUM_WINDOW_MS: number;
  beforeAll(async () => {
    ({ ALBUM_WINDOW_MS } = await import("./telegram-conversation.service.js"));
  });
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(new Uint8Array([1, 2, 3])))),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const foto = (id: string, extra: { caption?: string; albumId?: string } = {}) => ({
    media: {
      kind: "file" as const,
      file: { fileId: id, fileSize: 1000, filename: "foto.jpg", photo: true },
    },
    caption: extra.caption,
    albumId: extra.albumId,
  });
  const docx = {
    media: {
      kind: "rejected" as const,
      filename: "plan.docx",
      label: "un archivo",
      reason: "unsupported" as const,
    },
    caption: "resúmelo",
    albumId: undefined,
  };
  const partesDe = (t: ReturnType<typeof montar>, i = 0) =>
    (t.chat.streamChat.mock.calls[i]?.[2] as unknown as { parts: unknown[] }).parts;

  it("una foto con caption: se sube sin chat todavía y el turno lleva el archivo y el texto", async () => {
    const t = montar();
    await t.service.media(t.api, YO, TEMA, foto("f1", { caption: "¿qué le pongo?" }));
    await flush();
    expect(t.attachments.upload).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", chatId: null, filename: "foto.jpg" }),
    );
    expect(partesDe(t)).toEqual([
      {
        type: "file",
        mediaType: "image/jpeg",
        filename: "foto.jpg",
        url: "/api/attachments/adj-1/content",
      },
      { type: "text", text: "¿qué le pongo?" },
    ]);
    // El draft de espera y el turno son el mismo draft.
    const [, draftId, html, other] = t.api.sendMessageDraft.mock.calls[0]!;
    expect(html).toBe(`<i>${copy.readingFiles}</i>`);
    expect(other).toMatchObject({ message_thread_id: 7, can_stop: true });
    const sink = t.turnos[0]!.sink as unknown as { options: { draftId: number } };
    expect(sink.options.draftId).toBe(draftId);
  });

  it("una foto sin caption corre su turno sola (decisión de Jose: como la web)", async () => {
    const t = montar();
    await t.service.media(t.api, YO, TEMA, foto("f1"));
    await flush();
    expect(partesDe(t)).toHaveLength(1);
  });

  it("un álbum que llega en paralelo es un solo mensaje, con las fotos numeradas", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const t = montar();
    await Promise.all([
      t.service.media(t.api, YO, TEMA, foto("f1", { albumId: "g1" })),
      t.service.media(t.api, YO, TEMA, foto("f2", { albumId: "g1", caption: "mis fotos" })),
      t.service.media(t.api, YO, TEMA, foto("f3", { albumId: "g1" })),
    ]);
    await flush();
    expect(t.chat.streamChat).not.toHaveBeenCalled();
    vi.advanceTimersByTime(ALBUM_WINDOW_MS);
    await flush();
    expect(t.chat.streamChat).toHaveBeenCalledTimes(1);
    expect(t.attachments.upload.mock.calls.map((c) => c[0].filename)).toEqual([
      "foto-1.jpg",
      "foto-2.jpg",
      "foto-3.jpg",
    ]);
    expect(partesDe(t).at(-1)).toEqual({ type: "text", text: "mis fotos" });
  });

  it("con 10 fotos el álbum se cierra sin esperar la ventana", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const t = montar();
    for (let i = 1; i <= 10; i++) {
      await t.service.media(t.api, YO, TEMA, foto(`f${String(i)}`, { albumId: "g1" }));
    }
    await flush();
    expect(t.chat.streamChat).toHaveBeenCalledTimes(1);
    expect(partesDe(t)).toHaveLength(10);
  });

  it("a quien no está conectado, un solo aviso por álbum", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const t = montar({ conectado: false });
    await Promise.all(
      ["f1", "f2", "f3"].map((id) => t.service.media(t.api, YO, TEMA, foto(id, { albumId: "g1" }))),
    );
    vi.advanceTimersByTime(ALBUM_WINDOW_MS);
    await flush();
    expect(t.avisos()).toEqual([copy.notLinked(webUrl)]);
    expect(t.attachments.upload).not.toHaveBeenCalled();
  });

  it("un archivo que no entra se avisa antes de la respuesta, y el resto sigue", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const t = montar();
    t.attachments.upload.mockRejectedValueOnce(
      new HttpException("Este PDF escaneado tiene demasiadas páginas.", 422),
    );
    await Promise.all([
      t.service.media(t.api, YO, TEMA, foto("f1", { albumId: "g1" })),
      t.service.media(t.api, YO, TEMA, foto("f2", { albumId: "g1" })),
    ]);
    vi.advanceTimersByTime(ALBUM_WINDOW_MS);
    await flush();
    expect(t.avisos()).toEqual([
      copy.skipped("foto-1.jpg", null, "este PDF escaneado tiene demasiadas páginas."),
    ]);
    expect(partesDe(t)).toHaveLength(1);
  });

  it("un documento que no se lee: solo el aviso, sin bajarlo, sin chat y sin turno", async () => {
    const t = montar();
    await t.service.media(t.api, YO, TEMA, docx);
    await flush();
    expect(t.avisos()).toEqual([copy.skipped("plan.docx", "un archivo", copy.unsupportedFile)]);
    expect(t.api.getFile).not.toHaveBeenCalled();
    expect(t.api.sendMessageDraft).not.toHaveBeenCalled();
    expect(t.createChat).not.toHaveBeenCalled();
    expect(t.chat.streamChat).not.toHaveBeenCalled();
  });

  it("un archivo de más de 20 MB que Telegram no deja bajar se avisa", async () => {
    const t = montar();
    t.api.getFile.mockRejectedValueOnce(
      new Error("Call to 'getFile' failed! (400: Bad Request: file is too big)"),
    );
    await t.service.media(t.api, YO, TEMA, foto("f1"));
    await flush();
    expect(t.avisos()).toEqual([copy.skipped("foto.jpg", null, copy.fileTooBig)]);
    expect(t.chat.streamChat).not.toHaveBeenCalled();
  });

  it("detener mientras se bajan los archivos: no corre el turno y se dice", async () => {
    const t = montar();
    let terminarSubida!: () => void;
    t.attachments.upload.mockImplementationOnce(
      (input) =>
        new Promise((resolve) => {
          terminarSubida = () =>
            resolve({
              id: "adj-x",
              mediaType: "image/jpeg",
              filename: input.filename,
              url: "/api/attachments/adj-x/content",
            });
        }),
    );
    await t.service.media(t.api, YO, TEMA, foto("f1"));
    await flush();
    const draftId = t.api.sendMessageDraft.mock.calls[0]![1] as number;
    t.service.stop(500, draftId);
    terminarSubida();
    await flush();
    expect(t.chat.streamChat).not.toHaveBeenCalled();
    expect(t.createChat).not.toHaveBeenCalled();
    expect(t.avisos()).toEqual([copy.stoppedBeforeStart]);
  });

  it("los archivos que pasan del presupuesto del mensaje (413) se dicen", async () => {
    const t = montar();
    t.chat.streamChat.mockRejectedValueOnce(new HttpException("muy largos", 413));
    await t.service.media(t.api, YO, TEMA, foto("f1"));
    await flush();
    expect(t.avisos()).toEqual([copy.tooMuchToRead]);
  });

  it("un álbum y luego un texto en el mismo tema se contestan en ese orden", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const t = montar();
    await t.service.media(t.api, YO, TEMA, foto("f1", { albumId: "g1" }));
    await t.service.text(t.api, YO, TEMA, "y otra cosa");
    vi.advanceTimersByTime(ALBUM_WINDOW_MS);
    await flush();
    expect(t.chat.streamChat).toHaveBeenCalledTimes(1);
    expect(partesDe(t)[0]).toMatchObject({ type: "file" });
    t.turnos[0]!.terminar();
    await flush();
    expect(partesDe(t, 1)).toEqual([{ type: "text", text: "y otra cosa" }]);
  });
});

describe("TelegramConversationService · hallazgos de la revisión del PR5", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(new Uint8Array([1, 2, 3])))),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const foto = (id: string) => ({
    media: {
      kind: "file" as const,
      file: { fileId: id, fileSize: 1000, filename: "foto.jpg", photo: true },
    },
    caption: undefined,
    albumId: undefined,
  });

  it("la fila se toma antes de saber de quién es: una foto y el texto que la sigue van en orden", async () => {
    // La búsqueda de la foto tarda más que la del texto.
    let primera = true;
    const t = montar({
      resolveUser: () => {
        const lenta = primera;
        primera = false;
        return new Promise((r) => setTimeout(() => r("u1"), lenta ? 20 : 0));
      },
    });
    void t.service.media(t.api, YO, TEMA, foto("f1"));
    void t.service.text(t.api, YO, TEMA, "resúmela");
    await new Promise((r) => setTimeout(r, 40));
    await flush();
    expect(t.chat.streamChat).toHaveBeenCalledTimes(1);
    const partes = (
      t.chat.streamChat.mock.calls[0]?.[2] as unknown as { parts: { type: string }[] }
    ).parts;
    expect(partes[0]?.type).toBe("file");
  });

  it("el draft de espera se refresca antes de que Telegram lo quite (30 s)", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const t = montar();
    let terminar!: () => void;
    t.attachments.upload.mockImplementationOnce(
      (input) =>
        new Promise((resolve) => {
          terminar = () =>
            resolve({
              id: "adj-x",
              mediaType: "image/jpeg",
              filename: input.filename,
              url: "/api/attachments/adj-x/content",
            });
        }),
    );
    await t.service.media(t.api, YO, TEMA, foto("f1"));
    await flush();
    expect(t.api.sendMessageDraft).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(25_000);
    await flush();
    expect(t.api.sendMessageDraft).toHaveBeenCalledTimes(2);
    terminar();
    await flush();
    // Ya en el turno: el de espera no vuelve a salir.
    vi.advanceTimersByTime(25_000);
    await flush();
    expect(t.api.sendMessageDraft).toHaveBeenCalledTimes(2);
  });

  it("un archivo de un álbum sin nombre se nombra por lo que es, sin comillas", () => {
    expect(copy.skipped(null, "un video", copy.unsupportedFile)).toMatch(/^No pude leer un video:/);
    expect(copy.skipped("menu.docx", "un archivo", copy.unsupportedFile)).toMatch(
      /^No pude leer «menu\.docx»:/,
    );
  });
});

// F11 PR6: notas de voz y audios. La bajada usa el fetch de mentira; la
// transcripción, TranscriptionService de mentira (montar).
describe("TelegramConversationService · notas de voz", () => {
  let ECHO_MAX_CHARS: number;
  let echoOf: (text: string) => string;
  beforeAll(async () => {
    ({ ECHO_MAX_CHARS, echoOf } = await import("./telegram-conversation.service.js"));
  });
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(new Uint8Array([1, 2, 3])))),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const nota = (seconds = 42, extra: { caption?: string; fileSize?: number } = {}) => ({
    voice: { fileId: "v1", fileSize: extra.fileSize ?? 50_000, seconds },
    caption: extra.caption,
  });
  const mensajeDe = (t: ReturnType<typeof montar>, i = 0) =>
    t.chat.streamChat.mock.calls[i]?.[2] as unknown as { id: string; parts: unknown[] };
  const opcionesDe = (t: ReturnType<typeof montar>, i = 0) =>
    (t.chat.streamChat.mock.calls[i] as unknown[] | undefined)?.[4] as Record<string, unknown>;

  it("se transcribe, sale el eco plegable y el turno lleva la transcripción con su duración", async () => {
    const t = montar();
    await t.service.voice(t.api, YO, TEMA, nota(42));
    await flush();
    expect(t.transcription.assertQuota).toHaveBeenCalledWith("u1", 42);
    const input = t.transcription.transcribe.mock.calls[0]![0];
    expect(input).toMatchObject({ userId: "u1", seconds: 42 });
    expect(input.audio).toEqual(new Uint8Array([1, 2, 3]));
    // El cobro va con el id del mensaje que lleva la transcripción.
    expect(mensajeDe(t).id).toBe(input.messageId);
    expect(mensajeDe(t).parts).toEqual([{ type: "text", text: "hazme 3 ideas para reels" }]);
    expect(opcionesDe(t)).toMatchObject({ channel: "telegram", voiceSeconds: 42 });
    // El eco: HTML, plegable, en el tema.
    const [, html, other] = t.api.sendMessage.mock.calls[0]!;
    expect(html).toBe("<blockquote expandable>🎤 Escuché: hazme 3 ideas para reels</blockquote>");
    expect(other).toMatchObject({ message_thread_id: 7, parse_mode: "HTML" });
    // El turno va en otro draft que "Escuchando tu nota…": un draft se queda
    // donde nació, y el de la respuesta tiene que nacer debajo del eco.
    const [, draftId, espera, opciones] = t.api.sendMessageDraft.mock.calls[0]!;
    expect(espera).toBe(`<i>${copy.listening}</i>`);
    expect(opciones).toMatchObject({ message_thread_id: 7, can_stop: true });
    const sink = t.turnos[0]!.sink as unknown as { options: { draftId: number } };
    expect(sink.options.draftId).not.toBe(draftId);
  });

  it("el eco se escapa: lo que dijo el creator nunca es HTML", async () => {
    const t = montar();
    t.transcription.transcribe.mockResolvedValueOnce("<b>2 & 3</b>");
    await t.service.voice(t.api, YO, TEMA, nota());
    await flush();
    expect(t.avisos()[0]).toContain("&lt;b&gt;2 &amp; 3&lt;/b&gt;");
    // El mensaje guarda el texto tal cual.
    expect(mensajeDe(t).parts).toEqual([{ type: "text", text: "<b>2 & 3</b>" }]);
  });

  it("el eco de una nota larga se recorta; el mensaje guarda la transcripción completa", () => {
    const larga = "palabra ".repeat(1_000);
    expect([...echoOf(larga)].length).toBeLessThanOrEqual(ECHO_MAX_CHARS + 1);
    expect(echoOf(larga).endsWith("…")).toBe(true);
    expect(echoOf("corta")).toBe("corta");
  });

  it("un audio con caption: la transcripción y después el caption", async () => {
    const t = montar();
    await t.service.voice(t.api, YO, TEMA, nota(30, { caption: " es de mi cliente " }));
    await flush();
    expect(mensajeDe(t).parts).toEqual([
      { type: "text", text: "hazme 3 ideas para reels\n\nes de mi cliente" },
    ]);
  });

  it("más de 10 minutos: el aviso, sin bajarla, sin transcribir ni cobrar", async () => {
    const t = montar();
    await t.service.voice(t.api, YO, TEMA, nota(601));
    await flush();
    expect(t.avisos()).toEqual([copy.voiceTooLong]);
    expect(t.api.getFile).not.toHaveBeenCalled();
    expect(t.transcription.assertQuota).not.toHaveBeenCalled();
    expect(t.transcription.transcribe).not.toHaveBeenCalled();
    // 10 minutos justos sí entran.
    const u = montar();
    await u.service.voice(u.api, YO, TEMA, nota(600));
    await flush();
    expect(u.transcription.transcribe).toHaveBeenCalled();
  });

  it("un audio de más de 20 MB: el aviso, sin bajarlo", async () => {
    const t = montar();
    await t.service.voice(t.api, YO, TEMA, nota(300, { fileSize: 21 * 1024 * 1024 }));
    await flush();
    expect(t.avisos()).toEqual([copy.voiceTooBig]);
    expect(t.api.getFile).not.toHaveBeenCalled();
  });

  it("sin cuota: el aviso con el enlace a Plan, sin transcribir", async () => {
    const t = montar();
    t.transcription.assertQuota.mockRejectedValueOnce(
      new HttpException("sin cuota", HttpStatus.PAYMENT_REQUIRED),
    );
    await t.service.voice(t.api, YO, TEMA, nota());
    await flush();
    expect(t.avisos()).toEqual([copy.noQuota(webUrl)]);
    expect(t.api.getFile).not.toHaveBeenCalled();
    expect(t.transcription.transcribe).not.toHaveBeenCalled();
  });

  it("una nota en silencio: el aviso, sin chat ni turno", async () => {
    const t = montar();
    t.transcription.transcribe.mockResolvedValueOnce("");
    await t.service.voice(t.api, YO, TEMA, nota());
    await flush();
    expect(t.avisos()).toEqual([copy.voiceEmpty]);
    expect(t.createChat).not.toHaveBeenCalled();
    expect(t.chat.streamChat).not.toHaveBeenCalled();
  });

  it("si la transcripción falla: el aviso, sin chat ni turno", async () => {
    const t = montar();
    t.transcription.transcribe.mockRejectedValueOnce(new Error("todos cayeron"));
    await t.service.voice(t.api, YO, TEMA, nota());
    await flush();
    expect(t.avisos()).toEqual([copy.voiceFailed]);
    expect(t.createChat).not.toHaveBeenCalled();
  });

  it("detener mientras escucha corta la transcripción, y no corre el turno", async () => {
    const t = montar();
    let señal: AbortSignal | undefined;
    t.transcription.transcribe.mockImplementationOnce(
      (input) =>
        new Promise((_resolve, reject) => {
          señal = input.signal;
          input.signal?.addEventListener("abort", () => reject(new Error("abortado")));
        }),
    );
    await t.service.voice(t.api, YO, TEMA, nota());
    await flush();
    const draftId = t.api.sendMessageDraft.mock.calls[0]![1] as number;
    t.service.stop(500, draftId);
    await flush();
    expect(señal?.aborted).toBe(true);
    expect(t.avisos()).toEqual([copy.stoppedBeforeStart]);
    expect(t.chat.streamChat).not.toHaveBeenCalled();
  });

  it("detener justo cuando terminó de transcribir: sin eco ni turno", async () => {
    const t = montar();
    let terminar!: (text: string) => void;
    t.transcription.transcribe.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          terminar = resolve;
        }),
    );
    await t.service.voice(t.api, YO, TEMA, nota());
    await flush();
    const draftId = t.api.sendMessageDraft.mock.calls[0]![1] as number;
    t.service.stop(500, draftId);
    terminar("ya la oí");
    await flush();
    expect(t.avisos()).toEqual([copy.stoppedBeforeStart]);
    expect(t.chat.streamChat).not.toHaveBeenCalled();
  });

  it("una nota y luego un texto en el mismo tema se contestan en ese orden", async () => {
    const t = montar();
    let terminar!: (text: string) => void;
    t.transcription.transcribe.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          terminar = resolve;
        }),
    );
    void t.service.voice(t.api, YO, TEMA, nota());
    void t.service.text(t.api, YO, TEMA, "y otra cosa");
    await flush();
    expect(t.chat.streamChat).not.toHaveBeenCalled();
    terminar("primero la nota");
    await flush();
    expect(mensajeDe(t).parts).toEqual([{ type: "text", text: "primero la nota" }]);
    t.turnos[0]!.terminar();
    await flush();
    expect(mensajeDe(t, 1).parts).toEqual([{ type: "text", text: "y otra cosa" }]);
  });

  it('el detener de "Escuchando tu nota…" que sigue a la vista detiene el turno (revisión del PR6)', async () => {
    const t = montar();
    await t.service.voice(t.api, YO, TEMA, nota());
    await flush();
    const escuchando = t.api.sendMessageDraft.mock.calls[0]![1] as number;
    const turno = t.turnos[0]!.sink as unknown as { options: { draftId: number } };
    const parar = vi.spyOn(t.turnos[0]!.sink, "stop");
    t.service.stop(500, escuchando);
    expect(parar).toHaveBeenCalled();
    expect(turno.options.draftId).not.toBe(escuchando);
  });

  it("una transcripción más larga que un mensaje de la web no entra al turno", async () => {
    const t = montar();
    t.transcription.transcribe.mockResolvedValueOnce("a".repeat(50_001));
    await t.service.voice(t.api, YO, TEMA, nota(30));
    await flush();
    expect(t.avisos()).toEqual([copy.voiceTooLong]);
    expect(t.chat.streamChat).not.toHaveBeenCalled();
  });

  it("a quien no está conectado: cómo conectarse, sin transcribir", async () => {
    const t = montar({ conectado: false });
    await t.service.voice(t.api, YO, TEMA, nota());
    await flush();
    expect(t.avisos()).toEqual([copy.notLinked(webUrl)]);
    expect(t.transcription.transcribe).not.toHaveBeenCalled();
  });
});
