import {
  LIBRARY_WEEK_DAYS,
  NETWORK_LABELS,
  type CardStatus,
  type LibraryAssetDto,
  type LibraryCardRef,
  type LibraryCardStatus,
  type LibraryOrigin,
  type LibraryQuery,
  type SocialNetwork,
  isAssetUploadMimeType,
} from "@presencia/shared";
import { imageFileProblem } from "../cards/card-image.js";

// Biblioteca (F12): lo que la pantalla decide sin tocar React ni la red. Qué
// filtros hay y qué le piden a la API, en qué grupo de fecha cae cada imagen
// y cómo se llama cada cosa. Aparte de los componentes para poder probarlo
// con fechas fijas.

export interface LibraryFilters {
  origin: LibraryOrigin | null;
  network: SocialNetwork | null;
  cardStatus: LibraryCardStatus | null;
  state: "chosen" | "discarded" | null;
  /**
   * El atajo "Generadas esta semana": desde qué instante (ISO). Se guarda el
   * instante y no un `true` para que la consulta no cambie en cada render.
   * Implica "generada con IA" aunque `origin` esté vacío.
   */
  generatedSince: string | null;
}

export const NO_FILTERS: LibraryFilters = {
  origin: null,
  network: null,
  cardStatus: null,
  state: null,
  generatedSince: null,
};

export type LibraryShortcut = "week" | "ready" | "uploads" | "published";

/**
 * Lo que aplica cada atajo del bento. Reemplaza todos los filtros, no se suma
 * a ellos: un atajo es una vista, y "Publicadas" encima de "Subidas por ti"
 * daría una tercera cosa que ninguna celda anuncia.
 *
 * "Publicadas" y "Listas para publicar" piden elegidas, igual que su contador
 * (`LibrarySummaryDto`): sin eso el atajo traería también las variantes
 * descartadas de esas cards y el número de la celda no cuadraría con lo que
 * abre.
 */
export function shortcutFilters(shortcut: LibraryShortcut, now: Date): LibraryFilters {
  switch (shortcut) {
    case "week":
      return {
        ...NO_FILTERS,
        generatedSince: new Date(
          now.getTime() - LIBRARY_WEEK_DAYS * 24 * 60 * 60 * 1000,
        ).toISOString(),
      };
    case "ready":
      return { ...NO_FILTERS, state: "chosen", cardStatus: "draft" };
    case "uploads":
      return { ...NO_FILTERS, origin: "uploaded" };
    case "published":
      return { ...NO_FILTERS, state: "chosen", cardStatus: "published" };
  }
}

/** El atajo que describe EXACTAMENTE estos filtros, si alguno. */
export function activeShortcut(filters: LibraryFilters): LibraryShortcut | null {
  const { origin, network, cardStatus, state, generatedSince } = filters;
  if (network) return null;
  if (generatedSince) return !origin && !cardStatus && !state ? "week" : null;
  if (origin === "uploaded") return !cardStatus && !state ? "uploads" : null;
  if (origin) return null;
  if (state === "chosen" && cardStatus === "draft") return "ready";
  if (state === "chosen" && cardStatus === "published") return "published";
  return null;
}

export function hasFilters(filters: LibraryFilters): boolean {
  return Object.values(filters).some((value) => value !== null);
}

/**
 * Cambia un filtro. Elegir "Subida por ti" apaga "Generadas esta semana": las
 * dos juntas no pueden dar nada, y dejar las dos píldoras encendidas sobre una
 * pantalla vacía se lee como un error.
 */
export function withFilter<K extends keyof LibraryFilters>(
  filters: LibraryFilters,
  key: K,
  value: LibraryFilters[K],
): LibraryFilters {
  const next = { ...filters, [key]: value };
  if (key === "origin" && value === "uploaded") next.generatedSince = null;
  return next;
}

/** Lo que estos filtros y esta búsqueda le piden a la API (sin cursor). */
export function toQuery(filters: LibraryFilters, search: string): LibraryQuery {
  const q = search.trim();
  return {
    ...(q && { q }),
    ...(filters.generatedSince
      ? { origin: "generated" as const, createdFrom: filters.generatedSince }
      : filters.origin && { origin: filters.origin }),
    ...(filters.network && { network: filters.network }),
    ...(filters.cardStatus && { cardStatus: filters.cardStatus }),
    ...(filters.state && { state: filters.state }),
  };
}

