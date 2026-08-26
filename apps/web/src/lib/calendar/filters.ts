import type { CardStatus, PublicationCardDto, SocialNetwork } from "@presencia/shared";
import { cardStatusSchema, socialNetworkSchema } from "@presencia/shared";
import type { CalendarFilters } from "../cards-api.js";

// Filtros del Calendario (presencia-calendario.md §2).
//
// Viven en la URL como todo el estado del módulo: así el back del navegador
// deshace un filtro, y un pipeline filtrado por cliente se puede compartir
// por link — que es justo el caso del CM que maneja varias cuentas.
//
// Los tres grupos son los de la spec: carpeta, red y estado. Para la GRILLA
// no hay lógica de filtrado acá: el backend ya los acepta desde el primer
// avance (`listCardsQuerySchema`), se arma el query y se pide de nuevo. La
// bandeja de borradores es la excepción y se filtra en el cliente — ver
// `filterDrafts` abajo.

/**
 * Estados que el usuario puede filtrar. `canceled` no está: hoy cancelar
 * devuelve la card a `draft` (decisión de producto de F6), así que ninguna
 * fila lo tiene y ofrecerlo sería un filtro que nunca devuelve nada.
 * `failed` sí, porque es un estado real que el usuario necesita encontrar.
 */
/** El backend valida `folderId` como uuid; acá se descarta antes de pedir. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const FILTERABLE_STATUSES = ["draft", "scheduled", "published", "failed"] as const;

export const STATUS_LABEL: Record<(typeof FILTERABLE_STATUSES)[number], string> = {
  draft: "Borrador",
  scheduled: "Programado",
  published: "Publicado",
  failed: "Falló",
};

export interface ParsedFilters extends CalendarFilters {
  /** Cuántos grupos de filtro están activos — es lo que muestra el contador del botón. */
  activeCount: number;
}

/** Lee los filtros de la query string, descartando en silencio lo que no sea válido. */
export function parseFilters(params: URLSearchParams): ParsedFilters {
  const list = <T>(key: string, guard: (value: string) => value is T & string): T[] | undefined => {
    const raw = params.get(key);
    if (!raw) return undefined;
    const values = raw.split(",").filter(guard);
    return values.length > 0 ? values : undefined;
  };

  const status = list<CardStatus>(
    "estado",
    (value): value is CardStatus => cardStatusSchema.safeParse(value).success,
  );
  const network = list<SocialNetwork>(
    "red",
    (value): value is SocialNetwork => socialNetworkSchema.safeParse(value).success,
  );
  // Validada como los otros dos y no pasada tal cual: un `?carpeta=abc`
  // —link viejo, URL editada a mano, carpeta borrada— se iba derecho al
  // endpoint, volvía 400 y dejaba el banner de error puesto sin que nada en
  // la UI dijera por qué.
  const rawFolder = params.get("carpeta");
  const folderId = rawFolder && UUID.test(rawFolder) ? rawFolder : undefined;

  return {
    status,
    network,
    folderId,
    activeCount: [status, network, folderId].filter(Boolean).length,
  };
}

/** Escribe los filtros de vuelta a la query string, borrando las claves vacías. */
export function writeFilters(params: URLSearchParams, filters: CalendarFilters): URLSearchParams {
  const next = new URLSearchParams(params);
  const set = (key: string, value: string | undefined) => {
    if (value) next.set(key, value);
    else next.delete(key);
  };
  set("estado", filters.status?.join(","));
  set("red", filters.network?.join(","));
  set("carpeta", filters.folderId);
  return next;
}

/**
 * Los borradores se filtran en el cliente y no con otra llamada: no tienen
 * fecha, así que el endpoint de rango no aplica, y son pocos por definición
 * (lo que el usuario creó y todavía no programó). Filtrar por carpeta no se
 * puede acá — el DTO no trae la carpeta, solo el chat — así que ese filtro
 * se ignora para la bandeja en vez de vaciarla en falso.
 */
export function filterDrafts(
  drafts: PublicationCardDto[],
  filters: CalendarFilters,
): PublicationCardDto[] {
  return drafts.filter((card) => {
    if (filters.network && !filters.network.includes(card.network)) return false;
    if (filters.status && !filters.status.includes(card.status)) return false;
    return true;
  });
}
