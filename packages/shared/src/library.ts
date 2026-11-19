import { z } from "zod";
import { socialNetworkSchema, type CardStatus, type SocialNetwork } from "./publication.js";

// F12: Biblioteca (`presencia-biblioteca.md`). El contrato del listado: lo que
// se puede filtrar, cómo se pagina y qué se sabe de cada imagen.
//
// Los nombres no dicen "images" a propósito: los archivos de una carpeta
// (F12.7) van a salir de aquí y no todos van a ser imágenes. Por eso cada
// item lleva `kind`, que hoy solo vale "image".

/** Cuántas imágenes trae una página si no se pide otra cosa. */
export const LIBRARY_PAGE_SIZE = 60;
export const LIBRARY_PAGE_MAX = 100;

/** "Generadas esta semana": los últimos 7 días, no la semana del calendario. */
export const LIBRARY_WEEK_DAYS = 7;

/** Cuántas miniaturas lleva cada atajo del bento. */
export const LIBRARY_SUMMARY_THUMBS = 6;

/** Lo más largo que se puede buscar. El buscador de la web corta ahí. */
export const LIBRARY_SEARCH_MAX = 200;

export const libraryOriginSchema = z.enum(["generated", "uploaded"]);
export type LibraryOrigin = z.infer<typeof libraryOriginSchema>;

/**
 * Qué pasó con la imagen:
 *
 * - `chosen`: está puesta en al menos una card.
 * - `discarded`: nació en una card y hoy no está en ninguna (una variante que
 *   no se eligió).
 * - `unused`: no nació en ninguna card (se subió directo, o su card se borró)
 *   y no está en ninguna.
 */
export const LIBRARY_STATES = ["chosen", "discarded", "unused"] as const;
export type LibraryState = (typeof LIBRARY_STATES)[number];

/** Los estados de card que el filtro ofrece (el diseño no filtra por canceladas ni fallidas). */
export const libraryCardStatusSchema = z.enum(["draft", "scheduled", "published"]);
export type LibraryCardStatus = z.infer<typeof libraryCardStatusSchema>;

export const libraryQuerySchema = z.object({
  /** Busca en lo que se pidió al generar, el texto alternativo, el nombre y el título del chat. */
  q: z.string().trim().max(LIBRARY_SEARCH_MAX).optional(),
  origin: libraryOriginSchema.optional(),
  /** La red de alguna card donde se usa o, si no se usa, la de la card donde nació. */
  network: socialNetworkSchema.optional(),
  /** Igual que `network`: el estado de la card donde se usa o donde nació. */
  cardStatus: libraryCardStatusSchema.optional(),
  /** El filtro "Elegidas / Descartadas" (las `unused` no son ninguna de las dos). */
  state: z.enum(["chosen", "discarded"]).optional(),
  /** Solo lo creado desde este instante (ISO 8601). */
  createdFrom: z.iso.datetime({ offset: true }).optional(),
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(LIBRARY_PAGE_MAX).optional(),
});
export type LibraryQuery = z.infer<typeof libraryQuerySchema>;

/** Una card vista desde Biblioteca: lo justo para decir dónde está la imagen y abrirla. */
export interface LibraryCardRef {
  id: string;
  chatId: string | null;
  network: SocialNetwork;
  status: CardStatus;
}

export interface LibraryAssetDto {
  id: string;
  /** Derivado del tipo de archivo. Hoy siempre "image". */
  kind: "image";
  origin: LibraryOrigin;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  alt: string | null;
  /** El nombre del archivo que subió el creator; null si la dibujó un generador. */
  originalName: string | null;
  createdAt: string;
  /**
   * Lo que pidió el creator al generarla. En imágenes anteriores a F12 que no
   * se pudieron recortar es la instrucción completa que se le mandó al
   * generador. Null si se subió o si es una edición (ver `instruction`).
   */
  prompt: string | null;
  /** Solo en ediciones: lo que se pidió cambiar ("más cálida"). */
  instruction: string | null;
  /** Solo en ediciones: la imagen de la que salió. */
  parentAssetId: string | null;
  /** El chat donde nació. Null si se subió a Biblioteca o si el chat se borró. */
  chat: { id: string; title: string } | null;
  /** La card donde nació. Null si se subió a Biblioteca o si la card se borró. */
  bornInCard: LibraryCardRef | null;
  /** Las cards que hoy la tienen puesta (ella o un recorte suyo). */
  uses: LibraryCardRef[];
  state: LibraryState;
}

export interface LibraryPageDto {
  items: LibraryAssetDto[];
  /** Para pedir la página siguiente; null si ya no hay más. */
  nextCursor: string | null;
}

/** Un atajo del bento: cuántas hay y las primeras, para sus miniaturas. */
export interface LibraryShortcutDto {
  count: number;
  assetIds: string[];
}

/**
 * Una versión del historial del panel de detalle: la original y las
 * ediciones que salieron de ella (o de otra edición), de la más vieja a la
 * más nueva. Los recortes de carrusel no son versiones.
 */
export interface LibraryVersionDto {
  assetId: string;
  /**
   * `original` si no salió de editar otra imagen. Una edición cuyo padre se
   * eliminó queda como primera de la lista, pero sigue siendo `edit`: dice
   * su instrucción y no se hace pasar por la original.
   */
  kind: "original" | "edit";
  /** Solo en ediciones: lo que se pidió cambiar ("Más cálida"). */
  instruction: string | null;
  width: number;
  height: number;
  createdAt: string;
}

/** Una imagen con su historial de versiones (`GET /api/library/:id`). */
export interface LibraryAssetDetailDto extends LibraryAssetDto {
  /** Vacío o de una sola: el panel no muestra la sección. */
  versions: LibraryVersionDto[];
}

/** Cuántas imágenes se pueden eliminar de una vez. */
export const LIBRARY_DELETE_MAX = 100;

export const libraryDeleteBodySchema = z.object({
  ids: z.array(z.uuid()).min(1).max(LIBRARY_DELETE_MAX),
});
export type LibraryDeleteBody = z.infer<typeof libraryDeleteBodySchema>;

/**
 * Por qué una imagen no se eliminó:
 *
 * - `scheduled`: está en una publicación programada. Sus bytes ya se le
 *   entregaron al proveedor y el post saldría con ella de todos modos (lore
 *   doc §5): se cancela la programación primero.
 * - `editing`: se está editando en este momento; la edición necesita la
 *   original hasta que termina.
 */
export type LibraryDeleteBlock =
  { id: string; reason: "scheduled"; network: SocialNetwork } | { id: string; reason: "editing" };

export interface LibraryDeleteResultDto {
  /** Las que se eliminaron (también las que ya no existían: el resultado es el mismo). */
  deleted: string[];
  /** Las que se quedaron, y por qué. */
  blocked: LibraryDeleteBlock[];
}

export interface LibrarySummaryDto {
  /** Todo lo que hay, sin filtros: 0 es el estado vacío. */
  total: number;
  /** Generadas con IA en los últimos `LIBRARY_WEEK_DAYS` días. */
  generatedThisWeek: LibraryShortcutDto;
  /** Elegidas en cards que siguen en borrador. */
  readyToPublish: LibraryShortcutDto;
  uploaded: LibraryShortcutDto;
  /** Elegidas en cards ya publicadas. */
  published: LibraryShortcutDto;
}
