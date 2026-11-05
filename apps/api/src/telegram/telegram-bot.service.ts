import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { autoRetry } from "@grammyjs/auto-retry";
import { Bot } from "grammy";
import type { Message, Update } from "grammy/types";
import { ChatEvents } from "../chat/chat-events.js";
import { env } from "../env.js";
import { TELEGRAM_COMMANDS } from "./telegram.copy.js";
import { TelegramCommandsService } from "./telegram-commands.service.js";
import { TelegramConversationService } from "./telegram-conversation.service.js";
import { mediaOf, voiceOf } from "./telegram-files.js";
import { isUserContent } from "./telegram-message.js";
import type { TelegramPlace } from "./telegram-threads.repository.js";

// El bot de Telegram (F11, ADR-030 y ADR-010): grammY como cliente del Bot API.
//
// Vive SOLO en el proceso `app` (TelegramModule no está en el worker): el
// turno del chat se serializa con un candado en memoria de ese proceso
// (ADR-006), y un update de Telegram tiene que pasar por el mismo.
//
// Dos modos (TELEGRAM_MODE): en dev, polling con un bot aparte (la laptop no
// tiene URL pública); en prod, webhook con secret (env.ts lo exige). El
// arranque no bloquea a la API: si Telegram no contesta, se registra, el resto
// de la app sigue y se reintenta solo (sin reintento, un 5xx de Telegram en el
// deploy dejaba el canal muerto hasta reiniciar el proceso).

/**
 * Los updates que pedimos: los mensajes, el "Reintentar" (callback_query) y
 * el botón de detener de los drafts (F11 PR4).
 */
const ALLOWED_UPDATES = ["message", "callback_query", "stopped_message_generation"] as const;

/** El callback de "Reintentar": el id del mensaje del creator a volver a contestar. */
const RETRY_DATA = /^retry:([0-9a-f-]{36})$/;

/**
 * Lo que corre sin que el bot lo espere no puede rechazar suelto: Node mata el
 * proceso con un rechazo sin manejar, y con él la web y el SSE. La
 * conversación ya no lanza; esto es la segunda red.
 */
function logLoose(error: unknown): void {
  console.error("[telegram] Un mensaje falló fuera del handler:", error);
}

/** Dónde se escribió. Sin tema (Telegram X) no llega `message_thread_id` (sonda de F11). */
function placeOf(message: Pick<Message, "chat" | "message_thread_id">): TelegramPlace {
  return { telegramChatId: message.chat.id, threadId: message.message_thread_id ?? null };
}

/** Cuántos update_id recientes se recuerdan para no atender dos veces el mismo. */
const RECENT_UPDATES = 500;

/** Espera antes de cada reintento de arranque; el último se repite. */
export const LAUNCH_RETRY_MS = [5_000, 15_000, 60_000, 300_000] as const;

@Injectable()
export class TelegramBotService implements OnApplicationBootstrap, OnModuleDestroy {
  private bot: Bot | null = null;
  private ready = false;
  /** El módulo se está apagando: no arrancar ni reintentar nada más. */
  private stopped = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private launchAttempts = 0;
  // El webhook contesta 200 antes de atender el update, así que Telegram no
  // reenvía uno que ya aceptamos; esto cubre un reintento raro (la respuesta
  // se perdió en la red). No sobrevive a un reinicio, y no hace falta: lo que
  // no se aceptó, Telegram lo vuelve a mandar. Un Set guarda el orden de
  // inserción: el primero es el más viejo.
  private readonly recent = new Set<number>();

  /** Deja de escuchar los títulos nuevos al apagar. */
  private stopTitles: (() => void) | null = null;

  constructor(
    @Inject(TelegramCommandsService) private readonly commands: TelegramCommandsService,
    @Inject(TelegramConversationService)
    private readonly conversation: TelegramConversationService,
    @Inject(ChatEvents) private readonly chatEvents: ChatEvents,
  ) {}

  /** Hay token: el canal existe en este entorno. */
  get enabled(): boolean {
    return Boolean(env.TELEGRAM_BOT_TOKEN);
  }

