import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import {
  IMAGE_JOB_STALE_MS,
  LIBRARY_PAGE_SIZE,
  LIBRARY_SUMMARY_THUMBS,
  LIBRARY_WEEK_DAYS,
  cardContentSchema,
  removeImages,
  type CardContent,
  type LibraryAssetDetailDto,
  type LibraryAssetDto,
  type LibraryCardRef,
  type LibraryDeleteBlock,
  type LibraryDeleteResultDto,
  type LibraryPageDto,
  type LibraryQuery,
  type LibraryState,
  type LibrarySummaryDto,
  type LibraryVersionDto,
} from "@presencia/shared";
import { AssetsService } from "../assets/assets.service.js";
import { normalizeImage } from "../assets/image-normalize.js";
import {
  CardsRepository,
  EDITABLE_CARD_STATUSES,
  type CardRow,
} from "../cards/cards.repository.js";
import { DbService, type Tx } from "../db/db.service.js";
import {
  LibraryRepository,
  shortcutFilters,
  type LibraryCursor,
  type LibraryFilters,
  type LibraryRow,
  type LineageRow,
} from "./library.repository.js";

// Biblioteca (F12, `presencia-biblioteca.md`): el listado de todas las
// imágenes del creator, su detalle con el historial de versiones, la subida
// directa sin card y eliminar. Lo que cambia una card por gusto del creator
// (elegir una imagen, generar) sigue en CardMediaService e
// ImageGenerationService; lo único que Biblioteca le hace a una card es
// quitarle una imagen que se eliminó.

/**
 * La fecha del cursor tiene que ser lo que Postgres escribe con `::text`
 * ("2026-11-13 10:42:01.123456+00"): va directo a un `::timestamptz`, y un
 * texto cualquiera ahí sería un error de la base (un 500) en vez del 400 que
 * le toca a un cursor que no es nuestro.
 */
const PG_TIMESTAMPTZ = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:\d{2}){0,2}$/;

const cursorSchema = z.tuple([z.string().regex(PG_TIMESTAMPTZ), z.uuid()]);

/**
 * El cursor viaja opaco (base64url de `[created_at, id]`): la web lo regresa
 * tal cual y no depende de cómo se ordena por dentro.
 */
export function encodeCursor(cursor: LibraryCursor): string {
  return Buffer.from(JSON.stringify([cursor.at, cursor.id])).toString("base64url");
}

export function decodeCursor(raw: string): LibraryCursor | null {
  try {
    const parsed = cursorSchema.safeParse(
      JSON.parse(Buffer.from(raw, "base64url").toString("utf8")),
    );
    return parsed.success ? { at: parsed.data[0], id: parsed.data[1] } : null;
  } catch {
    return null;
  }
}

