import { HttpException, Inject, Injectable } from "@nestjs/common";
import type { FileUIPart, UIMessage } from "ai";
import type { Api } from "grammy";
import { ATTACHMENTS_PER_MESSAGE, CHAT_TITLE_MAX } from "@presencia/shared";
import { randomUUID } from "node:crypto";
import { AttachmentsService } from "../attachments/attachments.service.js";
import type { ChatTitled } from "../chat/chat-events.js";
import { ChatRepository } from "../chat/chat.repository.js";
import { ChatService } from "../chat/chat.service.js";
import { DbService } from "../db/db.service.js";
import { env } from "../env.js";
import { ProfileRepository } from "../profile/profile.repository.js";
import { copy } from "./telegram.copy.js";
import {
  TelegramFileTooBigError,
  downloadTelegramFile,
  type TelegramMedia,
  type TelegramRejection,
} from "./telegram-files.js";
import { TelegramLinksService } from "./telegram-links.service.js";
import { escapeHtml } from "./telegram-html.js";
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
// - **Fotos y archivos (F11 PR5)** se bajan de Telegram y se suben con
//   AttachmentsService, como un adjunto de la web. Un álbum llega en un update
//   por foto: se junta en un solo mensaje.

/** Mensajes en espera por tema, contando el que corre. Más, y se pide calma. */
const MAX_QUEUED = 3;
/** Cuánto se recuerda el aviso de "tema creado" mientras llega su primer mensaje. */
const TOPIC_MEMORY_MS = 10 * 60_000;
/**
 * Cuánto se espera la siguiente foto de un álbum. Telegram manda las de un
 * álbum seguidas, en un update cada una (con polling, en el mismo lote).
 */
export const ALBUM_WINDOW_MS = 1_500;
/** Cuántos archivos de un mensaje se bajan y suben a la vez. */
const UPLOAD_CONCURRENCY = 3;
/** Un draft que no se refresca desaparece a los 30 s (con su botón de detener). */
const WAITING_DRAFT_KEEPALIVE_MS = 20_000;

/** Lo que usa la conversación del cliente de grammY: el sink, más bajar archivos. */
export type TelegramMediaApi = TelegramApi & Pick<Api, "getFile">;

/** Una foto o un archivo que llegó, con su caption y su álbum. */
export interface TelegramIncomingMedia {
  media: TelegramMedia;
  caption: string | undefined;
  /** `media_group_id`: las fotos de un álbum lo comparten. */
  albumId: string | undefined;
}

/** Un álbum que se está juntando. */
interface Album {
  items: TelegramIncomingMedia[];
  timer: ReturnType<typeof setTimeout>;
  close: () => void;
  closed: Promise<TelegramIncomingMedia[]>;
}

/** Lo que el botón de detener para: un turno, o la bajada de los archivos antes de él. */
interface Stoppable {
  stop(): void;
}

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
/** Un draft se nombra por chat de Telegram y su id (el update de detener no trae el tema). */
const draftKey = (telegramChatId: number, draftId: number) =>
  `${String(telegramChatId)}:${String(draftId)}`;

@Injectable()
export class TelegramConversationService {
  private readonly queues = new Map<string, Queue>();
  private readonly sinks = new Map<string, Stoppable>();
  private readonly topics = new Map<string, TopicNote>();
  private readonly albums = new Map<string, Album>();
  private nextDraftId = Math.floor(Math.random() * 1_000_000) + 1;

  constructor(
    @Inject(DbService) private readonly db: DbService,
    @Inject(TelegramLinksService) private readonly links: TelegramLinksService,
    @Inject(TelegramThreadsRepository) private readonly threads: TelegramThreadsRepository,
    @Inject(ChatRepository) private readonly chats: ChatRepository,
    @Inject(ChatService) private readonly chat: ChatService,
    @Inject(ProfileRepository) private readonly profiles: ProfileRepository,
    @Inject(AttachmentsService) private readonly attachments: AttachmentsService,
  ) {}

  /** El creator abrió un tema (aviso de servicio). Se usa al crear su chat. */
  topicCreated(place: TelegramPlace, name: string, implicit: boolean): void {
    const now = Date.now();
    for (const [key, note] of this.topics) {
      if (now - note.at > TOPIC_MEMORY_MS) this.topics.delete(key);
    }
    this.topics.set(placeKey(place), { name, implicit, at: now });
  }

