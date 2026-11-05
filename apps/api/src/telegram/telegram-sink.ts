import type { UIMessage, UIMessageStreamOptions } from "ai";
import type { Api } from "grammy";
import type { InlineKeyboardMarkup } from "grammy/types";
import { NETWORK_LABELS, buildPostText, webSources } from "@presencia/shared";
import type { TurnSink, TurnStream } from "../chat/turn-sink.js";
import { copy } from "./telegram.copy.js";
import {
  escapeAttr,
  escapeHtml,
  safeHref,
  stripTags,
  toTelegramDraft,
  toTelegramMessages,
  TELEGRAM_MESSAGE_LIMIT,
} from "./telegram-html.js";
import type { TelegramPlace } from "./telegram-threads.repository.js";
import { TurnProgress, type TurnCard } from "./telegram-turn.js";

// El turno del chat entregado en Telegram (F11 PR4, ADR-030): el `TurnSink`
// del canal (chat/turn-sink.ts). Lee el mismo stream que la web
// (`toUIMessageStream`, con el mismo `onEnd`, que guarda y cobra) y lo pinta:
//
// - mientras corre: un draft (`sendMessageDraft`) con el texto o, si todavía
//   no hay, la línea del paso ("Buscando…"), con el botón de detener
//   (`can_stop`). Uno por segundo como mucho, y nunca con una etiqueta
//   abierta (telegram-html.ts arma el HTML desde tokens);
// - al terminar: la respuesta en mensajes HTML (un draft desaparece solo), las
//   fuentes, un mensaje por card con el botón para abrirla en Presencia, y si
//   se detuvo o falló, una nota con "Reintentar".
//
// Detener: el botón del draft manda el update `stopped_message_generation`, y
// TelegramConversationService llama a `stop()`. Para el turno es lo mismo que
// la pestaña web que se cierra: `gone`, y aborta.

/** Lo que el sink usa del cliente de grammY. */
export type TelegramApi = Pick<Api, "sendMessage" | "sendMessageDraft">;

export interface TelegramSinkOptions {
  api: TelegramApi;
  place: TelegramPlace;
  /** El chat de Presencia: el botón de las cards abre ese chat. */
  chatId: string;
  /** El mensaje del creator que contesta este turno: "Reintentar" lo regenera. */
  userMessageId: string;
  draftId: number;
  webUrl: string;
  /** Cada cuánto se refresca el draft. Telegram aguanta más, pero así no se agota el límite. */
  draftIntervalMs?: number;
}

/** Un draft que no se refresca desaparece a los 30 s: se vuelve a mandar antes. */
const DRAFT_KEEPALIVE_MS = 20_000;
const SOURCES_SHOWN = 5;
const CARD_PREVIEW_CHARS = 600;

/** Telegram rechaza un botón de URL a localhost o a una IP (BUTTON_URL_INVALID). */
export function buttonUrlAllowed(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== "https:" && protocol !== "http:") return false;
    if (hostname === "localhost" || !hostname.includes(".")) return false;
    return !/^\d+\.\d+\.\d+\.\d+$/.test(hostname) && !hostname.startsWith("[");
  } catch {
    return false;
  }
}

/** Un enlace, si su URL es de las que Telegram abre; si no, el texto solo. */
function link(url: string, inner: string): string {
  const href = safeHref(url);
  return href ? `<a href="${escapeAttr(href)}">${inner}</a>` : inner;
}

/** El error de grammY cuando el HTML no le gustó a Telegram. */
function isParseError(error: unknown): boolean {
  return error instanceof Error && /can't parse entities/i.test(error.message);
}