function stateOf(row: LibraryRow): LibraryState {
  if (row.usos.length > 0) return "chosen";
  return row.born_card_id ? "discarded" : "unused";
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function toLibraryDto(row: LibraryRow): LibraryAssetDto {
  const bornInCard: LibraryCardRef | null =
    row.born_card_id && row.born_network && row.born_status
      ? {
          id: row.born_card_id,
          chatId: row.born_chat_id,
          network: row.born_network,
          status: row.born_status,
        }
      : null;
  return {
    id: row.id,
    kind: "image",
    origin: row.source,
    mimeType: row.mime_type,
    // `bigint` llega como texto desde una consulta cruda.
    sizeBytes: Number(row.size_bytes),
    width: Number(row.metadata.width ?? 0),
    height: Number(row.metadata.height ?? 0),
    alt: textOrNull(row.metadata.alt),
    originalName: textOrNull(row.metadata.originalName),
    createdAt: row.created_iso,
    // De una edición no se muestra prompt: el suyo es plantilla nuestra, y lo
    // que pidió el creator está en `instruction`.
    prompt: row.gen_kind === "generate" ? (row.description ?? row.prompt) : null,
    instruction: row.gen_kind === "edit" ? row.instruction : null,
    parentAssetId: row.gen_kind === "edit" ? row.parent_asset_id : null,
    chat: row.chat_id ? { id: row.chat_id, title: row.chat_title ?? "" } : null,
    bornInCard,
    uses: row.usos,
    state: stateOf(row),
  };
}

export function toVersionDto(row: LineageRow): LibraryVersionDto {
  const edit = row.gen_kind === "edit";
  return {
    assetId: row.id,
    kind: edit ? "edit" : "original",
    instruction: edit ? textOrNull(row.instruction) : null,
    width: Number(row.metadata.width ?? 0),
    height: Number(row.metadata.height ?? 0),
    createdAt: row.created_iso,
  };
}

function filtersFrom(query: LibraryQuery): LibraryFilters {
  return {
    ...(query.q ? { q: query.q } : {}),
    ...(query.origin ? { origin: query.origin } : {}),
    ...(query.network ? { network: query.network } : {}),
    ...(query.cardStatus ? { cardStatus: query.cardStatus } : {}),
    ...(query.state ? { state: query.state } : {}),
    ...(query.createdFrom ? { createdFrom: new Date(query.createdFrom) } : {}),
  };
}

@Injectable()
export class LibraryService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(LibraryRepository) private readonly repo: LibraryRepository,
    @Inject(AssetsService) private readonly assets: AssetsService,
    @Inject(CardsRepository) private readonly cards: CardsRepository,
  ) {}

  async list(userId: string, query: LibraryQuery): Promise<LibraryPageDto> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (query.cursor && !cursor) {
      throw new BadRequestException("No pudimos continuar la lista. Vuelve a cargar Biblioteca.");
    }
    const limit = query.limit ?? LIBRARY_PAGE_SIZE;
    // Una de más: si llega, hay página siguiente, y se sabe sin contar.
    const rows = await this.dbService.runWithTenant(userId, (tx) =>
      this.repo.page(tx, filtersFrom(query), cursor, limit + 1),
    );
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map(toLibraryDto),
      nextCursor:
        rows.length > limit && last ? encodeCursor({ at: last.cursor_at, id: last.id }) : null,
    };
  }

  /** El bento: cuántas hay en cada atajo y sus primeras miniaturas. */
  async summary(userId: string, now: Date = new Date()): Promise<LibrarySummaryDto> {
    const row = await this.dbService.runWithTenant(userId, (tx) =>
      this.repo.summary(tx, shortcutFilters(now, LIBRARY_WEEK_DAYS), LIBRARY_SUMMARY_THUMBS),
    );
    return {
      total: row.total,
      generatedThisWeek: { count: row.generated_this_week, assetIds: row.generated_this_week_ids },
      readyToPublish: { count: row.ready_to_publish, assetIds: row.ready_to_publish_ids },
      uploaded: { count: row.uploaded, assetIds: row.uploaded_ids },
      published: { count: row.published, assetIds: row.published_ids },
    };
  }

  /**
   * El panel de detalle: la imagen y su historial de versiones. `null` si no
   * existe, no es suya (RLS) o es un recorte.
   */
  async detail(userId: string, id: string): Promise<LibraryAssetDetailDto | null> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const row = await this.repo.findOne(tx, id);
      if (!row) return null;
      const versions = await this.repo.lineage(tx, id);
      return { ...toLibraryDto(row), versions: versions.map(toVersionDto) };
    });
  }

  /**
   * Eliminar (lore doc §5, decisión 5 de F12). Cada imagen en su propia
   * transacción: una bloqueada no detiene a las demás, y dos borrados
   * múltiples a la vez no se esperan en orden cruzado.
   *
   * - En un borrador (o una que falló) se quita de la card; en un carrusel el
   *   slide se queda sin imagen. El cambio avisa por SSE como cualquier otro.
   * - En una publicada, la card no se toca: es el registro de lo que salió.
   *   Su miniatura cae al ícono porque el archivo ya no responde.
   * - En una programada no se elimina: sus bytes ya los tiene el proveedor y
   *   el post saldría con ella de todos modos.
   * - Con una edición en curso que parte de ella, tampoco: la edición la
   *   necesita hasta que termina.
   *
   * Los recortes de carrusel se van con su original. Los archivos de R2 se
   * borran después del commit, sin hacer fallar nada.
   */
  async remove(userId: string, ids: readonly string[]): Promise<LibraryDeleteResultDto> {
    const result: LibraryDeleteResultDto = { deleted: [], blocked: [] };
    const storageKeys: string[] = [];
    for (const id of new Set(ids)) {
      const outcome = await this.dbService.runWithTenant(userId, (tx) => this.removeOne(tx, id));
      if (outcome.kind === "blocked") result.blocked.push(outcome.block);
      if (outcome.kind === "deleted") {
        result.deleted.push(id);
        storageKeys.push(...outcome.storageKeys);
      }
    }
    // Los archivos, todos juntos y al final: cada imagen ya se fue de la base
    // en su transacción, y esperar a R2 entre una y otra solo alargaba la
    // respuesta (y el tiempo con locks de las que faltaban).
    await this.assets.deleteObjects(storageKeys);
    return result;
  }

  private async removeOne(
    tx: Tx,
    id: string,
  ): Promise<
    | { kind: "blocked"; block: LibraryDeleteBlock }
    | { kind: "deleted"; storageKeys: string[] }
    | { kind: "crop" }
  > {
    // Primero la imagen, bloqueada: lo que se lea después ya incluye lo que
    // un "elegir esta imagen" de otra pestaña alcanzó a escribir.
    const rows = await this.assets.lockForDelete(tx, id);
    const root = rows.find((row) => row.id === id);
    // Ya no existe o no es suya: el resultado que se pidió ya es cierto.
    if (!root) return { kind: "deleted", storageKeys: [] };
    // Un recorte no es una imagen de Biblioteca: se va con su original, no
    // solo. No se cuenta como eliminado (no lo está).
    if ((root.metadata as { croppedFrom?: string }).croppedFrom) return { kind: "crop" };
    const assetIds = rows.map((row) => row.id);

    const staleBefore = new Date(Date.now() - IMAGE_JOB_STALE_MS);
    if (await this.assets.isBeingEdited(tx, assetIds, staleBefore)) {
      return { kind: "blocked", block: { id, reason: "editing" } };
    }

    // Después las cards, bloqueadas en orden de id y leídas ya bloqueadas.
    const cards: CardRow[] = [];
    for (const cardId of await this.repo.cardsUsing(tx, assetIds)) {
      const card = await this.cards.lockById(tx, cardId);
      if (card) cards.push(card);
    }
    const scheduled = cards.find((card) => card.status === "scheduled");
    if (scheduled) {
      return { kind: "blocked", block: { id, reason: "scheduled", network: scheduled.network } };
    }

    for (const card of cards) {
      if (!EDITABLE_CARD_STATUSES.includes(card.status)) continue;
      const content = card.content as CardContent;
      const next = removeImages(content, assetIds);
      if (next === content) continue;
      const updated = await this.cards.updateContentIfEditable(
        tx,
        card.id,
        cardContentSchema.parse(next),
      );
      if (!updated) throw new Error("La card bloqueada dejó de ser editable");
    }
    await this.assets.deleteRows(tx, assetIds);
    return { kind: "deleted", storageKeys: rows.map((row) => row.storageKey) };
  }

  /**
   * "Subir" de Biblioteca: una imagen que no nace en ninguna card ni en ningún
   * chat. Mismo trato que "Subir propia" de una card (sin EXIF, orientación
   * aplicada, GIF rechazado), solo que no se pone en ningún lado: queda lista
   * para usarse. Lanza `InvalidImageError` si no es JPG, PNG o WebP.
   */
  async upload(userId: string, data: Uint8Array, originalName?: string): Promise<LibraryAssetDto> {
    const clean = (await normalizeImage(data)).data;
    const stored = await this.assets.storeImage({
      userId,
      cardId: null,
      chatId: null,
      data: clean,
      source: "uploaded",
      metadata: originalName ? { originalName } : {},
    });
    return this.dbService.runWithTenant(userId, async (tx) => {
      await this.assets.record(tx, stored);
      const row = await this.repo.findOne(tx, stored.id);
      if (!row) throw new Error("La imagen recién subida no aparece en Biblioteca");
      return toLibraryDto(row);
    });
  }
}
