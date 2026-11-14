import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import {
  LIBRARY_PAGE_SIZE,
  LIBRARY_SUMMARY_THUMBS,
  LIBRARY_WEEK_DAYS,
  type LibraryAssetDto,
  type LibraryCardRef,
  type LibraryPageDto,
  type LibraryQuery,
  type LibraryState,
  type LibrarySummaryDto,
} from "@presencia/shared";
import { AssetsService } from "../assets/assets.service.js";
import { normalizeImage } from "../assets/image-normalize.js";
import { DbService } from "../db/db.service.js";
import {
  LibraryRepository,
  shortcutFilters,
  type LibraryCursor,
  type LibraryFilters,
  type LibraryRow,
} from "./library.repository.js";

// Biblioteca (F12, `presencia-biblioteca.md`): el listado de todas las
// imágenes del creator y la subida directa, sin card. Lo que cambia una card
// (elegir una imagen, generar) sigue en CardMediaService e
// ImageGenerationService; esto solo lee y sube.

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