/** El HTML como texto plano, para reintentar sin formato. */
function toPlain(html: string): string {
  return stripTags(html)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

export class TelegramSink implements TurnSink {
  private goneFlag = false;
  private deliveredFlag = false;
  private readonly listeners: (() => void)[] = [];
  private resolveFinished!: () => void;
  /** Se cumple cuando el turno se entregó entero (o la entrega se cayó). */
  readonly finished = new Promise<void>((resolve) => {
    this.resolveFinished = resolve;
  });
  /** El turno llegó a entregarse (un turno rechazado antes, no). */
  started = false;

  private readonly progress = new TurnProgress();
  private drafted = -1;
  private lastDraftAt = 0;
  private draftInFlight: Promise<void> | null = null;
  private draftWarned = false;

  constructor(private readonly options: TelegramSinkOptions) {}

  get gone(): boolean {
    return this.goneFlag;
  }

  get delivered(): boolean {
    return this.deliveredFlag;
  }

  onGone(listener: () => void): void {
    this.listeners.push(listener);
  }

  /** El creator apretó detener en el draft. */
  stop(): void {
    if (this.goneFlag || this.deliveredFlag) return;
    this.goneFlag = true;
    for (const listener of this.listeners) listener();
  }

  async deliver(
    stream: TurnStream,
    streamOptions: UIMessageStreamOptions<UIMessage>,
  ): Promise<void> {
    this.started = true;
    const interval = this.options.draftIntervalMs ?? 1_000;
    // "Pensando…" en cuanto empieza el turno. Con texto vacío Telegram pone su
    // propio indicador, pero en iOS es un globo sin texto que dura todo lo que
    // el modelo tarda en arrancar (prueba en vivo del PR4).
    this.sendDraft(`<i>${copy.thinking}</i>`);
    const timer = setInterval(() => this.tick(), interval);
    try {
      for await (const chunk of stream.toUIMessageStream(streamOptions)) {
        this.progress.apply(chunk);
      }
      // Aquí el turno ya se guardó: el `onEnd` del stream corre antes de que
      // la lectura termine.
      this.deliveredFlag = true;
      clearInterval(timer);
      await this.draftInFlight;
      await this.sendFinal();
    } catch (error) {
      // La lectura del stream se cayó: el creator no se queda sin saber.
      await this.send(copy.turnFailed, this.retryKeyboard());
      throw error;
    } finally {
      clearInterval(timer);
      this.resolveFinished();
    }
  }

  // --- El draft ---

  private tick(): void {
    // Detenido: ni un draft más (cada uno sale con el botón de detener).
    if (this.goneFlag) return;
    const stale = Date.now() - this.lastDraftAt > DRAFT_KEEPALIVE_MS;
    if (this.progress.version === this.drafted && !stale) return;
    const text = this.progress.text;
    const step = this.progress.currentStep;
    const body = text ? toTelegramDraft(text, TELEGRAM_MESSAGE_LIMIT - 200) : "";
    const html = step ? `${body ? `${body}\n\n` : ""}<i>${escapeHtml(step)}</i>` : body;
    // Solo cuenta como mandada si salió: uno que se saltó se intenta en el
    // siguiente tick, aunque el turno no cambie (una tool larga).
    if (this.sendDraft(html)) this.drafted = this.progress.version;
  }

  /** Sin esperar ni encimar: si el anterior sigue en camino, este se salta (false). */
  private sendDraft(html: string): boolean {
    if (this.draftInFlight || this.deliveredFlag) return false;
    const { api, place, draftId } = this.options;
    this.lastDraftAt = Date.now();
    const other = {
      ...(place.threadId !== null ? { message_thread_id: place.threadId } : {}),
      can_stop: true,
    };
    this.draftInFlight = api
      .sendMessageDraft(place.telegramChatId, draftId, html, { ...other, parse_mode: "HTML" })
      .catch((error: unknown) =>
        // El HTML a medias no le gustó: el mismo draft, sin formato.
        isParseError(error)
          ? api.sendMessageDraft(place.telegramChatId, draftId, toPlain(html), other)
          : Promise.reject(error instanceof Error ? error : new Error(String(error))),
      )
      .then(
        () => undefined,
        (error: unknown) => {
          // Un draft que no salió no es grave (el mensaje final sí importa);
          // se avisa una vez por turno, no en cada segundo.
          if (!this.draftWarned) console.warn("[telegram] Un draft no salió:", error);
          this.draftWarned = true;
        },
      )
      .finally(() => {
        this.draftInFlight = null;
      });
    return true;
  }

  // --- Lo que se queda en el chat ---

  private async sendFinal(): Promise<void> {
    const { progress } = this;
    // Lo mismo que decide el turno al guardarla: detenida si el stream se
    // abortó, o si se fue sin terminar. Un "detener" que llegó con la
    // respuesta ya completa no la vuelve detenida.
    const stopped = progress.aborted || (this.goneFlag && progress.finishReason === null);
    const failed = progress.error !== null;
    const messages = progress.text ? toTelegramMessages(progress.text) : [];

    const sources = webSources({ parts: progress.sourceParts }).slice(0, SOURCES_SHOWN);
    if (sources.length > 0) {
      const list = sources
        .map((s) => `• ${link(s.url, escapeHtml(s.titulo))} · ${escapeHtml(s.dominio)}`)
        .join("\n");
      const block = `<b>${copy.sourcesTitle}</b>\n${list}`;
      const last = messages.at(-1);
      if (last && last.length + block.length + 2 <= TELEGRAM_MESSAGE_LIMIT) {
        messages[messages.length - 1] = `${last}\n\n${block}`;
      } else {
        messages.push(block);
      }
    }

    for (const html of messages) await this.send(html);
    for (const card of progress.cards) await this.sendCard(card);

    // Detenida o fallida: la nota, con "Reintentar" (como en la web).
    const note = stopped
      ? `<i>${copy.stoppedNote}</i>`
      : failed
        ? copy.turnFailed
        : messages.length === 0 && progress.cards.length === 0
          ? copy.emptyReply
          : null;
    if (note) await this.send(note, this.retryKeyboard());
  }

  private retryKeyboard(): InlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [{ text: copy.retryButton, callback_data: `retry:${this.options.userMessageId}` }],
      ],
    };
  }

  private async sendCard(card: TurnCard): Promise<void> {
    const { webUrl, chatId } = this.options;
    const url = `${webUrl}/chats/${chatId}`;
    const red = NETWORK_LABELS[card.network];
    const hook = card.content.archetype === "video_script" ? card.content.hook.trim() : "";
    let text = buildPostText(card.content).trim();
    if ([...text].length > CARD_PREVIEW_CHARS) {
      text = `${[...text].slice(0, CARD_PREVIEW_CHARS).join("").trimEnd()}…`;
    }
    const lines = [
      `📝 <b>${escapeHtml(copy.cardTitle(red))}</b>`,
      hook ? `<i>${escapeHtml(hook)}</i>` : null,
      text ? escapeHtml(text) : null,
    ].filter((l): l is string => l !== null);
    if (buttonUrlAllowed(url)) {
      await this.send(lines.join("\n\n"), {
        inline_keyboard: [[{ text: copy.openButton, url }]],
      });
    } else {
      // En dev (localhost) Telegram no acepta el botón: el enlace va en el texto.
      await this.send([...lines, escapeHtml(copy.openInWeb(url))].join("\n\n"));
    }
  }

  /** Un mensaje que se queda. Nunca lanza: lo que no salió se registra. */
  private async send(html: string, keyboard?: InlineKeyboardMarkup): Promise<void> {
    await sendHtml(this.options.api, this.options.place, html, keyboard);
  }
}

/**
 * Un mensaje HTML en el tema. Si Telegram no acepta el HTML (no debería: sale
 * de tokens o de `escapeHtml`), el mismo texto sin formato. Nunca lanza.
 * También lo usa el eco de una nota de voz (F11 PR6).
 */
export async function sendHtml(
  api: TelegramApi,
  place: TelegramPlace,
  html: string,
  keyboard?: InlineKeyboardMarkup,
): Promise<void> {
  const other = {
    ...(place.threadId !== null ? { message_thread_id: place.threadId } : {}),
    ...(keyboard ? { reply_markup: keyboard } : {}),
    link_preview_options: { is_disabled: true },
  };
  try {
    await api.sendMessage(place.telegramChatId, html, { ...other, parse_mode: "HTML" });
  } catch (error) {
    if (!isParseError(error)) {
      console.error("[telegram] No se pudo mandar la respuesta:", error);
      return;
    }
    console.warn("[telegram] Telegram no aceptó el HTML; va sin formato:", error);
    try {
      await api.sendMessage(place.telegramChatId, toPlain(html), other);
    } catch (plainError) {
      console.error("[telegram] No se pudo mandar la respuesta:", plainError);
    }
  }
}
