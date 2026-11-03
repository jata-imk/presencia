import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { Bot } from "grammy";
import type { Update } from "grammy/types";
import { env } from "../env.js";
import { TELEGRAM_COMMANDS } from "./telegram.copy.js";
import { TelegramCommandsService } from "./telegram-commands.service.js";
import { isUserContent } from "./telegram-message.js";

// El bot de Telegram (F11, ADR-030 y ADR-010): grammY como cliente del Bot API.
//
// Vive SOLO en el proceso `app` (TelegramModule no está en el worker): el
// turno del chat se serializa con un candado en memoria de ese proceso
// (ADR-006), y un update de Telegram tiene que pasar por el mismo.
//
// Dos modos (TELEGRAM_MODE): en dev, polling con un bot aparte (la laptop no
// tiene URL pública); en prod, webhook con secret (env.ts lo exige). El
// arranque no bloquea a la API: si Telegram no contesta, se registra y el
// resto de la app sigue.

/** Los updates que pedimos. F11 PR3: solo mensajes (el PR4 suma los de detener). */
const ALLOWED_UPDATES = ["message"] as const;

/** Cuántos update_id recientes se recuerdan para no atender dos veces el mismo. */
const RECENT_UPDATES = 500;

@Injectable()
export class TelegramBotService implements OnApplicationBootstrap, OnModuleDestroy {
  private bot: Bot | null = null;
  private ready = false;
  // El webhook contesta 200 antes de atender el update, así que Telegram no
  // reenvía uno que ya aceptamos; esto cubre un reintento raro (la respuesta
  // se perdió en la red). No sobrevive a un reinicio, y no hace falta: lo que
  // no se aceptó, Telegram lo vuelve a mandar.
  private readonly recent = new Set<number>();
  private readonly recentOrder: number[] = [];

  constructor(
    @Inject(TelegramCommandsService) private readonly commands: TelegramCommandsService,
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
    this.register(bot);
    this.bot = bot;
    void this.launch(bot);
  }

  private async launch(bot: Bot): Promise<void> {
    try {
      await bot.init();
      await bot.api.setMyCommands(TELEGRAM_COMMANDS.map((c) => ({ ...c })));
      if (env.TELEGRAM_MODE === "webhook") {
        const url = `${env.BETTER_AUTH_URL}/api/telegram/webhook`;
        await bot.api.setWebhook(url, {
          secret_token: env.TELEGRAM_WEBHOOK_SECRET,
          allowed_updates: [...ALLOWED_UPDATES],
        });
        this.ready = true;
        console.info(`[telegram] @${bot.botInfo.username} recibe por webhook en ${url}`);
        return;
      }
      this.ready = true;
      // bot.start borra el webhook que hubiera y lee con getUpdates. La promesa
      // se cumple al detenerlo; un 409 es otro proceso leyendo el mismo bot.
      void bot
        .start({
          allowed_updates: [...ALLOWED_UPDATES],
          onStart: (info) => console.info(`[telegram] @${info.username} escuchando por polling`),
        })
        .catch((error: unknown) => {
          this.ready = false;
          console.error(
            "[telegram] El polling se detuvo (¿otro proceso con el mismo bot? un `tsx watch` viejo, " +
              "o el bot de prod con este token):",
            error,
          );
        });
    } catch (error) {
      console.error("[telegram] El bot no arrancó; el resto de la API sigue:", error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.bot?.isRunning()) await this.bot.stop();
  }

  /** Un update del webhook. Lanza si el bot no está listo (el controller responde 503). */
  async handleUpdate(update: Update): Promise<void> {
    if (!this.bot || !this.ready) throw new Error("El bot de Telegram no está listo");
    if (this.recent.has(update.update_id)) return;
    this.recent.add(update.update_id);
    this.recentOrder.push(update.update_id);
    if (this.recentOrder.length > RECENT_UPDATES) {
      this.recent.delete(this.recentOrder.shift()!);
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
    dm.on("message", async (ctx) => {
      // Los avisos de servicio ("tema creado"…) no se contestan: un tema
      // implícito de iOS duplicaba la respuesta (telegram-message.ts).
      if (!isUserContent(ctx.message)) return;
      await ctx.reply(await this.commands.message(ctx.from));
    });
  }
}