  /**
   * Un mensaje de texto. Vuelve en cuanto lo encola (ver la cabecera): sin
   * `await` antes de tomar su lugar en la fila. La promesa es para el bot, que
   * no la espera; nunca se rechaza.
   */
  text(api: TelegramApi, from: TelegramFrom, place: TelegramPlace, text: string): Promise<void> {
    // Nunca lanza: el bot no lo espera (un rechazo suelto tumbaría el proceso
    // `app` entero, con la web y el SSE). Lo que falle se dice en el tema.
    // El lugar en la fila se toma ANTES de cualquier `await` (revisión del
    // PR5): si no, una foto y el texto que la sigue, o dos textos seguidos,
    // podían contestarse al revés según qué búsqueda del creator volviera antes.
    this.enqueue(api, place, async () => {
      const userId = await this.resolveOrSay(api, from, place);
      if (!userId) return;
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
    return Promise.resolve();
  }

  /**
   * Una foto o un archivo (F11 PR5). Vuelve en cuanto lo encola, como `text`.
   * Las fotos de un álbum se juntan en un mensaje: la primera abre la ventana
   * y toma el lugar en la fila del tema, las dos cosas antes de cualquier
   * `await` (con webhook, las demás llegan en paralelo; y un texto que llegue
   * después se contesta después); las siguientes solo se suman.
   */
  media(
    api: TelegramMediaApi,
    from: TelegramFrom,
    place: TelegramPlace,
    item: TelegramIncomingMedia,
  ): Promise<void> {
    // Nunca lanza (ver `text`).
    if (item.albumId === undefined) {
      this.enqueue(api, place, async () => {
        const userId = await this.resolveOrSay(api, from, place);
        if (userId) await this.runMedia(api, place, userId, [item]);
      });
      return Promise.resolve();
    }
    const key = `${String(place.telegramChatId)}:${item.albumId}`;
    const open = this.albums.get(key);
    if (open) {
      open.items.push(item);
      if (open.items.length >= ATTACHMENTS_PER_MESSAGE) open.close();
      else open.timer.refresh();
      return Promise.resolve();
    }
    const album = this.openAlbum(key, item);
    this.enqueue(api, place, async () => {
      const items = await album.closed;
      // Una vez por álbum: a quien no está conectado, un solo aviso.
      const userId = await this.resolveOrSay(api, from, place);
      if (userId) await this.runMedia(api, place, userId, items);
    });
    return Promise.resolve();
  }

  private openAlbum(key: string, first: TelegramIncomingMedia): Album {
    let resolve!: (items: TelegramIncomingMedia[]) => void;
    const closed = new Promise<TelegramIncomingMedia[]>((r) => {
      resolve = r;
    });
    const album: Album = {
      items: [first],
      closed,
      timer: setTimeout(() => album.close(), ALBUM_WINDOW_MS),
      close: () => {
        clearTimeout(album.timer);
        if (this.albums.get(key) === album) this.albums.delete(key);
        resolve(album.items);
      },
    };
    this.albums.set(key, album);
    return album;
  }

  /**
   * Baja y sube los archivos, avisa de los que no entraron y corre el turno
   * con los que sí. Desde que empieza, el draft dice "Leyendo tus archivos…"
   * con el botón de detener, que ya sirve: el turno sigue en el mismo draft.
   */
  private async runMedia(
    api: TelegramMediaApi,
    place: TelegramPlace,
    userId: string,
    items: TelegramIncomingMedia[],
  ): Promise<void> {
    const draftId = this.newDraftId();
    const key = draftKey(place.telegramChatId, draftId);
    // Solo si hay qué bajar: un .docx solo recibe su aviso al instante.
    const preparing = new WaitingDraft(api, place, draftId, copy.readingFiles);
    this.sinks.set(key, preparing);
    try {
      if (items.some((i) => i.media.kind === "file")) preparing.start();
      const result = await this.uploadAll(api, userId, items, preparing);
      // El draft del turno sigue en el mismo id: el de espera ya no puede
      // llegar después y tapar el "Pensando…".
      await preparing.end();
      const { files, notices } = result;
      // Lo que no entró, antes de la respuesta: así se lee en orden.
      if (notices.length > 0) await this.reply(api, place, notices.join("\n"));
      if (preparing.stopped) return await this.reply(api, place, copy.stoppedBeforeStart);
      const caption = items
        .map((i) => i.caption?.trim() ?? "")
        .filter(Boolean)
        .join("\n");
      // Ningún archivo entró: los avisos bastan, sin turno ni cobro. El caption
      // hablaba de ese archivo ("resúmelo"); solo, el modelo no tendría qué leer.
      if (files.length === 0) return;
      const chatId = await this.chatFor(userId, place);
      if (preparing.stopped) return await this.reply(api, place, copy.stoppedBeforeStart);
      // El mismo orden que el composer de la web: los archivos, luego el texto.
      const message: UIMessage = {
        id: randomUUID(),
        role: "user",
        parts: [...files, ...(caption ? [{ type: "text" as const, text: caption }] : [])],
      };
      // runTurn toma el lugar de `preparing` en el mismo tick: un "detener"
      // desde aquí ya para el turno.
      await this.runTurn(
        api,
        place,
        userId,
        chatId,
        message.id,
        copy.chatGone,
        (sink, timezone) =>
          this.chat.streamChat(userId, chatId, message, sink, { channel: "telegram", timezone }),
        draftId,
      );
    } finally {
      await preparing.end();
      if (this.sinks.get(key) === preparing) this.sinks.delete(key);
    }
  }

  /**
   * Cada archivo, de Telegram a AttachmentsService, de 3 en 3 y en el orden en
   * que llegaron (son 10 como mucho; más a la vez solo pesaría en memoria:
   * hasta 20 MB cada uno). Sin chat todavía (`chatId: null`): si ninguno entra, no queda un
   * chat vacío, y el turno los liga al enviar; los que se quedan sin mensaje
   * los borra el barrido de adjuntos al día. Un archivo que falla se salta con
   * aviso y el resto sigue, como el chip con error que se quita en la web.
   */
  private async uploadAll(
    api: TelegramMediaApi,
    userId: string,
    items: TelegramIncomingMedia[],
    preparing: { stopped: boolean },
  ): Promise<{ files: FileUIPart[]; notices: string[] }> {
    const photos = items.filter((i) => i.media.kind === "file" && i.media.file.photo).length;
    let photoIndex = 0;
    // Lo que sale de cada archivo, en su lugar: el orden no depende de cuál baja antes.
    const results = items.map(({ media }) => {
      if (media.kind === "rejected") {
        const why = rejectionCopy(media.reason);
        return () => Promise.resolve({ notice: copy.skipped(media.filename, media.label, why) });
      }
      const { file } = media;
      // En un álbum, cada foto con su número: el modelo (y ver_adjunto) las distingue.
      const filename =
        file.photo && photos > 1 ? `foto-${String(++photoIndex)}.jpg` : file.filename;
      return async (): Promise<{ file?: FileUIPart; notice?: string }> => {
        if (preparing.stopped) return {};
        try {
          const data = await downloadTelegramFile(api, env.TELEGRAM_BOT_TOKEN ?? "", file.fileId);
          if (preparing.stopped) return {};
          const dto = await this.attachments.upload({ userId, chatId: null, data, filename });
          return {
            file: { type: "file", mediaType: dto.mediaType, filename: dto.filename, url: dto.url },
          };
        } catch (error) {
          return { notice: copy.skipped(filename, null, uploadErrorCopy(error)) };
        }
      };
    });
    const done = new Array<{ file?: FileUIPart; notice?: string }>(results.length);
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(UPLOAD_CONCURRENCY, results.length) }, async () => {
        while (next < results.length) {
          const i = next++;
          done[i] = await results[i]!();
        }
      }),
    );
    return {
      files: done.flatMap((r) => (r.file ? [r.file] : [])),
      notices: done.flatMap((r) => (r.notice ? [r.notice] : [])),
    };
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
    this.sinks.get(draftKey(telegramChatId, draftId))?.stop();
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
    /** El del draft que ya se mostró ("Leyendo tus archivos…"): el turno lo continúa. */
    draftId = this.newDraftId(),
  ): Promise<void> {
    const sink = new TelegramSink({
      api,
      place,
      chatId,
      userMessageId,
      draftId,
      webUrl: env.WEB_URL,
    });
    const key = draftKey(place.telegramChatId, draftId);
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
      // Los adjuntos del mensaje pasan del presupuesto de tokens (F10.9).
      if (status === 413) return copy.tooMuchToRead;
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

/** Por qué no entró un archivo que ni se bajó. */
function rejectionCopy(reason: TelegramRejection): string {
  if (reason === "heic") return copy.heicAsFile;
  if (reason === "too_big") return copy.fileTooBig;
  if (reason === "audio") return copy.audioSoon;
  return copy.unsupportedFile;
}

/**
 * El draft de "Leyendo tus archivos…" mientras se bajan, con el botón de
 * detener, que ya sirve (`stop`). Se refresca antes de que Telegram lo quite
 * (30 s) y nunca encima de sí mismo; `end` espera al último, para que no
 * llegue después del primero del turno, que usa el mismo id. Nunca lanza.
 */
class WaitingDraft {
  stopped = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly api: TelegramApi,
    private readonly place: TelegramPlace,
    private readonly draftId: number,
    private readonly text: string,
  ) {}

  start(): void {
    this.send();
    this.timer = setInterval(() => this.send(), WAITING_DRAFT_KEEPALIVE_MS);
  }

  stop(): void {
    this.stopped = true;
    this.clear();
  }

  async end(): Promise<void> {
    this.clear();
    await this.inFlight;
  }

  private clear(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private send(): void {
    if (this.inFlight || this.stopped) return;
    const { api, place, draftId, text } = this;
    this.inFlight = api
      .sendMessageDraft(place.telegramChatId, draftId, `<i>${escapeHtml(text)}</i>`, {
        ...(place.threadId !== null ? { message_thread_id: place.threadId } : {}),
        can_stop: true,
        parse_mode: "HTML",
      })
      .then(
        () => undefined,
        (error: unknown) => {
          console.warn("[telegram] El draft de espera no salió:", error);
        },
      )
      .finally(() => {
        this.inFlight = null;
      });
  }
}

/** Por qué un archivo no se pudo adjuntar, para el aviso. */
function uploadErrorCopy(error: unknown): string {
  if (error instanceof TelegramFileTooBigError) return copy.fileTooBig;
  // 415 (un tipo que no se lee) y 422 (p. ej. un PDF escaneado de más de 20
  // páginas): su mensaje ya es para el creator.
  if (error instanceof HttpException && (error.getStatus() === 415 || error.getStatus() === 422)) {
    return error.message.charAt(0).toLowerCase() + error.message.slice(1);
  }
  console.error("[telegram] No se pudo adjuntar un archivo:", error);
  return copy.fileFailed;
}
