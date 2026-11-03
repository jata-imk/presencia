import { HttpException, Inject, Injectable } from "@nestjs/common";
import type { UIMessage } from "ai";
import type { Api } from "grammy";
import { CHAT_TITLE_MAX } from "@presencia/shared";
import { randomUUID } from "node:crypto";
import type { ChatTitled } from "../chat/chat-events.js";
import { ChatRepository } from "../chat/chat.repository.js";
import { ChatService } from "../chat/chat.service.js";
import { DbService } from "../db/db.service.js";
import { env } from "../env.js";
import { ProfileRepository } from "../profile/profile.repository.js";
import { copy } from "./telegram.copy.js";
import { TelegramLinksService } from "./telegram-links.service.js";
import { TelegramSink, type TelegramApi } from "./telegram-sink.js";
import { TelegramThreadsRepository, type TelegramPlace } from "./telegram-threads.repository.js";

// La conversación por Telegram (F11 PR4, ADR-030): de un mensaje al turno del
// chat, el mismo que corre la web (ChatService), con su TelegramSink.
//
// - **Un tema es un chat.** El primer mensaje de un tema crea el chat; los
//   siguientes caen en él. Sin tema (Telegram X), el último chat sin tema,
//   hasta que `/new` lo suelta.
// - **En fila por tema.** Dos mensajes seguidos en el mismo tema se contestan
//   uno tras otro, nunca a la vez; temas distintos sí corren en paralelo. En
//   memoria: el bot vive en el proceso `app`, igual que el candado del turno.
// - **Nunca bloquea al bot.** Con polling, grammY atiende un update a la vez:
//   esperar el turno aquí detendría todo, también el botón de detener. Se
//   encola y se vuelve.

/** Mensajes en espera por tema, contando el que corre. Más, y se pide calma. */
const MAX_QUEUED = 3;
/** Cuánto se recuerda el aviso de "tema creado" mientras llega su primer mensaje. */
const TOPIC_MEMORY_MS = 10 * 60_000;

/** Quién escribió (el `from` del update). */
export interface TelegramFrom {
  id: number;
}

interface Queue {
  tail: Promise<void>;
  size: number;
}

/** El aviso `forum_topic_created`: si el creator le puso nombre, se respeta. */
interface TopicNote {
  name: string;
  implicit: boolean;
  at: number;
}

const placeKey = (p: TelegramPlace) => `${String(p.telegramChatId)}:${String(p.threadId ?? 0)}`;

@Injectable()
export class TelegramConversationService {
  private readonly queues = new Map<string, Queue>();
  private readonly sinks = new Map<string, TelegramSink>();
  private readonly topics = new Map<string, TopicNote>();
  private nextDraftId = Math.floor(Math.random() * 1_000_000) + 1;

  constructor(
    @Inject(DbService) private readonly db: DbService,
    @Inject(TelegramLinksService) private readonly links: TelegramLinksService,
    @Inject(TelegramThreadsRepository) private readonly threads: TelegramThreadsRepository,
    @Inject(ChatRepository) private readonly chats: ChatRepository,
    @Inject(ChatService) private readonly chat: ChatService,
    @Inject(ProfileRepository) private readonly profiles: ProfileRepository,
  ) {}

  /** El creator abrió un tema (aviso de servicio). Se usa al crear su chat. */
  topicCreated(place: TelegramPlace, name: string, implicit: boolean): void {
    const now = Date.now();
    for (const [key, note] of this.topics) {
      if (now - note.at > TOPIC_MEMORY_MS) this.topics.delete(key);
    }
    this.topics.set(placeKey(place), { name, implicit, at: now });
  }

