import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  CardContent,
  PublicationCardDto,
  ScheduleCardBody,
  ScheduleGroupBody,
  ScheduleGroupResultItem,
  SocialNetwork,
} from "@presencia/shared";
import { ChannelsRepository } from "../channels/channels.repository.js";
import { DbService } from "../db/db.service.js";
import {
  PublishingRateLimitError,
  PublishingRejectedError,
  PublishingUnavailableError,
} from "../publishing/errors.js";
import { PUBLISHING_PROVIDER, type PublishingProvider } from "../publishing/publishing.provider.js";
import { CardsRepository, type CardRow } from "./cards.repository.js";

// Ciclo de vida de la card (F6, ADR-009 addendum): programar, reprogramar,
// cancelar, reconciliar. Reglas duras:
//
// - Solo draft→scheduled, scheduled→scheduled (reprogramar) y
//   failed→scheduled (reintentar tras un fallo del proveedor). Cualquier
//   otra transición es 409 — publicada/cancelada no se reprograman desde
//   acá (Adaptar/regenerar crea una card nueva).
// - Invariante DB↔PostFast: markScheduling dejar provider_ref en null a
//   propósito; solo se llena si la llamada al proveedor tuvo éxito. Si
//   falla, la card vuelve a draft con el motivo — nunca se queda "scheduled"
//   apuntando a nada. reconcileDueCards detecta y cierra el hueco si el
//   proceso muere justo entre las dos transacciones.
// - Reprogramar = cancel(providerRef viejo) + schedule(nuevo). PostFast no
//   tiene un endpoint de update de post.
// - Cancelar programación → draft, no "canceled" (decisión de producto,
//   presencia-chat.md: el contenido sigue siendo útil). "canceled" del enum
//   queda para descartar una card en Biblioteca (fuera de F6).

const MIN_LEAD_MS = 5 * 60 * 1000;
const RECONCILE_GRACE_MS = 2 * 60 * 1000;
const RECONCILE_COOLDOWN_MS = 60 * 1000;
const PROVIDER_BATCH_SIZE = 100;

const SCHEDULABLE_STATUSES: ReadonlySet<CardRow["status"]> = new Set([
  "draft",
  "scheduled",
  "failed",
]);

const NETWORKS_REQUIRING_MEDIA: ReadonlySet<SocialNetwork> = new Set([
  "instagram",
  "tiktok",
  "youtube",
]);