  /** El @usuario del bot (para el deep link), o null si todavía no arrancó. */
  get username(): string | null {
    return this.ready && this.bot ? this.bot.botInfo.username : null;
  }

  /** Listo para recibir updates por el webhook. */
  get acceptsWebhook(): boolean {
    return this.ready && env.TELEGRAM_MODE === "webhook";
  }

  onApplicationBootstrap(): void {
    const token = env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      console.info("[telegram] Sin TELEGRAM_BOT_TOKEN: el canal de Telegram está apagado.");
      return;
    }
    const bot = new Bot(token);
    // Un 429 (demasiados envíos) o un 5xx pasajero se reintenta solo, con la
    // espera que pide Telegram. Tope corto: un draft viejo no vale la espera.
    bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 10 }));
    this.register(bot);
    this.bot = bot;
    // F11 PR4: el título nuevo de un chat renombra su tema.
    this.stopTitles = this.chatEvents.onTitled((event) => {
      if (!this.ready) return;
      return this.conversation.renameTopic(bot.api, event);
    });
    void this.launch(bot);
  }

  private async launch(bot: Bot): Promise<void> {
    if (this.stopped) return;
    try {
      if (!bot.isInited()) await bot.init();
      if (this.stopped) return;
      // El menú de comandos es cosmético: si falla, el bot arranca igual.
      await bot.api
        .setMyCommands(TELEGRAM_COMMANDS.map((c) => ({ ...c })))
        .catch((error: unknown) => {
          console.warn("[telegram] No se pudo registrar el menú de comandos:", error);
        });
      if (this.stopped) return;
      if (env.TELEGRAM_MODE === "webhook") {
        const url = `${env.BETTER_AUTH_URL}/api/telegram/webhook`;
        await bot.api.setWebhook(url, {
          secret_token: env.TELEGRAM_WEBHOOK_SECRET,
          allowed_updates: [...ALLOWED_UPDATES],
        });
        if (this.stopped) return;
        this.ready = true;
        this.launchAttempts = 0;
        console.info(`[telegram] @${bot.botInfo.username} recibe por webhook en ${url}`);
        return;
      }
      this.ready = true;
      // bot.start borra el webhook que hubiera y lee con getUpdates. La promesa
      // se cumple al detenerlo (onModuleDestroy) y se rechaza si el polling se
      // cae; un 409 es otro proceso leyendo el mismo bot, que puede morir solo.
      void bot
        .start({
          allowed_updates: [...ALLOWED_UPDATES],
          onStart: (info) => {
            this.launchAttempts = 0;
            console.info(`[telegram] @${info.username} escuchando por polling`);
          },
        })
        .catch((error: unknown) => {
          this.ready = false;
          console.error(
            "[telegram] El polling se detuvo (¿otro proceso con el mismo bot? un `tsx watch` viejo, " +
              "o el bot de prod con este token):",
            error,
          );
          this.scheduleLaunch(bot);
        });
    } catch (error) {
      console.error("[telegram] El bot no arrancó; el resto de la API sigue:", error);
      this.scheduleLaunch(bot);
    }
  }

  private scheduleLaunch(bot: Bot): void {
    if (this.stopped) return;
    const delay = LAUNCH_RETRY_MS[Math.min(this.launchAttempts, LAUNCH_RETRY_MS.length - 1)]!;
    this.launchAttempts += 1;
    console.info(`[telegram] Reintento de arranque en ${String(delay / 1000)} s.`);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.launch(bot);
    }, delay);
    // Un reintento pendiente no detiene el apagado del proceso.
    this.retryTimer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    // Antes que nada: un launch a medio camino (esperando init o setWebhook)
    // ya no llega a bot.start, y no queda un polling huérfano tras un reload.
    this.stopped = true;
    this.ready = false;
    this.stopTitles?.();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.bot?.isRunning()) await this.bot.stop();
  }

  /** Un update del webhook. Lanza si el bot no está listo (el controller responde 503). */
  async handleUpdate(update: Update): Promise<void> {
    if (!this.bot || !this.ready) throw new Error("El bot de Telegram no está listo");
    if (this.recent.has(update.update_id)) return;
    this.recent.add(update.update_id);
    if (this.recent.size > RECENT_UPDATES) {
      this.recent.delete(this.recent.values().next().value!);
    }
    await this.bot.handleUpdate(update);
  }

  /** Un aviso fuera de una conversación (p. ej. "desconectaste desde la web"). Nunca lanza. */
  async notify(chatId: number, text: string): Promise<void> {
    if (!this.bot || !this.ready) return;
    try {
      await this.bot.api.sendMessage(chatId, text);
    } catch (error) {
      console.error(`[telegram] No se pudo avisar al chat ${String(chatId)}:`, error);
    }
  }

  private register(bot: Bot): void {
    bot.catch((err) => {
      console.error(
        `[telegram] Error atendiendo el update ${String(err.ctx.update.update_id)}:`,
        err.error,
      );
    });
    // Solo chats privados: el canal es la conversación del creator con su
    // asistente. Un grupo (BotFather: "Allow Groups" apagado) se ignora.
    const dm = bot.chatType("private");
    dm.command("start", async (ctx) => {
      await ctx.reply(await this.commands.start(ctx.from, ctx.match.trim()));
    });
    dm.command("help", async (ctx) => {
      await ctx.reply(await this.commands.help(ctx.from));
    });
    dm.command("disconnect", async (ctx) => {
      await ctx.reply(await this.commands.disconnect(ctx.from));
    });
    dm.command("new", async (ctx) => {
      await ctx.reply(await this.conversation.newChat(ctx.from, placeOf(ctx.msg)));
    });
    dm.on("message", async (ctx) => {
      const message = ctx.message;
      // "Tema creado": no se contesta (un tema implícito de iOS duplicaba la
      // respuesta), pero su nombre sirve al crear el chat del tema.
      const topic = message.forum_topic_created;
      if (topic) {
        this.conversation.topicCreated(
          placeOf(message),
          topic.name,
          topic.is_name_implicit === true,
        );
        return;
      }
      // Los demás avisos de servicio, tampoco (telegram-message.ts).
      if (!isUserContent(message)) return;
      if (message.text !== undefined) {
        // Sin esperar: el turno corre aparte, y el bot sigue atendiendo
        // (también el botón de detener).
        void this.conversation
          .text(ctx.api, ctx.from, placeOf(message), message.text)
          .catch(logLoose);
        return;
      }
      // F11 PR5: fotos y documentos (también uno que no se lee, como un
      // .docx: el aviso dice por qué). En un álbum, también un video, para que
      // su aviso salga junto con el resto del álbum.
      const media = mediaOf(message);
      if (media && (message.photo || message.document || message.media_group_id)) {
        void this.conversation
          .media(ctx.api, ctx.from, placeOf(message), {
            media,
            caption: message.caption,
            albumId: message.media_group_id,
          })
          .catch(logLoose);
        return;
      }
      // F11 PR6: una nota de voz o un audio suelto se transcribe. Un audio en
      // un álbum va arriba, con su aviso; la video-nota no se lee.
      const voice = voiceOf(message);
      if (voice) {
        void this.conversation
          .voice(ctx.api, ctx.from, placeOf(message), { voice, caption: message.caption })
          .catch(logLoose);
        return;
      }
      await ctx.reply(await this.commands.message(ctx.from));
    });
    dm.on("callback_query:data", async (ctx) => {
      await ctx.answerCallbackQuery().catch(() => undefined);
      const match = RETRY_DATA.exec(ctx.callbackQuery.data);
      const message = ctx.callbackQuery.message;
      if (!match || !message) return;
      // El botón se va: un segundo toque no regenera otra vez.
      await ctx
        .editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } })
        .catch(() => undefined);
      void this.conversation.retry(ctx.api, ctx.from, placeOf(message), match[1]!).catch(logLoose);
    });
    bot.on("stopped_message_generation", (ctx) => {
      const stopped = ctx.update.stopped_message_generation;
      this.conversation.stop(stopped.chat.id, stopped.draft_id);
    });
  }
}
