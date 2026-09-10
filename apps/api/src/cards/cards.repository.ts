import { Injectable } from "@nestjs/common";
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
} from "drizzle-orm";
import type { CardContent, CardStatus, SocialNetwork } from "@presencia/shared";
import { chats, publicationCards } from "../db/schema.js";
import type { Tx } from "../db/db.service.js";

// Todo acceso a publication_cards vive aquí (patrón de ChatRepository).
// Las queries no filtran por user_id: el RLS de la transacción es el filtro.

export type CardRow = typeof publicationCards.$inferSelect;

export interface MarkSchedulingInput {
  socialAccountId: string;
  scheduledAt: Date;
}

/** Filtros del popover del Calendario. Todos opcionales; ausente = sin filtrar. */
export interface CalendarFilters {
  status?: CardStatus[];
  network?: SocialNetwork[];
  folderId?: string;
}

@Injectable()
export class CardsRepository {
  async insertCard(
    tx: Tx,
    input: {
      userId: string;
      chatId: string;
      network: SocialNetwork;
      content: CardContent;
      groupId?: string | null;
    },
  ): Promise<CardRow> {
    // archetype se deriva de content.archetype (nunca un parámetro aparte):
    // hace imposible insertar una fila con archetype y content desalineados.
    const [card] = await tx
      .insert(publicationCards)
      .values({ ...input, archetype: input.content.archetype })
      .returning();
    if (!card) throw new Error("No se pudo crear la card de publicación");
    return card;
  }

  // La card nace durante el stream, antes de que exista el mensaje assistant
  // (que se inserta en onEnd) — backfill de message_id una vez que sí existe.
  async linkCardsToMessage(tx: Tx, cardIds: string[], messageId: string): Promise<void> {
    if (cardIds.length === 0) return;
    await tx
      .update(publicationCards)
      .set({ messageId, updatedAt: new Date() })
      .where(inArray(publicationCards.id, cardIds));
  }

  // Se llama ANTES de borrar el mensaje (FK message_id es "set null", no
  // cascade): sin este paso las cards quedarían huérfanas en vez de
  // borradas al reintentar un turno (decisión de producto, F3 PR3).
  async deleteCardsByMessageId(tx: Tx, messageId: string): Promise<void> {
    await tx.delete(publicationCards).where(eq(publicationCards.messageId, messageId));
  }

  // ── F6: ciclo de vida (programar/reprogramar/cancelar/reconciliar) ────

  async findById(tx: Tx, id: string): Promise<CardRow | undefined> {
    const [row] = await tx.select().from(publicationCards).where(eq(publicationCards.id, id));
    return row;
  }

  async listByChat(tx: Tx, chatId: string): Promise<CardRow[]> {
    return tx
      .select()
      .from(publicationCards)
      .where(eq(publicationCards.chatId, chatId))
      .orderBy(publicationCards.createdAt);
  }

  /**
   * Usado por ChatService.deleteChat (F6 PR8): borrar un chat con cards
   * "scheduled" cancelaría un post real en postfa.st sin que nadie lo haya
   * pedido — se rechaza el borrado en vez de cancelar en silencio.
   */
  async hasScheduledCards(tx: Tx, chatId: string): Promise<boolean> {
    const [row] = await tx
      .select({ id: publicationCards.id })
      .from(publicationCards)
      .where(and(eq(publicationCards.chatId, chatId), eq(publicationCards.status, "scheduled")))
      .limit(1);
    return row !== undefined;
  }

