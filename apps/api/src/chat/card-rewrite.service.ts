import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  generateObject,
  NoObjectGeneratedError,
  type LanguageModelUsage,
  type UIMessage,
} from "ai";
import { z } from "zod";
import {
  NETWORK_LABELS,
  NETWORK_TEXT_LIMITS,
  cardContentSchema,
  mediaOf,
  summarizeCardContent,
  type CardContent,
  type CardContentChangeDto,
  type SocialNetwork,
} from "@presencia/shared";
import { AiUsageService } from "../ai/ai-usage.service.js";
import { AiService } from "../ai/ai.service.js";
import { BrandVoiceService } from "../brand-voice/brand-voice.service.js";
import { CardContentService } from "../cards/card-content.service.js";
import { CardsRepository } from "../cards/cards.repository.js";
import { CreditsService } from "../credits/credits.service.js";
import { chargeUsageOf, getRateCard } from "../credits/rate-card.js";
import { DbService } from "../db/db.service.js";
import { ChatRepository } from "./chat.repository.js";
import { cardIdsIn, withLiveCards, type LiveCard } from "./context-diet.js";
import { buildSystemPrompt } from "./system-prompt.js";

// Pedirle un cambio a la IA sobre una card (F10.5 PR4, flujo 3 de los
// cambios): "hazlo más corto". El resultado es una VERSIÓN de la misma card,
// no una card nueva (eso sigue siendo pedirlo en el chat, flujo 1).
//
// Decisiones:
//
// - **El modelo ve la conversación donde nació la card** (decisión del
//   founder, F10.5): el ángulo que se discutió importa para no reescribir en
//   el vacío. Va como TRANSCRIPCIÓN de texto, no como mensajes con tool
//   calls: mandar tool calls sin las tools definidas lo rechazan algunos
//   proveedores, y el texto sale más barato. Las cards van resumidas y con
//   su contenido vivo (withLiveCards).
// - **Fuera del chat.** No escribe mensajes: el cambio vive en el historial
//   de versiones de la card, no en la conversación.
// - **Por tokens, sin % en el botón** (addendum ADR-012), tarea `post_adapt`:
//   es reescribir un post que ya existe, el trabajo para el que existe ese
//   tier de modelo.
// - **Una reescritura por card a la vez.** Dos clicks seguidos pagarían dos
//   llamadas para quedarse con la última. El candado es de este proceso: la
//   app corre en un solo contenedor (ADR-011); con varias réplicas haría
//   falta moverlo a la base.

const TASK_KIND = "post_adapt" as const;

/** Lo que se le pide al modelo: solo el texto de la card, por arquetipo. */
const REWRITE_SCHEMAS = {
  visual_first: z.object({ caption: z.string(), hashtags: z.array(z.string()) }),
  text_first: z.object({ body: z.string(), hashtags: z.array(z.string()) }),
  video_script: z.object({
    hook: z.string(),
    script: z.string(),
    caption: z.string(),
    hashtags: z.array(z.string()),
  }),
} as const;

/** Cuánto de la conversación viaja, contado desde el final. */
const TRANSCRIPT_MAX_CHARS = 8000;

