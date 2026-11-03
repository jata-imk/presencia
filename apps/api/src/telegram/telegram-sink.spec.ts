import type { UIMessageChunk } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TurnStream } from "../chat/turn-sink.js";
import { copy } from "./telegram.copy.js";
import { TelegramSink, buttonUrlAllowed } from "./telegram-sink.js";

// Cómo se ve un turno en Telegram (F11 PR4): el draft mientras corre (con su
// línea de paso y su ritmo), y lo que se queda: la respuesta en HTML, las
// fuentes, las cards y la nota de detenida o fallida con "Reintentar". Con un
// stream y un cliente de mentira: lo que el turno guarda lo prueba
// chat.service.spec.

const USER_MESSAGE = "11111111-2222-4333-8444-555555555555";

/** Un stream que suelta los chunks cuando el caso lo pide. */
function streamControlado() {
  const queue: (UIMessageChunk | null)[] = [];
  let wake: (() => void) | null = null;
  const push = (chunk: UIMessageChunk | null) => {
    queue.push(chunk);
    wake?.();
  };
  const stream: TurnStream = {
    pipeUIMessageStreamToResponse: () => Promise.reject(new Error("no aplica")),
    toUIMessageStream: () =>
      (async function* () {
        for (;;) {
          while (queue.length === 0) await new Promise<void>((r) => (wake = r));
          const next = queue.shift()!;
          if (next === null) return;
          yield next;
        }
      })(),
  };
  return { stream, push, end: () => push(null) };
}

function apiFalsa() {
  return {
    sendMessage: vi.fn<(...args: unknown[]) => Promise<never>>(() =>
      Promise.resolve({ message_id: 1 } as never),
    ),
    sendMessageDraft: vi.fn<(...args: unknown[]) => Promise<true>>(() => Promise.resolve(true)),
  };
}

function sink(api: ReturnType<typeof apiFalsa>, webUrl = "http://localhost:5173") {
  return new TelegramSink({
    api: api,
    place: { telegramChatId: 99, threadId: 7 },
    chatId: "chat-1",
    userMessageId: USER_MESSAGE,
    draftId: 42,
    webUrl,
    draftIntervalMs: 1_000,
  });
}

const texto = (id: string, ...deltas: string[]): UIMessageChunk[] => [
  { type: "text-start", id },
  ...deltas.map((delta) => ({ type: "text-delta" as const, id, delta })),
  { type: "text-end", id },
];

/** Los textos que quedaron en el chat, en orden. */
const enviados = (api: ReturnType<typeof apiFalsa>) => api.sendMessage.mock.calls.map((c) => c[1]);

