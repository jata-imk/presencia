import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TelegramBotService as BotService } from "./telegram-bot.service.js";

// El arranque del bot (F11 PR3, hallazgos de la revisión): un fallo pasajero
// de Telegram se reintenta solo, y apagar el módulo a medio arranque no deja
// un polling huérfano (la trampa de `tsx watch`). Con un bot de mentira: lo
// que se prueba es el ciclo de vida, no grammY.

let TelegramBotService: typeof BotService;
let LAUNCH_RETRY_MS: readonly number[];

beforeAll(async () => {
  // El modo se fija antes de leer el .env: loadEnvFile no pisa lo que ya hay.
  process.env.TELEGRAM_MODE = "polling";
  try {
    process.loadEnvFile("../../.env");
  } catch {
    // sin .env: se usa el process.env tal cual (CI)
  }
  ({ TelegramBotService, LAUNCH_RETRY_MS } = await import("./telegram-bot.service.js"));
});

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}
function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

/** Un Bot de grammY de mentira: `init` y `start` hacen lo que cada caso pida. */
function botFalso(opts: { init?: () => Promise<void>; start?: () => Promise<void> } = {}) {
  const bot = {
    inited: false,
    isInited: () => bot.inited,
    init: vi.fn(async () => {
      await (opts.init ?? (() => Promise.resolve()))();
      bot.inited = true;
    }),
    api: {
      // El menú de comandos falla siempre: no debe impedir el arranque.
      setMyCommands: vi.fn(() => Promise.reject(new Error("menú caído"))),
      setWebhook: vi.fn(() => Promise.resolve(true)),
    },
    // Por default, el polling corre hasta que lo detengan.
    start: vi.fn(opts.start ?? (() => new Promise<void>(() => {}))),
    isRunning: () => false,
    stop: vi.fn(() => Promise.resolve()),
    botInfo: { username: "bot_de_prueba" },
  };
  return bot;
}

function servicio(bot: ReturnType<typeof botFalso>) {
  const s = new TelegramBotService(
    {} as never,
    {} as never,
    { onTitled: () => () => undefined } as never,
  );
  (s as unknown as { bot: unknown }).bot = bot;
  const launch = () => (s as unknown as { launch(b: unknown): Promise<void> }).launch(bot);
  return { s, launch };
}

describe("TelegramBotService: arranque", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("un fallo al arrancar se reintenta solo, y el menú caído no lo frena", async () => {
    let fallas = 2;
    const bot = botFalso({
      init: () => (fallas-- > 0 ? Promise.reject(new Error("502 Bad Gateway")) : Promise.resolve()),
    });
    const { s, launch } = servicio(bot);

    await launch();
    expect(s.username).toBeNull();
    expect(bot.start).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(LAUNCH_RETRY_MS[0]!);
    expect(bot.init).toHaveBeenCalledTimes(2);
    expect(s.username).toBeNull();

    await vi.advanceTimersByTimeAsync(LAUNCH_RETRY_MS[1]!);
    expect(bot.init).toHaveBeenCalledTimes(3);
    expect(bot.start).toHaveBeenCalledTimes(1);
    expect(s.username).toBe("bot_de_prueba");
  });

  it("si el polling se cae (409), vuelve a intentarlo", async () => {
    let caidas = 1;
    const bot = botFalso({
      start: () =>
        caidas-- > 0 ? Promise.reject(new Error("409 Conflict")) : new Promise<void>(() => {}),
    });
    const { s, launch } = servicio(bot);

    await launch();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.username).toBeNull();

    await vi.advanceTimersByTimeAsync(LAUNCH_RETRY_MS[0]!);
    expect(bot.start).toHaveBeenCalledTimes(2);
    expect(s.username).toBe("bot_de_prueba");
  });

  it("apagar a medio arranque no deja un polling huérfano", async () => {
    const init = deferred();
    const bot = botFalso({ init: () => init.promise });
    const { s, launch } = servicio(bot);

    const arrancando = launch();
    await s.onModuleDestroy();
    init.resolve();
    await arrancando;

    expect(bot.start).not.toHaveBeenCalled();
    expect(s.username).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("apagar con un reintento pendiente lo cancela", async () => {
    const bot = botFalso({ init: () => Promise.reject(new Error("timeout")) });
    const { s, launch } = servicio(bot);

    await launch();
    expect(vi.getTimerCount()).toBe(1);
    await s.onModuleDestroy();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(LAUNCH_RETRY_MS.at(-1)!);
    expect(bot.init).toHaveBeenCalledTimes(1);
  });
});