@Injectable()
export class CardsService {
  // Cooldown en memoria por proceso (mismo criterio pragmático que
  // CreditsService.ensureCurrentCycle antes de F8: un solo proceso hoy, no
  // hace falta Redis para esto). Si algún día hay más de una instancia de
  // la API, cada una reconcilia con su propio cooldown — redundante pero
  // no incorrecto (reconcileDueCards es idempotente).
  private readonly reconcileCooldown = new Map<string, number>();

  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(CardsRepository) private readonly repo: CardsRepository,
    @Inject(ChannelsRepository) private readonly channelsRepo: ChannelsRepository,
    @Inject(PUBLISHING_PROVIDER) private readonly provider: PublishingProvider,
  ) {}

  async listByChat(userId: string, chatId: string): Promise<PublicationCardDto[]> {
    await this.maybeReconcile(userId);
    return this.dbService.runWithTenant(userId, async (tx) => {
      const rows = await this.repo.listByChat(tx, chatId);
      return rows.map(toDto);
    });
  }

  async findConflicts(userId: string, from: Date, to: Date): Promise<PublicationCardDto[]> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const rows = await this.repo.findConflicts(tx, from, to);
      return rows.map(toDto);
    });
  }

  async schedule(
    userId: string,
    cardId: string,
    body: ScheduleCardBody,
  ): Promise<PublicationCardDto> {
    const scheduledAt = new Date(body.scheduledAt);
    if (scheduledAt.getTime() < Date.now() + MIN_LEAD_MS) {
      throw new BadRequestException("Elige un horario al menos 5 minutos en el futuro.");
    }

    const { card, accountProviderRef, previousProviderRef } = await this.dbService.runWithTenant(
      userId,
      async (tx) => {
        const existing = await this.repo.findById(tx, cardId);
        if (!existing) throw new NotFoundException("Esa publicación no existe.");
        if (!SCHEDULABLE_STATUSES.has(existing.status)) {
          throw new ConflictException(
            `No se puede programar una publicación en estado "${existing.status}".`,
          );
        }
        const account = await this.channelsRepo.findAccountById(tx, body.socialAccountId);
        if (!account || account.status !== "active") {
          throw new BadRequestException("Esa cuenta no está disponible para publicar.");
        }
        if (account.network !== existing.network) {
          throw new BadRequestException("Esa cuenta no corresponde a la red de esta publicación.");
        }
        assertHasMedia(existing);

        // scheduled: hay que cancelar el post viejo antes de programar el
        // nuevo (reprogramar). failed: puede traer un provider_ref viejo de
        // cuando aún estaba scheduled (markFailed no lo limpia, queda de
        // rastro) — cancelarlo también es correcto y, como cancel() es
        // idempotente, inofensivo si PostFast ya no tiene nada que cancelar.
        const previousProviderRef =
          existing.status === "scheduled" || existing.status === "failed"
            ? existing.providerRef
            : null;
        const card = await this.repo.markScheduling(tx, cardId, {
          socialAccountId: body.socialAccountId,
          scheduledAt,
        });
        return { card, accountProviderRef: account.providerRef, previousProviderRef };
      },
    );

    // Fuera de la transacción: llamadas de red al proveedor.
    if (previousProviderRef) {
      try {
        await this.provider.cancel(previousProviderRef);
      } catch (error) {
        // Best-effort: si el cancel real falla, seguimos con el nuevo
        // horario de todos modos — el objetivo del usuario es reprogramar,
        // no bloquearse. Hueco conocido: PostFast puede terminar con dos
        // posts si esto falla (viejo + nuevo) — se loguea para revisión
        // manual, no aborta el flujo.
        console.error(
          `[cards] No se pudo cancelar ${previousProviderRef} en el proveedor antes de reprogramar ${cardId}:`,
          error,
        );
      }
    }

    try {
      const { providerRef } = await this.provider.schedule({
        network: card.network,
        content: card.content as CardContent,
        scheduledAt,
        accountProviderRef,
      });
      return this.dbService.runWithTenant(userId, async (tx) => {
        const withRef = await this.repo.attachProviderRef(tx, cardId, providerRef);
        return toDto(withRef);
      });
    } catch (error) {
      await this.dbService.runWithTenant(userId, (tx) =>
        this.repo.resetToDraft(tx, cardId, errorDetailFrom(error)),
      );
      throw toHttpException(error);
    }
  }

  /**
   * Cada card del grupo actúa independiente — una puede programarse y otra
   * fallar (cuenta desconectada, sin media, etc) sin abortar el resto.
   * "keepDraft" es un no-op explícito: la card conserva el estado que
   * tenía, el caller solo necesita su snapshot actual para refrescar la UI.
   */
  async scheduleGroup(userId: string, body: ScheduleGroupBody): Promise<ScheduleGroupResultItem[]> {
    const results: ScheduleGroupResultItem[] = [];
    for (const item of body.items) {
      if (item.keepDraft) {
        const current = await this.dbService.runWithTenant(userId, (tx) =>
          this.repo.findById(tx, item.cardId),
        );
        results.push({
          cardId: item.cardId,
          ok: current !== undefined,
          card: current ? toDto(current) : null,
          error: current ? null : "Esa publicación no existe.",
        });
        continue;
      }
      try {
        const card = await this.schedule(userId, item.cardId, {
          socialAccountId: item.socialAccountId,
          scheduledAt: item.scheduledAt,
        });
        results.push({ cardId: item.cardId, ok: true, card, error: null });
      } catch (error) {
        results.push({
          cardId: item.cardId,
          ok: false,
          card: null,
          error: error instanceof Error ? error.message : "No se pudo programar.",
        });
      }
    }
    return results;
  }

  async cancelSchedule(userId: string, cardId: string): Promise<PublicationCardDto> {
    const card = await this.dbService.runWithTenant(userId, (tx) => this.repo.findById(tx, cardId));
    if (!card) throw new NotFoundException("Esa publicación no existe.");
    if (card.status !== "scheduled") {
      throw new ConflictException("Esa publicación no está programada.");
    }

    if (card.providerRef) {
      try {
        await this.provider.cancel(card.providerRef);
      } catch (error) {
        // Al contrario que en schedule(): si esto falla, la card SIGUE
        // programada en nuestra DB — nunca se marca cancelada localmente
        // sin confirmar que PostFast también canceló (evitaría que el
        // usuario crea que canceló algo que en realidad se va a publicar).
        throw toHttpException(error);
      }
    }
    return this.dbService.runWithTenant(userId, async (tx) =>
      toDto(await this.repo.cancelSchedule(tx, cardId)),
    );
  }

  /**
   * Reemplaza temporalmente al job de pg-boss de F8 (mismo criterio que
   * CreditsService.ensureCurrentCycle) — F8 solo cambia el disparador (cron
   * en vez de "alguien listó sus cards"), no esta lógica. Nunca debe tumbar
   * al caller: un fallo de reconciliación no debe impedir listar cards.
   */
  private async maybeReconcile(userId: string): Promise<void> {
    const last = this.reconcileCooldown.get(userId) ?? 0;
    if (Date.now() - last < RECONCILE_COOLDOWN_MS) return;
    this.reconcileCooldown.set(userId, Date.now());
    try {
      await this.reconcileDueCards(userId);
    } catch (error) {
      console.error(`[cards] Reconciliación con el proveedor falló para ${userId}:`, error);
    }
  }

  async reconcileDueCards(userId: string): Promise<void> {
    const cutoff = new Date(Date.now() - RECONCILE_GRACE_MS);

    // 1) Huérfanas: el proceso murió entre markScheduling y
    // attachProviderRef — sin provider_ref nunca hay nada que preguntarle
    // al proveedor, así que se cierran directo como fallidas.
    const orphaned = await this.dbService.runWithTenant(userId, (tx) =>
      this.repo.listOrphanedScheduled(tx, cutoff),
    );
    for (const card of orphaned) {
      await this.dbService.runWithTenant(userId, (tx) =>
        this.repo.markFailed(tx, card.id, {
          reason: "No se pudo confirmar la programación con el proveedor de publicación.",
        }),
      );
    }

    // 2) Debidas: su hora ya pasó y sí tienen provider_ref — preguntarle al
    // proveedor si de verdad se publicaron.
    const due = await this.dbService.runWithTenant(userId, (tx) =>
      this.repo.listDueScheduled(tx, cutoff),
    );
    const withRef = due.filter(
      (c): c is CardRow & { providerRef: string } => c.providerRef !== null,
    );
    for (let i = 0; i < withRef.length; i += PROVIDER_BATCH_SIZE) {
      const batch = withRef.slice(i, i + PROVIDER_BATCH_SIZE);
      const states = await this.provider.getPostStates(batch.map((c) => c.providerRef));
      for (const card of batch) {
        const state = states.get(card.providerRef);
        if (!state || state.status === "failed") {
          await this.dbService.runWithTenant(userId, (tx) =>
            this.repo.markFailed(tx, card.id, {
              reason: "El proveedor de publicación no confirmó esta publicación.",
            }),
          );
        } else if (state.status === "published") {
          await this.dbService.runWithTenant(userId, (tx) =>
            this.repo.markPublished(tx, card.id, state.publishedAt ?? new Date()),
          );
        }
        // "scheduled": sigue en cola del lado del proveedor, no-op.
      }
    }
  }
}