describe("TelegramSink", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("la respuesta queda en HTML en su tema, sin vista previa de enlaces", async () => {
    const api = apiFalsa();
    const s = sink(api);
    const { stream, push, end } = streamControlado();
    const entrega = s.deliver(stream, {});
    for (const c of texto("t1", "**Hola**", ", aquí tienes tus ideas.")) push(c);
    end();
    await entrega;

    expect(s.delivered).toBe(true);
    expect(api.sendMessage).toHaveBeenCalledTimes(1);
    expect(api.sendMessage).toHaveBeenCalledWith(99, "<b>Hola</b>, aquí tienes tus ideas.", {
      message_thread_id: 7,
      link_preview_options: { is_disabled: true },
      parse_mode: "HTML",
    });
  });

  it("el draft: 'Pensando…' al empezar, el paso mientras no hay texto, y uno por segundo", async () => {
    const api = apiFalsa();
    const s = sink(api);
    const { stream, push, end } = streamControlado();
    const entrega = s.deliver(stream, {});
    await vi.advanceTimersByTimeAsync(0);
    // El primero, vacío y con el botón de detener.
    expect(api.sendMessageDraft).toHaveBeenNthCalledWith(1, 99, 42, "", {
      message_thread_id: 7,
      can_stop: true,
      parse_mode: "HTML",
    });

    push({ type: "tool-input-start", toolCallId: "c1", toolName: "buscar_en_web" });
    push({
      type: "tool-input-available",
      toolCallId: "c1",
      toolName: "buscar_en_web",
      input: { consulta: "café en Mérida" },
    });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(api.sendMessageDraft.mock.calls.at(-1)?.[2]).toBe("<i>Buscando 'café en Mérida'…</i>");

    // Sin cambios, no se vuelve a mandar.
    const antes = api.sendMessageDraft.mock.calls.length;
    await vi.advanceTimersByTimeAsync(3_000);
    expect(api.sendMessageDraft.mock.calls.length).toBe(antes);

    push({
      type: "tool-output-available",
      toolCallId: "c1",
      output: { estado: "sin_resultados", resultados: [] },
    });
    for (const c of texto("t1", "Según **lo que", " encontré**")) push(c);
    await vi.advanceTimersByTimeAsync(1_000);
    // Markdown a medias, HTML cerrado.
    expect(api.sendMessageDraft.mock.calls.at(-1)?.[2]).toBe("Según <b>lo que encontré</b>");

    end();
    await entrega;
  });

  it("detener: avisa al turno, y lo que alcanzó a escribirse queda con la nota y 'Reintentar'", async () => {
    const api = apiFalsa();
    const s = sink(api);
    const corte = vi.fn();
    s.onGone(corte);
    const { stream, push, end } = streamControlado();
    const entrega = s.deliver(stream, {});
    for (const c of texto("t1", "Primera idea")) push(c);
    s.stop();
    expect(s.gone).toBe(true);
    expect(corte).toHaveBeenCalledTimes(1);
    push({ type: "abort" });
    end();
    await entrega;

    expect(enviados(api)).toEqual(["Primera idea", `<i>${copy.stoppedNote}</i>`]);
    expect(api.sendMessage.mock.calls[1]?.[2]).toMatchObject({
      reply_markup: {
        inline_keyboard: [[{ text: "Reintentar", callback_data: `retry:${USER_MESSAGE}` }]],
      },
    });
    // Detener después de entregar ya no hace nada.
    s.stop();
    expect(corte).toHaveBeenCalledTimes(1);
  });

  it("un turno que falla deja el aviso con 'Reintentar'", async () => {
    const api = apiFalsa();
    const s = sink(api);
    const { stream, push, end } = streamControlado();
    const entrega = s.deliver(stream, {});
    push({
      type: "error",
      errorText: "Algo salió mal generando la respuesta. Inténtalo de nuevo.",
    });
    end();
    await entrega;
    expect(enviados(api)).toEqual([copy.turnFailed]);
    expect(api.sendMessage.mock.calls[0]?.[2]).toMatchObject({
      reply_markup: { inline_keyboard: [[{ callback_data: `retry:${USER_MESSAGE}` }]] },
    });
  });

  it("las fuentes van al final de la respuesta", async () => {
    const api = apiFalsa();
    const s = sink(api);
    const { stream, push, end } = streamControlado();
    const entrega = s.deliver(stream, {});
    push({ type: "tool-input-start", toolCallId: "b1", toolName: "buscar_en_web" });
    push({
      type: "tool-output-available",
      toolCallId: "b1",
      output: {
        searchId: null,
        consulta: "festival",
        estado: "ok",
        resultados: [
          {
            titulo: "Festival & más",
            url: "https://diario.mx/f",
            dominio: "diario.mx",
            fragmento: "",
            fecha: null,
          },
          {
            titulo: "Otra",
            url: "https://otro.mx/x",
            dominio: "otro.mx",
            fragmento: "",
            fecha: null,
          },
        ],
      },
    });
    for (const c of texto("t1", "Es el sábado ([Diario](https://diario.mx/f)).")) push(c);
    end();
    await entrega;
    expect(enviados(api)).toEqual([
      'Es el sábado (<a href="https://diario.mx/f">Diario</a>).\n\n<b>Fuentes</b>\n• <a href="https://diario.mx/f">Festival &amp; más</a> · diario.mx',
    ]);
  });

  it("una card: su mensaje con la red y el texto; el botón solo con una URL que Telegram acepta", async () => {
    const card = {
      type: "tool-output-available" as const,
      toolCallId: "k1",
      output: {
        cardId: "card-1",
        network: "instagram",
        status: "draft",
        content: {
          archetype: "visual_first",
          caption: "Café de olla <3",
          hashtags: ["cafe"],
          assetIds: [],
          slides: [],
        },
      },
    };
    for (const [webUrl, conBoton] of [
      ["http://localhost:5173", false],
      ["https://presencia.josetejero.com", true],
    ] as const) {
      const api = apiFalsa();
      const s = sink(api, webUrl);
      const { stream, push, end } = streamControlado();
      const entrega = s.deliver(stream, {});
      push({ type: "tool-input-start", toolCallId: "k1", toolName: "crear_borrador_visual" });
      push(card);
      for (const c of texto("t1", "Va tu borrador.")) push(c);
      end();
      await entrega;
      const [respuesta, tarjeta] = enviados(api);
      expect(respuesta).toBe("Va tu borrador.");
      expect(tarjeta).toContain("📝 <b>Borrador para Instagram</b>");
      expect(tarjeta).toContain("Café de olla &lt;3");
      const opciones = api.sendMessage.mock.calls[1]?.[2] as { reply_markup?: unknown };
      if (conBoton) {
        expect(opciones.reply_markup).toEqual({
          inline_keyboard: [[{ text: "Abrir en Presencia", url: `${webUrl}/chats/chat-1` }]],
        });
      } else {
        expect(opciones.reply_markup).toBeUndefined();
        expect(tarjeta).toContain(`Ábrelo en Presencia: ${webUrl}/chats/chat-1`);
      }
    }
  });

  it("si Telegram no acepta el HTML, el mismo texto llega sin formato", async () => {
    const api = apiFalsa();
    api.sendMessage.mockRejectedValueOnce(new Error("Bad Request: can't parse entities: x"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = sink(api);
    const { stream, push, end } = streamControlado();
    const entrega = s.deliver(stream, {});
    for (const c of texto("t1", "**Tom & Jerry**")) push(c);
    end();
    await entrega;
    expect(api.sendMessage).toHaveBeenCalledTimes(2);
    expect(api.sendMessage.mock.calls[1]?.[1]).toBe("Tom & Jerry");
    expect(api.sendMessage.mock.calls[1]?.[2]).not.toHaveProperty("parse_mode");
  });

  it("sin tema (Telegram X): sin message_thread_id", async () => {
    const api = apiFalsa();
    const s = new TelegramSink({
      api: api,
      place: { telegramChatId: 99, threadId: null },
      chatId: "chat-1",
      userMessageId: USER_MESSAGE,
      draftId: 1,
      webUrl: "http://localhost:5173",
    });
    const { stream, push, end } = streamControlado();
    const entrega = s.deliver(stream, {});
    for (const c of texto("t1", "Hola")) push(c);
    end();
    await entrega;
    expect(api.sendMessage.mock.calls[0]?.[2]).not.toHaveProperty("message_thread_id");
  });
});

describe("buttonUrlAllowed", () => {
  it("solo dominios públicos", () => {
    expect(buttonUrlAllowed("https://presencia.josetejero.com/chats/1")).toBe(true);
    expect(buttonUrlAllowed("http://localhost:5173/chats/1")).toBe(false);
    expect(buttonUrlAllowed("http://127.0.0.1:5173")).toBe(false);
    expect(buttonUrlAllowed("javascript:alert(1)")).toBe(false);
  });
});
