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
import {
  PUBLISHING_PROVIDER,
  type PublishingProvider,
  type SchedulePostRequest,
} from "../publishing/publishing.provider.js";
import { parseHttpUrl } from "../publishing/http-url.js";
import { toHttpException as toProviderHttpException } from "../publishing/to-http-exception.js";
import { CardsRepository, type CalendarFilters, type CardRow } from "./cards.repository.js";

// Ciclo de vida de la card (F6, ADR-009 addendum): programar, reprogramar,
// cancelar, reconciliar. Reglas duras:
//
// - Solo draft→scheduled, scheduled→scheduled (reprogramar) y
//   failed→scheduled (reintentar tras un fallo del proveedor). Cualquier
//   otra transición es 409 — publicada/cancelada no se reprograman desde
//   acá (Adaptar/regenerar crea una card nueva).
// - Invariante DB↔PostFast: markScheduling dejar provider_ref en null a
//   propósito; solo se llena si la llamada al proveedor tuvo éxito.
//   Si falla, la reacción depende de qué tan seguros estamos de que NO pasó
//   nada del otro lado (ver classifyScheduleFailure): un rechazo explícito
//   del proveedor (4xx, "rejected") sí vuelve a draft sin dudar — nunca se
//   creó nada. Pero un fallo AMBIGUO (5xx, red, o una respuesta 2xx que no
//   pudimos interpretar — "ambiguous") va a failed, no a draft: el
//   proveedor pudo haber creado el efecto real de todos modos (incidente
//   2026-08-18: PostFast sí creó y programó un post real, solo el parseo
//   de la respuesta falló después — resetear a draft ahí habría borrado
//   scheduledAt/socialAccountId, el único rastro para ubicar ese post real
//   a mano). markFailed no limpia esos campos ni provider_ref, así que el
//   rastro sobrevive y la card queda retomable (failed está en
//   SCHEDULABLE_STATUSES) sin invitar un reintento silencioso — el mensaje
//   avisa explícitamente de revisar el proveedor antes de reintentar.
//   reconcileDueCards detecta y cierra el hueco equivalente (sin
//   provider_ref, scheduled vencido) si el proceso muere entre las dos
//   transacciones — misma lógica, misma reacción (markFailed).
//   OJO: esa invariante vale para PROGRAMAR. Reprogramar (abajo) conserva
//   el provider_ref a propósito, así que su hueco es otro y más chico: si
//   el proceso muere entre markRescheduled y la llamada al proveedor, la
//   fila dice el horario NUEVO mientras el proveedor sigue con el VIEJO.
//   No lo detecta listOrphanedScheduled (hay provider_ref), pero tampoco se
//   pierde nada: el post existe y se publica, y el primer pase de
//   reconciliación posterior a esa publicación lo marca published. Lo que
//   hay entremedio es un calendario que miente un rato, no una card rota.
// - Reprogramar tiene DOS caminos, y cuál se toma lo decide qué cambió:
//   si solo cambia la hora (misma cuenta, card ya "scheduled" con un post
//   vivo del otro lado) va por provider.reschedule(), que en un proveedor
//   con update de verdad mueve el post y conserva su provider_ref. Cambiar
//   de cuenta es otro destino, no el mismo post movido: sigue siendo
//   cancel(viejo) + schedule(nuevo).
//   Que PostFast no tenga endpoint de update ya no se nota acá: lo emula su
//   adapter (ver PostFastProvider.reschedule), que es donde vive el hueco
//   de "puede quedar un post duplicado" — es un rasgo suyo, no del dominio.
// - La semántica de fallo de reprogramar NO es la de programar, a
//   propósito: un rechazo explícito devuelve la card a su horario viejo en
//   vez de mandarla a draft. La card ya estaba válidamente programada;
//   reprogramar y fallar no debe costarte la programación que tenías. Un
//   fallo ambiguo sí va a failed, igual que en schedule().
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

  /**
   * F7: lo que el Calendario pinta en el rango visible. Reconcilia primero,
   * igual que listByChat — es el mismo motivo: sin job de background (F8) el
   * único momento en que se le pregunta a PostFast por las cards vencidas es
   * cuando alguien mira una superficie que las muestra, y el Calendario es
   * justamente donde más se nota una card "programada" cuya hora ya pasó.
   */
  async listByRange(
    userId: string,
    from: Date,
    to: Date,
    filters: CalendarFilters = {},
  ): Promise<PublicationCardDto[]> {
    await this.maybeReconcile(userId);
    return this.dbService.runWithTenant(userId, async (tx) => {
      const rows = await this.repo.listByRange(tx, from, to, filters);
      return rows.map(toDto);
    });
  }

  /** F7: bandeja de borradores del panel izquierdo (sin fecha, no entran en ningún rango). */
  async listDrafts(userId: string): Promise<PublicationCardDto[]> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const rows = await this.repo.listDrafts(tx);
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

    const { card, accountProviderRef, previousProviderRef, isReschedule, previousScheduledAt } =
      await this.dbService.runWithTenant(userId, async (tx) => {
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
        // idempotente, inofensivo si el proveedor ya no tiene nada que
        // cancelar.
        const previousProviderRef =
          existing.status === "scheduled" || existing.status === "failed"
            ? existing.providerRef
            : null;

        // Reprogramación pura: la card ya está programada, con un post vivo
        // del otro lado, y lo ÚNICO que cambia es la hora. Ese caso va por
        // provider.reschedule(), que en un proveedor con update de verdad
        // conserva el post (y con él el provider_ref) en vez de destruirlo
        // y recrearlo. Cambiar de cuenta, en cambio, sigue por el camino
        // largo: es otro destino, no el mismo post movido.
        const isReschedule =
          existing.status === "scheduled" &&
          existing.providerRef !== null &&
          existing.scheduledAt !== null &&
          existing.socialAccountId === body.socialAccountId;

        const card = isReschedule
          ? // Devuelve undefined si otra transacción sacó la card de
            // "scheduled" entre el findById de arriba y este UPDATE (READ
            // COMMITTED no lo impide). Es la misma carrera que cubre
            // attachProviderRefIfScheduled, y acá se corta antes de tocar
            // al proveedor.
            ((await this.repo.markRescheduled(tx, cardId, { scheduledAt })) ??
            (() => {
              throw new ConflictException("Esa publicación cambió de estado, vuelve a intentar.");
            })())
          : await this.repo.markScheduling(tx, cardId, {
              socialAccountId: body.socialAccountId,
              scheduledAt,
            });
        return {
          card,
          accountProviderRef: account.providerRef,
          previousProviderRef,
          isReschedule,
          previousScheduledAt: existing.scheduledAt,
        };
      });

    const req: SchedulePostRequest = {
      network: card.network,
      content: card.content as CardContent,
      scheduledAt,
      accountProviderRef,
    };

    if (isReschedule && previousProviderRef && previousScheduledAt) {
      return this.completeReschedule(userId, cardId, {
        previousProviderRef,
        previousScheduledAt,
        req,
      });
    }

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

    let providerRef: string;
    try {
      ({ providerRef } = await this.provider.schedule(req));
    } catch (error) {
      const failure = classifyScheduleFailure(error);
      const detail = errorDetailFrom(error, failure);
      // Único log de toda la ruta de publish/schedule — sin esto, un
      // fallo ambiguo (2xx sin id parseable, 5xx, red) es indiagnosticable:
      // el body crudo del proveedor no llega a ningún otro lado más que
      // acá y a error_detail en la DB (ver serializableDetail).
      console.error(
        `[cards] schedule() falló (${failure}) para ${cardId} — cuenta ${accountProviderRef}, horario ${scheduledAt.toISOString()}:`,
        JSON.stringify(detail),
      );
      await this.dbService.runWithTenant(userId, (tx) =>
        failure === "rejected"
          ? this.repo.resetToDraft(tx, cardId, detail)
          : this.repo.markFailed(tx, cardId, detail),
      );
      throw toHttpException(error, failure);
    }

    return this.persistProviderRef(userId, cardId, providerRef);
  }

  /**
   * Reprogramación pura (misma cuenta, post vivo del otro lado). Se separa
   * de `schedule()` porque su semántica de fallo es DISTINTA, y a propósito:
   * acá la card ya estaba válidamente programada, así que un rechazo
   * explícito la devuelve a donde estaba en vez de mandarla a `draft`.
   * Reprogramar y fallar no debe costarte la programación que ya tenías.
   */
  private async completeReschedule(
    userId: string,
    cardId: string,
    input: { previousProviderRef: string; previousScheduledAt: Date; req: SchedulePostRequest },
  ): Promise<PublicationCardDto> {
    const { previousProviderRef, previousScheduledAt, req } = input;
    let providerRef: string;
    try {
      ({ providerRef } = await this.provider.reschedule(previousProviderRef, req));
    } catch (error) {
      const failure = classifyScheduleFailure(error);
      const detail = errorDetailFrom(error, failure);
      console.error(
        `[cards] reschedule() falló (${failure}) para ${cardId} — post ${previousProviderRef}, ` +
          `horario nuevo ${req.scheduledAt.toISOString()}:`,
        JSON.stringify(detail),
      );
      await this.dbService.runWithTenant(userId, (tx) =>
        failure === "rejected"
          ? // El proveedor rechazó explícitamente. Por contrato del puerto
            // eso significa que no movió nada y que el post original sigue
            // vivo, así que la card vuelve a su horario viejo con su
            // provider_ref intacto.
            //
            // markRescheduled trae guardia de `status='scheduled'`: si el
            // usuario le dio Cancelar mientras la llamada seguía en vuelo,
            // no hay nada que restaurar y no se le resucita la card.
            this.repo.markRescheduled(tx, cardId, { scheduledAt: previousScheduledAt })
          : // Ambiguo: no sabemos si el post se movió, se recreó o se
            // perdió. Mismo criterio que schedule() — `failed` conservando
            // horario, cuenta y provider_ref como rastro.
            this.repo.markFailed(tx, cardId, detail),
      );
      throw toHttpException(error, failure);
    }

    return this.persistProviderRef(userId, cardId, providerRef);
  }

  /**
   * Bookkeeping compartido por programar y reprogramar: estampa el
   * providerRef que devolvió el proveedor, o deshace el post si la card ya
   * dejó de estar "scheduled".
   *
   * Vive fuera del try/catch de la llamada al proveedor a propósito: el
   * proveedor YA tuvo éxito, lo que sigue es cosa nuestra (race real, code
   * review 2026-08-20) y no debe caer en la clasificación
   * rejected/ambiguous, que es para errores DE esa llamada.
   *
   * Reprogramar pasa por acá aunque el providerRef no haya cambiado (con un
   * proveedor que tiene update es el mismo): el UPDATE es inofensivo y la
   * guardia `status='scheduled'` sigue siendo justo la que hace falta.
   */
  private async persistProviderRef(
    userId: string,
    cardId: string,
    providerRef: string,
  ): Promise<PublicationCardDto> {
    const attached = await this.dbService.runWithTenant(userId, (tx) =>
      this.repo.attachProviderRefIfScheduled(tx, cardId, providerRef),
    );
    if (attached) return toDto(attached);

    // La card dejó de estar "scheduled" mientras la llamada al proveedor
    // seguía en vuelo (típicamente: el usuario le dio Cancelar justo en
    // ese margen — ver attachProviderRefIfScheduled). El post YA existe
    // del otro lado; hay que deshacerlo en vez de dejarlo huérfano y sin
    // ninguna card que lo referencie.
    try {
      await this.provider.cancel(providerRef);
    } catch (cancelError) {
      console.error(
        `[cards] ${cardId} dejó de estar "scheduled" mientras se programaba — no se pudo cancelar ` +
          `el post huérfano ${providerRef} en el proveedor, revisión manual:`,
        cancelError,
      );
    }
    const current = await this.dbService.runWithTenant(userId, (tx) =>
      this.repo.findById(tx, cardId),
    );
    if (!current) throw new NotFoundException("Esa publicación ya no existe.");
    return toDto(current);
  }

  /**
   * Cada card del grupo actúa independiente — una puede programarse y otra
   * fallar (cuenta desconectada, sin media, etc) sin abortar el resto.
   * "keepDraft" es un no-op explícito: la card conserva el estado que
   * tenía, el caller solo necesita su snapshot actual para refrescar la UI.
   */
  async scheduleGroup(userId: string, body: ScheduleGroupBody): Promise<ScheduleGroupResultItem[]> {
    // En paralelo, no secuencial (code review 2026-08-20): cada item ya es
    // independiente por diseño (docstring de arriba) — nada de mutable
    // compartido entre ellos, así que encadenarlos con `for...await` solo
    // sumaba la latencia de cada uno (transacción + red al proveedor) en
    // vez de pagar el máximo. scheduleItem nunca rechaza — cada item
    // resuelve su propio resultado, Promise.all conserva el orden.
    return Promise.all(body.items.map((item) => this.scheduleGroupItem(userId, item)));
  }

  private async scheduleGroupItem(
    userId: string,
    item: ScheduleGroupBody["items"][number],
  ): Promise<ScheduleGroupResultItem> {
    if (item.keepDraft) {
      const current = await this.dbService.runWithTenant(userId, (tx) =>
        this.repo.findById(tx, item.cardId),
      );
      return {
        cardId: item.cardId,
        ok: current !== undefined,
        card: current ? toDto(current) : null,
        error: current ? null : "Esa publicación no existe.",
      };
    }
    try {
      const card = await this.schedule(userId, item.cardId, {
        socialAccountId: item.socialAccountId,
        scheduledAt: item.scheduledAt,
      });
      return { cardId: item.cardId, ok: true, card, error: null };
    } catch (error) {
      return {
        cardId: item.cardId,
        ok: false,
        card: null,
        error: error instanceof Error ? error.message : "No se pudo programar.",
      };
    }
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
    // Un solo UPDATE (markManyFailed) + una sola transacción para todas
    // las huérfanas del pase, en vez de una transacción por card (code
    // review 2026-08-20) — todas comparten el mismo motivo, no hay razón
    // real para separarlas.
    if (orphaned.length > 0) {
      await this.dbService.runWithTenant(userId, (tx) =>
        this.repo.markManyFailed(
          tx,
          orphaned.map((c) => c.id),
          { reason: "No se pudo confirmar la programación con el proveedor de publicación." },
        ),
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

      // Bucket por resultado en vez de una transacción por card dentro
      // del batch (code review 2026-08-20): "failed"/sin confirmar
      // comparten motivo → un solo markManyFailed; "published" trae un
      // publishedAt distinto por card (no se puede fusionar en un solo
      // UPDATE simple), pero al menos las N cards de este batch quedan
      // en UNA transacción, no N.
      const failedIds: string[] = [];
      const toPublish: { id: string; publishedAt: Date; postUrl: string | null }[] = [];
      for (const card of batch) {
        const state = states.get(card.providerRef);
        if (!state || state.status === "failed") {
          failedIds.push(card.id);
        } else if (state.status === "published") {
          toPublish.push({
            id: card.id,
            publishedAt: state.publishedAt ?? new Date(),
            // Puede venir null y está bien: no todos los proveedores dan la
            // URL del post (PostFast no la da nunca).
            postUrl: state.postUrl,
          });
        }
        // "scheduled": sigue en cola del lado del proveedor, no-op.
      }

      if (failedIds.length > 0) {
        await this.dbService.runWithTenant(userId, (tx) =>
          this.repo.markManyFailed(tx, failedIds, {
            reason: "El proveedor de publicación no confirmó esta publicación.",
          }),
        );
      }
      if (toPublish.length > 0) {
        await this.dbService.runWithTenant(userId, async (tx) => {
          for (const { id, publishedAt, postUrl } of toPublish) {
            await this.repo.markPublished(tx, id, publishedAt, postUrl);
          }
        });
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
    // Se estrecha también acá, no solo en el adapter: es donde el valor
    // se consume (el frontend lo mete en un href) y la columna la puede
    // llenar un proveedor futuro o un UPDATE a mano.
    postUrl: parseHttpUrl(row.postUrl),
    errorMessage: errorMessageFrom(row.errorDetail),
  };
}

/**
 * row.errorDetail es jsonb sin tipo — puede ser {message} (errorDetailFrom,
 * de abajo) o el {reason} más viejo que reconcileDueCards ya escribía antes
 * de este cambio (líneas ~295/315 de este archivo). Guardia de tipo en vez
 * de asumir la forma nueva: una fila vieja con {reason} no debe reventar
 * esto, simplemente no tiene mensaje que mostrar.
 */
function errorMessageFrom(errorDetail: unknown): string | null {
  if (typeof errorDetail !== "object" || errorDetail === null) return null;
  const message = (errorDetail as { message?: unknown }).message;
  return typeof message === "string" ? message : null;
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

type ScheduleFailure = "rejected" | "ambiguous";

const AMBIGUOUS_SCHEDULE_MESSAGE =
  "No pudimos confirmar la programación con el proveedor. Es posible que el post sí se haya creado — revísalo en tu panel de PostFast antes de reintentar, para no duplicarlo.";

/**
 * "rejected": el proveedor evaluó la solicitud y la rechazó explícitamente
 * (4xx, 429) — nada se creó del otro lado, es seguro volver a draft.
 * "ambiguous": cualquier otra cosa (5xx, error de red, o una respuesta 2xx
 * que no pudimos interpretar) — no sabemos si el efecto real ocurrió.
 * Default a "ambiguous" a propósito: clasificar de más como ambiguo cuesta
 * un mensaje cauteloso de más; clasificar de más como rechazo cuesta
 * perder el rastro de un post real (incidente 2026-08-18, ver cabecera).
 */
function classifyScheduleFailure(error: unknown): ScheduleFailure {
  if (error instanceof PublishingRejectedError) return "rejected";
  if (error instanceof PublishingRateLimitError) return "rejected";
  return "ambiguous";
}

/** Trunca a ~8kb — el body de un tercero no debe poder inflar la fila sin límite. */
const DETAIL_MAX_CHARS = 8_000;

/**
 * Normaliza el detail de un error de proveedor a algo serializable en jsonb.
 * Un Error crudo (el caso de fallo de red, ver postfast.provider.ts:156-159)
 * se pierde como `{}` con JSON.stringify directo — hay que desarmarlo a
 * mano. Cualquier otro valor no serializable (ciclos, BigInt) cae al
 * fallback en vez de tronar.
 */
/** name/message/cause de un Error, recursivo — cause puede ser otro Error. */
function errorToPlainObject(error: Error): { name: string; message: string; cause?: unknown } {
  if (error.cause === undefined) return { name: error.name, message: error.message };
  const cause = error.cause instanceof Error ? errorToPlainObject(error.cause) : error.cause;
  return { name: error.name, message: error.message, cause };
}

function serializableDetail(detail: unknown): unknown {
  const normalized = detail instanceof Error ? errorToPlainObject(detail) : detail;
  try {
    const serialized = JSON.stringify(normalized);
    if (serialized === undefined) return undefined;
    if (serialized.length <= DETAIL_MAX_CHARS) return normalized;
    return { truncated: true, preview: serialized.slice(0, DETAIL_MAX_CHARS) };
  } catch {
    return { raw: String(normalized) };
  }
}

function errorDetailFrom(error: unknown, failure: ScheduleFailure): unknown {
  if (failure === "ambiguous") {
    const providerMessage = error instanceof Error ? error.message : String(error);
    const detail =
      error instanceof PublishingRejectedError || error instanceof PublishingUnavailableError
        ? error.detail
        : undefined;
    return {
      message: AMBIGUOUS_SCHEDULE_MESSAGE,
      providerMessage,
      detail: serializableDetail(detail),
    };
  }
  if (error instanceof PublishingRejectedError) {
    return { message: error.message, detail: serializableDetail(error.detail) };
  }
  if (error instanceof Error) return { message: error.message };
  return { message: String(error) };
}

function toHttpException(error: unknown, failure: ScheduleFailure = "rejected"): Error {
  // El caso ambiguo es propio de programar: el mensaje avisa de revisar el
  // proveedor antes de reintentar, para no arriesgar un post duplicado. El
  // resto de la traducción la comparte todo el que llame al puerto.
  if (failure === "ambiguous") {
    return new HttpException(AMBIGUOUS_SCHEDULE_MESSAGE, HttpStatus.SERVICE_UNAVAILABLE);
  }
  return toProviderHttpException(error);
}