  /** Un mensaje de texto. Vuelve en cuanto lo encola (ver la cabecera). */
  async text(
    api: TelegramApi,
    from: TelegramFrom,
    place: TelegramPlace,
    text: string,
  ): Promise<void> {
    // Nunca lanza: el bot no lo espera (un rechazo suelto tumbaría el proceso
    // `app` entero, con la web y el SSE). Lo que falle antes de encolar se dice.
    const userId = await this.resolveOrSay(api, from, place);
    if (!userId) return;
    this.enqueue(api, place, async () => {
      const chatId = await this.chatFor(userId, place);
      const message: UIMessage = {
        id: randomUUID(),
        role: "user",
        parts: [{ type: "text", text }],
      };
      await this.runTurn(api, place, userId, chatId, message.id, copy.chatGone, (sink, timezone) =>
        this.chat.streamChat(userId, chatId, message, sink, { channel: "telegram", timezone }),
      );
    });
  }

  /** "Reintentar" de una respuesta detenida o fallida (callback `retry:<id>`). */
  async retry(
    api: TelegramApi,
    from: TelegramFrom,
    place: TelegramPlace,
    userMessageId: string,
  ): Promise<void> {
    // Nunca lanza (ver `text`).
    const userId = await this.resolveOrSay(api, from, place);
    if (!userId) return;
    // El chat del mensaje, no el del lugar: tras `/new` (o un chat borrado en
    // la web) el lugar ya es de otro chat, y el mensaje sigue en el suyo.
    let chatId: string | undefined;
    try {
      chatId = await this.db.runWithTenant(userId, (tx) =>
        this.chats.chatIdOfMessage(tx, userMessageId),
      );
    } catch (error) {
      console.error("[telegram] No se pudo buscar el chat del mensaje a reintentar:", error);
      return this.reply(api, place, copy.turnFailed);
    }
    if (!chatId) return this.reply(api, place, copy.chatGone);
    const target = chatId;
    this.enqueue(api, place, () =>
      this.runTurn(api, place, userId, target, userMessageId, copy.cantRetry, (sink, timezone) =>
        this.chat.regenerateChat(userId, target, userMessageId, sink, {
          channel: "telegram",
          timezone,
        }),
      ),
    );
  }

  /** De quién es este Telegram; si no está conectado o la base falla, lo dice y da null. */
  private async resolveOrSay(
    api: TelegramApi,
    from: TelegramFrom,
    place: TelegramPlace,
  ): Promise<string | null> {
    try {
      const userId = await this.links.resolveUser(String(from.id));
      if (!userId) await this.reply(api, place, copy.notLinked(env.WEB_URL));
      return userId;
    } catch (error) {
      console.error("[telegram] No se pudo saber de quién es el mensaje:", error);
      await this.reply(api, place, copy.turnFailed);
      return null;
    }
  }

  /** El botón de detener de un draft. */
  stop(telegramChatId: number, draftId: number): void {
    this.sinks.get(`${String(telegramChatId)}:${String(draftId)}`)?.stop();
  }

  /** `/new`: en un tema no hace falta; sin tema, suelta el chat actual. */
  async newChat(from: TelegramFrom, place: TelegramPlace): Promise<string> {
    const userId = await this.links.resolveUser(String(from.id));
    if (!userId) return copy.notLinked(env.WEB_URL);
    if (place.threadId !== null) return copy.newInTopic;
    await this.db.runWithTenant(userId, (tx) =>
      this.threads.releaseUnthreaded(tx, place.telegramChatId),
    );
    return copy.newChat;
  }

  /**
   * El chat tiene título nuevo: su tema se renombra. El automático solo si el
   * creator no le puso nombre al tema; el que escribió en la web, siempre.
   * iOS no muestra el renombre (sonda de F11); Desktop sí.
   */
  async renameTopic(api: Pick<Api, "editForumTopic">, event: ChatTitled): Promise<void> {
    const row = await this.db.runWithTenant(event.userId, (tx) =>
      this.threads.findByChat(tx, event.chatId),
    );
    if (!row || row.messageThreadId === null) return;
    if (event.source === "auto" && !row.renameTopic) return;
    await api.editForumTopic(row.telegramChatId, row.messageThreadId, {
      name: [...event.title].slice(0, 128).join(""),
    });
  }