// F11 PR5: a dónde va cada mensaje. Con un Bot de grammY de verdad (sus
// filtros son lo que se prueba) y la API interceptada: nada sale a Telegram.
describe("TelegramBotService: a dónde va cada mensaje", () => {
  async function montarRuteo() {
    const { Bot } = await import("grammy");
    const bot = new Bot("123:abc", {
      botInfo: {
        id: 123,
        is_bot: true,
        first_name: "Presencia",
        username: "bot_de_prueba",
        can_join_groups: false,
        can_read_all_group_messages: false,
        supports_inline_queries: false,
        can_connect_to_business: false,
        has_main_web_app: false,
      } as never,
    });
    const respuestas: string[] = [];
    bot.api.config.use((_prev, method, payload) => {
      if (method === "sendMessage") respuestas.push((payload as { text: string }).text);
      return Promise.resolve({ ok: true, result: true } as never);
    });
    const conversation = {
      text: vi.fn(() => Promise.resolve()),
      media: vi.fn(() => Promise.resolve()),
    };
    const commands = { message: vi.fn((_from: unknown, kind: string) => Promise.resolve(kind)) };
    const s = new TelegramBotService(
      commands as never,
      conversation as never,
      { onTitled: () => () => undefined } as never,
    );
    (s as unknown as { register(b: unknown): void }).register(bot);
    let id = 0;
    const enviar = (message: Record<string, unknown>) =>
      bot.handleUpdate({
        update_id: ++id,
        message: {
          message_id: id,
          date: 0,
          chat: { id: 5, type: "private", first_name: "Jose" },
          from: { id: 5, is_bot: false, first_name: "Jose" },
          ...message,
        },
      } as never);
    return { conversation, commands, respuestas, enviar };
  }

  it("foto y documento van a la conversación; la voz y el sticker reciben su aviso", async () => {
    const t = await montarRuteo();
    await t.enviar({
      photo: [{ file_id: "p", file_unique_id: "p", width: 10, height: 10 }],
      caption: "mira",
    });
    await t.enviar({
      document: { file_id: "d", file_unique_id: "d", file_name: "plan.docx" },
    });
    await t.enviar({ voice: { file_id: "v", file_unique_id: "v", duration: 3 } });
    await t.enviar({
      sticker: {
        file_id: "s",
        file_unique_id: "s",
        type: "regular",
        width: 1,
        height: 1,
        is_animated: false,
        is_video: false,
      },
    });
    // Un video suelto no es del turno; en un álbum sí, para avisar junto con el resto.
    await t.enviar({
      video: { file_id: "x", file_unique_id: "x", width: 1, height: 1, duration: 1 },
    });
    await t.enviar({
      video: { file_id: "y", file_unique_id: "y", width: 1, height: 1, duration: 1 },
      media_group_id: "g1",
    });
    const items = t.conversation.media.mock.calls.map(
      (c) => (c as unknown[])[3] as { caption?: string; albumId?: string; media: object },
    );
    expect(items.map((i) => [i.caption, i.albumId, i.media])).toEqual([
      [
        "mira",
        undefined,
        { kind: "file", file: expect.objectContaining({ photo: true }) as object },
      ],
      [
        undefined,
        undefined,
        { kind: "rejected", filename: "plan.docx", label: "un archivo", reason: "unsupported" },
      ],
      [
        undefined,
        "g1",
        { kind: "rejected", filename: null, label: "un video", reason: "unsupported" },
      ],
    ]);
    expect(t.respuestas).toEqual(["voice", "other", "other"]);
    expect(t.conversation.text).not.toHaveBeenCalled();
  });
});