  /**
   * Mismo criterio que hasScheduledCards pero por cuenta conectada — usado
   * por ChannelsService.deleteAccount (borrado permanente, F6 follow-up):
   * borrar la cuenta es seguro para el schema (social_account_id es "set
   * null"), pero borrarla con una card "scheduled" apuntándole dejaría un
   * compromiso real en postfa.st sin cuenta local que lo referencie.
   */
  async hasScheduledCardsForAccount(tx: Tx, socialAccountId: string): Promise<boolean> {
    const [row] = await tx
      .select({ id: publicationCards.id })
      .from(publicationCards)
      .where(
        and(
          eq(publicationCards.socialAccountId, socialAccountId),
          eq(publicationCards.status, "scheduled"),
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  /**
   * Primer paso de programar/reprogramar: fija destino y horario, deja
   * `provider_ref` en null a propósito — CardsService lo llena en una
   * segunda transacción SOLO si la llamada al proveedor tuvo éxito
   * (invariante DB↔PostFast: nunca queda "scheduled" con una llamada que
   * en realidad falló a medio camino).
   */
  async markScheduling(tx: Tx, id: string, input: MarkSchedulingInput): Promise<CardRow> {
    const [row] = await tx
      .update(publicationCards)
      .set({
        status: "scheduled",
        socialAccountId: input.socialAccountId,
        scheduledAt: input.scheduledAt,
        providerRef: null,
        errorDetail: null,
        updatedAt: new Date(),
      })
      .where(eq(publicationCards.id, id))
      .returning();
    if (!row) throw new Error("No se pudo programar la publicación");
    return row;
  }

  /**
   * Reprogramar una card que YA está programada y conserva su post del otro
   * lado: solo cambia la hora.
   *
   * A diferencia de `markScheduling`, NO pone `provider_ref` en null. Ese
   * null existe para el caso "puede que la llamada al proveedor no llegue a
   * crear nada"; acá el post ya existe y el proveedor lo va a mover (o a
   * recrearlo devolviendo otra ref). Anularlo abriría, sin necesidad, la
   * misma ventana de card huérfana que el puerto ahora permite evitar
   * (ver PublishingProvider.reschedule y ADR-009, addendum de F7.5 PR3).
   */
  async markRescheduled(
    tx: Tx,
    id: string,
    input: { scheduledAt: Date },
  ): Promise<CardRow | undefined> {
    const [row] = await tx
      .update(publicationCards)
      .set({
        scheduledAt: input.scheduledAt,
        errorDetail: null,
        updatedAt: new Date(),
      })
      // Guardia `status='scheduled'`, misma familia que
      // attachProviderRefIfScheduled y por el mismo motivo. Este UPDATE
      // corre dos veces: al empezar a reprogramar y, si el proveedor
      // rechaza, para devolver la card a su horario viejo. En ese segundo
      // caso el usuario pudo haberle dado Cancelar mientras la llamada
      // seguía en vuelo — sin la guardia, la restauración RESUCITARÍA como
      // "scheduled" una card que él acaba de mandar a draft, y encima sin
      // cuenta ni provider_ref (cancelSchedule los limpia).
      //
      // Tampoco se escribe `status: "scheduled"`: la guardia ya garantiza
      // que lo era. Así este método no puede cambiar de estado a nadie,
      // solo mover la hora.
      .where(and(eq(publicationCards.id, id), eq(publicationCards.status, "scheduled")))
      .returning();
    return row;
  }

  async attachProviderRef(tx: Tx, id: string, providerRef: string): Promise<CardRow> {
    const [row] = await tx
      .update(publicationCards)
      .set({ providerRef, updatedAt: new Date() })
      .where(eq(publicationCards.id, id))
      .returning();
    if (!row) throw new Error("No se pudo confirmar la programación de la publicación");
    return row;
  }

  /**
   * Variante de attachProviderRef con guardia `status = 'scheduled'`
   * (code review 2026-08-20 — race real): entre que schedule() marca
   * "scheduled" y la llamada de red al proveedor resuelve, cancelSchedule()
   * puede correr sobre la misma card mientras `provider_ref` sigue null —
   * su guard `if (card.providerRef)` no ve nada que cancelar del lado del
   * proveedor y la deja en "draft". Si attachProviderRef corriera sin
   * condición después, estamparía un providerRef real sobre esa fila
   * "draft" — un post de verdad en PostFast sin ninguna card "scheduled"
   * que lo referencie (reconcileDueCards tampoco lo encuentra, solo mira
   * status='scheduled'). Con la guardia, si la fila ya no está
   * "scheduled", el UPDATE no afecta ninguna fila y el caller (ver
   * CardsService.schedule) sabe que debe cancelar el post huérfano en vez
   * de asumir que se programó.
   */
  async attachProviderRefIfScheduled(
    tx: Tx,
    id: string,
    providerRef: string,
  ): Promise<CardRow | undefined> {
    const [row] = await tx
      .update(publicationCards)
      .set({ providerRef, updatedAt: new Date() })
      .where(and(eq(publicationCards.id, id), eq(publicationCards.status, "scheduled")))
      .returning();
    return row;
  }

  /** El schedule() al proveedor falló tras marcar "scheduled" — vuelve a draft sin destino. */
  async resetToDraft(tx: Tx, id: string, errorDetail: unknown): Promise<CardRow> {
    const [row] = await tx
      .update(publicationCards)
      .set({
        status: "draft",
        socialAccountId: null,
        scheduledAt: null,
        providerRef: null,
        errorDetail,
        updatedAt: new Date(),
      })
      .where(eq(publicationCards.id, id))
      .returning();
    if (!row) throw new Error("No se pudo revertir la publicación a borrador");
    return row;
  }

  /** Cancelar programación (decisión de producto, presencia-chat.md): vuelve a draft, no a "canceled". */
  async cancelSchedule(tx: Tx, id: string): Promise<CardRow> {
    const [row] = await tx
      .update(publicationCards)
      .set({
        status: "draft",
        socialAccountId: null,
        scheduledAt: null,
        providerRef: null,
        errorDetail: null,
        updatedAt: new Date(),
      })
      .where(eq(publicationCards.id, id))
      .returning();
    if (!row) throw new Error("No se pudo cancelar la programación");
    return row;
  }

  async markPublished(
    tx: Tx,
    id: string,
    publishedAt: Date,
    postUrl: string | null,
  ): Promise<CardRow> {
    const [row] = await tx
      .update(publicationCards)
      .set({ status: "published", publishedAt, postUrl, errorDetail: null, updatedAt: new Date() })
      .where(eq(publicationCards.id, id))
      .returning();
    if (!row) throw new Error("No se pudo marcar la publicación como publicada");
    return row;
  }

  /** Fallo terminal (proveedor confirmó FAILED, o nunca confirmó nada) — se queda visible, no vuelve a draft solo. */
  async markFailed(tx: Tx, id: string, errorDetail: unknown): Promise<CardRow> {
    const [row] = await tx
      .update(publicationCards)
      .set({ status: "failed", errorDetail, updatedAt: new Date() })
      .where(eq(publicationCards.id, id))
      .returning();
    if (!row) throw new Error("No se pudo marcar la publicación como fallida");
    return row;
  }

  /**
   * Cierra las huérfanas de un pase de reconciliación: varias cards con el
   * MISMO errorDetail en un solo UPDATE (code review 2026-08-20) en vez de una
   * transacción por card.
   *
   * La guardia es anti-carrera (misma familia que
   * `attachProviderRefIfScheduled`) y sigue una regla que vale para las tres
   * escrituras del barrido: **repetir la condición con la que se leyó la fila**.
   * El pase LEE en una transacción y ESCRIBE en otra, y desde F8 corre cada
   * minuto sin depender de que nadie mire; todo lo que la fila dejó de cumplir
   * entremedio significa que ya no es el caso que se decidió atender.
   *
   * Acá eso es `scheduled` + sin `provider_ref` + `updated_at` viejo. Sin el
   * `updated_at`, un usuario que cancela y reprograma en el mismo minuto vuelve
   * a dejar la card `scheduled` sin ref pero recién tocada, la guardia pasaría,
   * y el pase mataría un intento que está justo en vuelo — y al contestar el
   * proveedor, `persistProviderRef` cancelaría un post creado sin problema.
   */
  async markOrphansFailed(
    tx: Tx,
    ids: string[],
    cutoff: Date,
    errorDetail: unknown,
  ): Promise<void> {
    if (ids.length === 0) return;
    await tx
      .update(publicationCards)
      .set({ status: "failed", errorDetail, updatedAt: new Date() })
      .where(
        and(
          inArray(publicationCards.id, ids),
          eq(publicationCards.status, "scheduled"),
          isNull(publicationCards.providerRef),
          lt(publicationCards.updatedAt, cutoff),
        ),
      );
  }

  /**
   * Cierra las vencidas que el proveedor no confirmó. Misma regla: la guardia
   * repite la condición del read — `scheduled`, el par `(id, provider_ref)`, y
   * `scheduled_at` todavía vencida.
   *
   * El par por sí solo NO alcanza, y es un detalle que se nos pasó primero:
   * `markRescheduled` conserva el `provider_ref` a propósito, y el `PATCH` de
   * Upload-Post devuelve el MISMO `job_id`. O sea que una card reprogramada a
   * la semana que viene puede seguir teniendo el par idéntico — lo único que
   * cambió es su hora. Sin el `scheduled_at`, el pase la marcaría fallida por
   * lo que el proveedor dijo del pase anterior.
   */
  async markDueFailed(
    tx: Tx,
    cards: readonly { id: string; providerRef: string }[],
    cutoff: Date,
    errorDetail: unknown,
  ): Promise<void> {
    if (cards.length === 0) return;
    await tx
      .update(publicationCards)
      .set({ status: "failed", errorDetail, updatedAt: new Date() })
      .where(
        and(
          eq(publicationCards.status, "scheduled"),
          lt(publicationCards.scheduledAt, cutoff),
          matchesAnyRef(cards),
        ),
      );
  }

  /**
   * Marca publicada solo si la card sigue siendo la que se consultó: misma
   * guardia que `markDueFailed` y por la misma carrera, agravada porque acá el
   * pase habla con el proveedor entremedio (hasta 30s). Sin ella, una card
   * cancelada durante esa llamada se le reportaría al usuario como publicada, y
   * una reprogramada perdería su horario nuevo — incluso conservando la misma
   * ref, que es lo que pasa con el `PATCH` de Upload-Post; por eso la guardia
   * incluye `scheduled_at` y no solo el par.
   *
   * Devuelve `undefined` cuando la card se movió — no es un error, es el caso
   * que la guardia existe para detectar.
   */
  async markPublishedIfStillScheduled(
    tx: Tx,
    input: {
      id: string;
      providerRef: string;
      cutoff: Date;
      publishedAt: Date;
      postUrl: string | null;
    },
  ): Promise<CardRow | undefined> {
    const [row] = await tx
      .update(publicationCards)
      .set({
        status: "published",
        publishedAt: input.publishedAt,
        postUrl: input.postUrl,
        errorDetail: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(publicationCards.id, input.id),
          eq(publicationCards.providerRef, input.providerRef),
          eq(publicationCards.status, "scheduled"),
          lt(publicationCards.scheduledAt, input.cutoff),
        ),
      )
      .returning();
    return row;
  }

  /**
   * Las dos ramas de la reconciliación en UNA query (F8): huérfanas —
   * `scheduled` sin `provider_ref` y sin tocarse desde antes del cutoff — y
   * debidas — `scheduled` con `provider_ref` cuya hora ya pasó.
   *
   * Sirve para los dos caminos sin cambiar de query: dentro de
   * `runWithTenant` el RLS la acota al usuario del momento, y dentro de
   * `runWorkerScan` la policy `worker_scan` la deja ver, de todos los tenants,
   * las cards `scheduled` que el pase puede llegar a necesitar — las huérfanas
   * (sin `provider_ref`, aunque su fecha sea futura) y las que ya vencieron
   * (migraciones 0017 y 0019). Las programadas a futuro con `provider_ref` no
   * las ve, y tampoco las pide. El service separa las dos categorías al
   * agrupar por usuario, mirando el `provider_ref`.
   */
  async listReconcilable(tx: Tx, cutoff: Date): Promise<CardRow[]> {
    return tx
      .select()
      .from(publicationCards)
      .where(
        and(
          eq(publicationCards.status, "scheduled"),
          or(
            and(isNull(publicationCards.providerRef), lt(publicationCards.updatedAt, cutoff)),
            and(isNotNull(publicationCards.providerRef), lt(publicationCards.scheduledAt, cutoff)),
          ),
        ),
      );
  }

  async findConflicts(tx: Tx, from: Date, to: Date): Promise<CardRow[]> {
    return tx
      .select()
      .from(publicationCards)
      .where(
        and(
          eq(publicationCards.status, "scheduled"),
          gte(publicationCards.scheduledAt, from),
          lte(publicationCards.scheduledAt, to),
        ),
      );
  }

  /**
   * F7: todo lo que cae en el rango visible del Calendario, en cualquier
   * estado. Hermana de findConflicts, no un reemplazo: aquella responde
   * "¿choca con algo ya programado?" (solo `scheduled`) y la consume el
   * ScheduleDrawer; esta responde "¿qué hay en pantalla?".
   *
   * Pega contra el índice `cards_calendar (user_id, scheduled_at)`. El
   * user_id no aparece en el WHERE porque lo pone el RLS, pero sigue siendo
   * la primera columna del índice: el planner lo usa igual.
   *
   * Sin paginación a propósito: el rango es un mes (o una semana, o un día),
   * acotado por construcción. Si algún día un mes trae miles de cards, el
   * corte natural es por rango más chico, no por offset.
   */
  async listByRange(
    tx: Tx,
    from: Date,
    to: Date,
    filters: CalendarFilters = {},
  ): Promise<CardRow[]> {
    const conditions = [
      gte(publicationCards.scheduledAt, from),
      lte(publicationCards.scheduledAt, to),
    ];
    if (filters.status?.length) {
      conditions.push(inArray(publicationCards.status, filters.status));
    }
    if (filters.network?.length) {
      conditions.push(inArray(publicationCards.network, filters.network));
    }

    const base = tx.select(getTableColumns(publicationCards)).from(publicationCards).$dynamic();
    // La carpeta vive en el chat que originó la card, no en la card. El join
    // es INNER a propósito: una card huérfana (chat eliminado, chat_id null)
    // no tiene carpeta de la cual derivar, así que no matchea ningún filtro
    // por carpeta — desaparece del listado filtrado, y eso es correcto.
    const filtered = filters.folderId
      ? base
          .innerJoin(chats, eq(publicationCards.chatId, chats.id))
          .where(and(...conditions, eq(chats.folderId, filters.folderId)))
      : base.where(and(...conditions));

    // Desempate por createdAt: las N redes de un grupo multi-red comparten
    // scheduled_at exacto, y sin segundo criterio Postgres puede devolverlas
    // en orden distinto entre requests — el grupo "bailaría" al refrescar.
    return filtered.orderBy(asc(publicationCards.scheduledAt), asc(publicationCards.createdAt));
  }

  /**
   * F7: la bandeja de borradores del panel izquierdo — cards creadas en Chat
   * que todavía no tienen fecha. `scheduled_at IS NULL` además del estado:
   * cancelSchedule() devuelve la card a `draft` pero limpia scheduled_at, así
   * que la condición es redundante hoy; se deja explícita porque el panel
   * promete "sin fecha programada" y esa promesa no debe depender de que
   * ningún otro camino olvide limpiar la columna.
   */
  async listDrafts(tx: Tx): Promise<CardRow[]> {
    return tx
      .select()
      .from(publicationCards)
      .where(and(eq(publicationCards.status, "draft"), isNull(publicationCards.scheduledAt)))
      .orderBy(desc(publicationCards.createdAt));
  }
}

/** `(id = a AND provider_ref = x) OR (id = b AND provider_ref = y) OR ...` */
function matchesAnyRef(cards: readonly { id: string; providerRef: string }[]) {
  return or(
    ...cards.map((card) =>
      and(eq(publicationCards.id, card.id), eq(publicationCards.providerRef, card.providerRef)),
    ),
  );
}