@Injectable()
export class CardRewriteService {
  /**
   * Las reescrituras en curso, por usuario y card. Es el candado de "una a
   * la vez" y también lo que permite detenerlas: el cierre de la conexión no
   * es una señal confiable (el proxy de Vite en dev, nginx en prod, pueden
   * mantener abierta la del servidor), así que "Detener" además llama a
   * cancel() con un DELETE explícito.
   */
  private readonly running = new Map<string, AbortController>();

  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(AiService) private readonly ai: AiService,
    @Inject(AiUsageService) private readonly aiUsage: AiUsageService,
    @Inject(CreditsService) private readonly credits: CreditsService,
    @Inject(BrandVoiceService) private readonly voices: BrandVoiceService,
    @Inject(CardsRepository) private readonly cards: CardsRepository,
    @Inject(CardContentService) private readonly content: CardContentService,
    @Inject(ChatRepository) private readonly chats: ChatRepository,
  ) {}

  async rewrite(
    userId: string,
    cardId: string,
    instruction: string,
    signal?: AbortSignal,
  ): Promise<CardContentChangeDto> {
    const key = `${userId}:${cardId}`;
    if (this.running.has(key)) {
      throw new ConflictException("Ya estoy reescribiendo este borrador. Espera a que termine.");
    }
    const abort = new AbortController();
    if (signal?.aborted) abort.abort();
    signal?.addEventListener("abort", () => abort.abort(), { once: true });
    this.running.set(key, abort);
    try {
      return await this.run(userId, cardId, instruction, abort.signal);
    } finally {
      if (this.running.get(key) === abort) this.running.delete(key);
    }
  }

  /** "Detener": aborta la reescritura en curso de esta card, si hay una. */
  cancel(userId: string, cardId: string): boolean {
    const key = `${userId}:${cardId}`;
    const abort = this.running.get(key);
    abort?.abort();
    // El candado se suelta YA, no cuando la llamada abortada termine de
    // deshacerse: si no, pedir otro cambio justo después de "Detener"
    // chocaba con "Ya estoy reescribiendo". La abortada ya no escribe nada
    // (revisa la señal antes de guardar).
    this.running.delete(key);
    return abort !== undefined;
  }

  private async run(
    userId: string,
    cardId: string,
    instruction: string,
    signal?: AbortSignal,
  ): Promise<CardContentChangeDto> {
    const { card, transcript } = await this.dbService.runWithTenant(userId, async (tx) => {
      const found = await this.cards.findById(tx, cardId);
      if (!found) throw new NotFoundException("No encontramos esa publicación.");
      if (found.status !== "draft" && found.status !== "failed") {
        throw new ConflictException(
          "Esta publicación ya está programada o publicada. Cancela la programación para cambiarla.",
        );
      }
      if (!found.chatId) return { card: found, transcript: "" };
      const rows = await this.chats.listMessages(tx, found.chatId);
      const history = rows.map((row): UIMessage => ({
        id: row.id,
        role: row.role as UIMessage["role"],
        parts: row.parts as UIMessage["parts"],
      }));
      const liveRows = await this.cards.findContentByIds(tx, cardIdsIn(history));
      const live = new Map<string, LiveCard>(
        liveRows.map((r) => [r.id, { content: r.content as CardContent, status: r.status }]),
      );
      return { card: found, transcript: transcriptOf(withLiveCards(history, live)) };
    });

    // El mismo piso que un turno de chat: la reescritura es de ese tamaño.
    await this.credits.assertQuotaOr402(userId, getRateCard().minimumTurnUnits);

    const current = card.content as CardContent;
    const voice = await this.voices.getDefaultForPrompt(userId).catch(() => null);
    const modelo = this.ai.resolveForTask(TASK_KIND);
    const arranque = Date.now();
    const registrar = (usage: LanguageModelUsage, finishReason: unknown) =>
      this.aiUsage.registrar({
        userId,
        task: TASK_KIND,
        modelo,
        usage,
        stepsCount: 1,
        arranque,
        providerRaw: { usage, finishReason },
      });

    if (signal?.aborted) throw new ServiceUnavailableException("Se detuvo la reescritura.");
    let result;
    try {
      result = await generateObject({
        model: modelo.model,
        // El MISMO system prompt que el chat: la reescritura tiene que sonar
        // como el resto de lo que Presencia escribe para este creator.
        system: buildSystemPrompt(voice),
        schema: REWRITE_SCHEMAS[current.archetype],
        prompt: rewritePrompt(current, card.network, instruction, transcript),
        abortSignal: signal,
      });
    } catch (error) {
      // Un objeto que no pasa el schema se pagó igual: el usage viene en el
      // error. Se registra y se cobra, pero no hay versión que guardar.
      if (NoObjectGeneratedError.isInstance(error) && error.usage) {
        await registrar(error.usage, error.finishReason);
        await this.charge(userId, error.usage);
        throw new ServiceUnavailableException(
          "No pude reescribir el borrador. Inténtalo de nuevo o dilo de otra forma.",
        );
      }
      // Detenida a media llamada: el SDK no entrega usage de lo que el
      // proveedor alcanzó a generar (mismo hueco conocido que un turno de
      // chat abortado, ADR-006), así que no hay nada que registrar ni cobrar.
      if (signal?.aborted) throw new ServiceUnavailableException("Se detuvo la reescritura.");
      throw error;
    }
    await registrar(result.usage, result.finishReason);

    // Detener a tiempo: si el usuario ya se fue, no se guarda ni se cobra
    // una versión que no va a ver. (Un abort durante la llamada ya lanzó.)
    if (signal?.aborted) {
      throw new ServiceUnavailableException("Se detuvo la reescritura.");
    }

    return this.dbService.runWithTenant(userId, async (tx) => {
      // La card bloqueada y releída: entre la lectura de arriba y ahora pasó
      // la llamada al modelo, y el usuario pudo editarla o programarla.
      const locked = await this.content.lockEditable(tx, cardId);
      // "Detener" pudo llegar mientras se esperaba el lock: dentro de la
      // transacción, lanzar deshace todo (ni versión ni cobro).
      if (signal?.aborted) throw new ServiceUnavailableException("Se detuvo la reescritura.");
      const latest = locked.content as CardContent;
      const next = cardContentSchema.parse({
        ...latest,
        ...result.object,
        hashtags: result.object.hashtags.map((t) => t.replace(/^#+/, "").trim()).filter(Boolean),
        archetype: latest.archetype,
        ...mediaOf(latest),
      });
      const change = await this.content.write(tx, userId, locked, next, {
        source: "ai",
        instruction,
      });
      // En la misma transacción que la versión que lo justifica: o se cobra
      // y queda la versión, o ninguna de las dos (modelo-de-datos.md).
      await this.credits.charge(tx, {
        userId,
        usage: chargeUsageOf(result.usage),
        taskKind: TASK_KIND,
        reason: "card_rewrite",
      });
      // Y justo antes del COMMIT: lo último que se puede revisar sin que el
      // navegador ya haya dicho "no se cobró".
      if (signal?.aborted) throw new ServiceUnavailableException("Se detuvo la reescritura.");
      return change;
    });
  }

  private async charge(userId: string, usage: LanguageModelUsage): Promise<void> {
    await this.dbService.runWithTenant(userId, (tx) =>
      this.credits.charge(tx, {
        userId,
        usage: chargeUsageOf(usage),
        taskKind: TASK_KIND,
        reason: "card_rewrite",
      }),
    );
  }
}

/** El texto de la card que el modelo puede cambiar, legible. */
function draftText(content: CardContent): string {
  const tags = content.hashtags.length > 0 ? content.hashtags.join(", ") : "(sin hashtags)";
  switch (content.archetype) {
    case "visual_first":
      return `Caption:\n${content.caption}\n\nHashtags: ${tags}`;
    case "text_first":
      return `Texto:\n${content.body}\n\nHashtags: ${tags}`;
    case "video_script":
      return `Hook:\n${content.hook}\n\nGuion:\n${content.script}\n\nDescripción:\n${content.caption}\n\nHashtags: ${tags}`;
  }
}

export function rewritePrompt(
  content: CardContent,
  network: SocialNetwork,
  instruction: string,
  transcript: string,
): string {
  const parts = [
    `Reescribe este borrador para ${NETWORK_LABELS[network]} siguiendo la instrucción del creator.`,
    `Instrucción: "${instruction}"`,
    `Límite de ${NETWORK_LABELS[network]}: ${String(NETWORK_TEXT_LIMITS[network])} caracteres en total, contando los hashtags.`,
    "Cambia solo lo que la instrucción pide. Conserva el ángulo, los datos y la voz del creator. " +
      'No inventes datos nuevos. Los hashtags van sin "#".',
    `<borrador>\n${draftText(content)}\n</borrador>`,
  ];
  if (transcript) {
    parts.push(
      "La conversación donde nació el borrador, como contexto (puede estar recortada al principio):",
      `<conversacion>\n${transcript}\n</conversacion>`,
    );
  }
  return parts.join("\n\n");
}

/**
 * La conversación como texto: lo que dijo cada quien y, en vez de los tool
 * calls, un resumen de cada borrador. Se recorta desde el principio: lo más
 * reciente es lo que más pesa.
 */
export function transcriptOf(history: UIMessage[]): string {
  const lines: string[] = [];
  for (const message of history) {
    const who = message.role === "user" ? "Creator" : "Presencia";
    for (const part of message.parts) {
      if (part.type === "text" && part.text.trim()) {
        lines.push(`${who}: ${part.text.trim()}`);
        continue;
      }
      const output = (
        part as { state?: string; output?: { network?: string; content?: CardContent } }
      ).output;
      if (
        typeof part.type === "string" &&
        part.type.startsWith("tool-") &&
        output?.content &&
        output.network
      ) {
        lines.push(`[Borrador para ${output.network}: ${summarizeCardContent(output.content)}]`);
      }
    }
  }
  const text = lines.join("\n");
  return text.length > TRANSCRIPT_MAX_CHARS ? `…${text.slice(-TRANSCRIPT_MAX_CHARS)}` : text;
}