function toDto(row: CardRow): PublicationCardDto {
  return {
    id: row.id,
    chatId: row.chatId,
    archetype: row.archetype,
    network: row.network,
    status: row.status,
    content: row.content as CardContent,
    groupId: row.groupId,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    socialAccountId: row.socialAccountId,
  };
}

/** instagram/tiktok/youtube no aceptan un post sin media (límite real de la plataforma, no nuestro). */
function assertHasMedia(card: CardRow): void {
  if (!NETWORKS_REQUIRING_MEDIA.has(card.network)) return;
  const content = card.content as CardContent;
  const hasAsset = "assetIds" in content && content.assetIds.length > 0;
  if (hasAsset) return;
  throw new BadRequestException(
    `${card.network} necesita una imagen o video antes de programar — agrégala y vuelve a intentar.`,
  );
}

function errorDetailFrom(error: unknown): unknown {
  if (error instanceof PublishingRejectedError)
    return { message: error.message, detail: error.detail };
  if (error instanceof Error) return { message: error.message };
  return { message: String(error) };
}

function toHttpException(error: unknown): Error {
  if (error instanceof PublishingRejectedError) return new BadRequestException(error.message);
  if (error instanceof PublishingRateLimitError || error instanceof PublishingUnavailableError) {
    return new HttpException(error.message, HttpStatus.SERVICE_UNAVAILABLE);
  }
  return error instanceof Error ? error : new Error(String(error));
}