  /** El chat de ese tema; si no tiene, uno nuevo (con el nombre del tema, si se lo pusieron). */
  private async chatFor(userId: string, place: TelegramPlace): Promise<string> {
    const note = this.topics.get(placeKey(place));
    return this.db.runWithTenant(userId, async (tx) => {
      const existing = await this.threads.findByPlace(tx, place);
      if (existing) return existing.chatId;
      // Un tema con nombre puesto por el creator le da su título al chat
      // (como renombrarlo: el automático ya no lo toca, ni se cobra).
      // Con el tope de un título (Telegram permite 128 en un tema).
      const named =
        note && !note.implicit
          ? [...note.name.trim()].slice(0, CHAT_TITLE_MAX).join("").trim()
          : "";
      const chat = await this.chats.createChat(tx, userId, named || undefined);
      const row = await this.threads.insert(tx, {
        userId,
        chatId: chat.id,
        place,
        renameTopic: !named,
      });
      // La fila ya era de otro chat: no pasa con la fila por tema, pero si
      // pasara, la transacción entera se deshace y el mensaje se reintenta.
      if (!row) throw new Error("El tema ya tenía chat");
      this.topics.delete(placeKey(place));
      return chat.id;
    });
  }

  private async runTurn(
    api: TelegramApi,
    place: TelegramPlace,
    userId: string,
    chatId: string,
    userMessageId: string,
    /** Lo que se lee con un 404: el chat ya no existe, o esa respuesta ya no se puede reintentar. */
    notFound: string,
    run: (sink: TelegramSink, timezone: string | null) => Promise<void>,
  ): Promise<void> {
    const draftId = this.newDraftId();
    const sink = new TelegramSink({
      api,
      place,
      chatId,
      userMessageId,
      draftId,
      webUrl: env.WEB_URL,
    });
    const key = `${String(place.telegramChatId)}:${String(draftId)}`;
    this.sinks.set(key, sink);
    try {
      // La zona del creator, de la base: Telegram no trae sesión (today.ts).
      const timezone = (await this.profiles.findById(userId))?.timezone ?? null;
      await run(sink, timezone);
      // Entregar no se espera dentro del turno (corre en segundo plano): la
      // fila del tema espera a que esta respuesta termine de llegar.
      if (sink.started) await sink.finished;
    } catch (error) {
      await this.reply(api, place, this.errorCopy(error, notFound));
    } finally {
      this.sinks.delete(key);
    }
  }

  /** Lo que el creator lee cuando el turno ni empezó. */
  private errorCopy(error: unknown, notFound: string): string {
    if (error instanceof HttpException) {
      const status = error.getStatus();
      if (status === 402) return copy.noQuota(env.WEB_URL);
      if (status === 409) return copy.busy;
      if (status === 404) return notFound;
    }
    console.error("[telegram] El turno no arrancó:", error);
    return copy.turnFailed;
  }

  private enqueue(api: TelegramApi, place: TelegramPlace, job: () => Promise<void>): void {
    const key = placeKey(place);
    const queue = this.queues.get(key) ?? { tail: Promise.resolve(), size: 0 };
    if (queue.size >= MAX_QUEUED) {
      void this.reply(api, place, copy.queueFull);
      return;
    }
    queue.size += 1;
    queue.tail = queue.tail
      .then(job)
      .catch((error: unknown) => {
        console.error("[telegram] Un mensaje de la fila falló:", error);
        return this.reply(api, place, copy.turnFailed);
      })
      .finally(() => {
        queue.size -= 1;
        if (queue.size === 0 && this.queues.get(key) === queue) this.queues.delete(key);
      });
    this.queues.set(key, queue);
  }

  private newDraftId(): number {
    this.nextDraftId = (this.nextDraftId % 2_000_000_000) + 1;
    return this.nextDraftId;
  }

  /** Un aviso en el mismo tema. Nunca lanza. */
  private async reply(api: TelegramApi, place: TelegramPlace, text: string): Promise<void> {
    try {
      await api.sendMessage(
        place.telegramChatId,
        text,
        place.threadId !== null ? { message_thread_id: place.threadId } : {},
      );
    } catch (error) {
      console.error("[telegram] No se pudo avisar en el chat:", error);
    }
  }
}