/** La consulta como va en la URL. Estable: sirve de llave para saber si cambió. */
export function queryString(query: LibraryQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  params.sort();
  return params.toString();
}

// ── Grupos de fecha ───────────────────────────────────────────────────────

export interface LibraryGroup {
  key: string;
  label: string;
  items: LibraryAssetDto[];
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

/** Año, mes y día de un instante, en la zona del creator. */
function dayParts(date: Date, timeZone: string): { year: number; month: number; day: number } {
  let formatter = dayFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dayFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: part("year"), month: part("month"), day: part("day") };
}

/** Cuántos días de calendario hay entre dos instantes, en la zona del creator. */
function daysAgo(date: Date, now: Date, timeZone: string): number {
  const a = dayParts(date, timeZone);
  const b = dayParts(now, timeZone);
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / dayMs,
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * "Hoy", "Esta semana" y después el mes ("Septiembre", "Diciembre 2025" si es
 * de otro año). "Esta semana" son los últimos `LIBRARY_WEEK_DAYS` días, como
 * el atajo del bento, no la semana del calendario: un lunes la semana del
 * calendario estaría vacía y el fin de semana caería en el mes.
 *
 * Respeta el orden en que llegan las imágenes (lo más nuevo primero).
 */
export function groupByDate(items: LibraryAssetDto[], timeZone: string, now: Date): LibraryGroup[] {
  const groups = new Map<string, LibraryGroup>();
  const thisYear = dayParts(now, timeZone).year;
  for (const item of items) {
    const created = new Date(item.createdAt);
    const ago = daysAgo(created, now, timeZone);
    let key: string;
    let label: string;
    if (ago <= 0) {
      key = "today";
      label = "Hoy";
    } else if (ago < LIBRARY_WEEK_DAYS) {
      key = "week";
      label = "Esta semana";
    } else {
      const { year, month } = dayParts(created, timeZone);
      key = `${String(year)}-${String(month).padStart(2, "0")}`;
      const name = capitalize(
        new Intl.DateTimeFormat("es-MX", { timeZone, month: "long" }).format(created),
      );
      label = year === thisYear ? name : `${name} ${String(year)}`;
    }
    const group = groups.get(key);
    if (group) group.items.push(item);
    else groups.set(key, { key, label, items: [item] });
  }
  return [...groups.values()];
}

/** "Hoy, 10:42", "25 sep" o "25 sep 2025": la columna Fecha de la lista. */
export function shortDate(iso: string, timeZone: string, now: Date): string {
  const date = new Date(iso);
  if (daysAgo(date, now, timeZone) <= 0) {
    const time = new Intl.DateTimeFormat("es-MX", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date);
    return `Hoy, ${time}`;
  }
  const sameYear = dayParts(date, timeZone).year === dayParts(now, timeZone).year;
  const parts = new Intl.DateTimeFormat("es-MX", {
    timeZone,
    day: "numeric",
    month: "short",
    ...(!sameYear && { year: "numeric" }),
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  // `es-MX` a veces pone punto en el mes corto ("sep.") y "de" entre las partes.
  const dayMonth = `${part("day")} ${part("month").replace(/\.$/, "")}`;
  return sameYear ? dayMonth : `${dayMonth} ${part("year")}`;
}

// ── Cómo se llama cada cosa ───────────────────────────────────────────────

/**
 * La card con la que se describe una imagen: donde está puesta hoy y, si no
 * está en ninguna, donde nació. Es la misma regla con la que la API filtra
 * por red y por estado, así que lo que dice la celda es lo que encuentra el
 * filtro.
 */
export function displayCard(asset: LibraryAssetDto): LibraryCardRef | null {
  return asset.uses[0] ?? asset.bornInCard;
}

export type LibraryStatusKind = LibraryCardStatus;

/**
 * El estado de la card como lo ofrece el filtro: una publicación que falló
 * cuenta como borrador (se puede volver a programar). Una cancelada no tiene
 * estado que mostrar.
 */
export function statusKind(status: CardStatus): LibraryStatusKind | null {
  if (status === "failed") return "draft";
  if (status === "canceled") return null;
  return status;
}

export const STATUS_LABELS: Record<LibraryStatusKind, string> = {
  draft: "Borrador",
  scheduled: "Programado",
  published: "Publicado",
};

export const ORIGIN_LABELS: Record<LibraryOrigin, string> = {
  generated: "Generada con IA",
  uploaded: "Subida por ti",
};

export function networkLabel(asset: LibraryAssetDto): string {
  const card = displayCard(asset);
  return card ? NETWORK_LABELS[card.network] : "Sin card";
}

/**
 * El renglón principal de la celda: el chat donde nació. Sin chat ni card de
 * origen, una subida es "Subida a Biblioteca". Lo demás sin chat es algo cuyo
 * chat se eliminó: una subida hecha desde una card, o una generada (la
 * generación suelta desde Biblioteca todavía no existe; llega con el modal
 * "Generar imagen", y hasta entonces "Generada en Biblioteca" sería falso).
 */
export function chatLabel(asset: LibraryAssetDto): string {
  if (asset.chat) return asset.chat.title;
  return asset.origin === "uploaded" && !asset.bornInCard
    ? "Subida a Biblioteca"
    : "Sin chat de origen";
}

/** Lo que "Copiar prompt" copia: lo que pidió el creator, o lo que pidió cambiar. */
export function copyablePrompt(asset: LibraryAssetDto): string | null {
  return asset.prompt ?? asset.instruction;
}

const NAME_MAX = 64;

/**
 * El nombre de la fila. Una subida trae el de su archivo; una generada no
 * tiene archivo con nombre, así que se llama como lo que se pidió.
 */
export function assetName(asset: LibraryAssetDto): string {
  if (asset.originalName) return asset.originalName;
  const asked = copyablePrompt(asset)?.trim();
  if (!asked) return "Imagen generada";
  return asked.length > NAME_MAX ? `${asked.slice(0, NAME_MAX - 1).trimEnd()}…` : asked;
}

/** "Elegida" / "Descartada"; nada si nunca estuvo en una card. */
export function pickLabel(asset: LibraryAssetDto): string | null {
  if (asset.state === "chosen") return "Elegida";
  if (asset.state === "discarded") return "Descartada";
  return null;
}

/** "1 imagen", "3 imágenes". */
export function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

// ── Subir ─────────────────────────────────────────────────────────────────

export const UPLOAD_TYPE_ERROR = "Solo aceptamos JPG, PNG o WebP. Prueba con otro archivo.";

/**
 * Por qué un archivo no se puede subir a Biblioteca, o `null` si sí. El de
 * tamaño es el mismo texto de "Subir propia" en una card; el de tipo es el de
 * Biblioteca (`presencia-biblioteca.md` §3), que es también el que devuelve la
 * API.
 */
export function libraryFileProblem(file: Pick<File, "type" | "size">): string | null {
  if (!isAssetUploadMimeType(file.type)) return UPLOAD_TYPE_ERROR;
  return imageFileProblem(file);
}

/**
 * Si lo que se arrastra se puede soltar. Mientras se arrastra el navegador
 * solo deja ver los tipos: se rechaza de entrada cuando NINGUNO es una imagen
 * que aceptamos. Si hay mezcla se deja soltar, y cada archivo malo lo dice en
 * su renglón.
 */
export function libraryDropVerdict(types: readonly string[]): "accept" | "type" {
  return types.length > 0 && types.every((type) => !isAssetUploadMimeType(type))
    ? "type"
    : "accept";
}

export type LibraryUploadStatus = "queued" | "uploading" | "done" | "error";

export interface LibraryUpload {
  id: string;
  name: string;
  sizeBytes: number;
  status: LibraryUploadStatus;
  /** 0 a 100, mientras sube. */
  percent: number;
  error: string | null;
}

/** El título del panel de subida: qué está pasando con el lote. */
export function uploadsTitle(uploads: Pick<LibraryUpload, "status">[]): string {
  const total = uploads.length;
  const pending = uploads.filter((u) => u.status === "queued" || u.status === "uploading").length;
  if (pending > 0) return `Subiendo ${plural(pending, "archivo", "archivos")}…`;
  const failed = uploads.filter((u) => u.status === "error").length;
  if (failed > 0) return `${plural(total, "archivo", "archivos")} · ${String(failed)} con error`;
  return total === 1 ? "1 archivo subido" : `${String(total)} archivos subidos`;
}
