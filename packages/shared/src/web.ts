import { z } from "zod";

// F10.10 (ADR-028): el Chat lee enlaces. Lo que comparten la API y la web
// sobre una lectura: en qué terminó. La UI pinta cada estado distinto ("pide
// sesión" no es "no existe"), y el modelo recibe el mismo estado para decirlo
// con honestidad en vez de inventar el contenido.

export const WEB_READ_STATUSES = [
  /** Se leyó y hay texto. */
  "ok",
  /** Instagram, TikTok, Facebook…, o una página que contestó 401/402/403: pide cuenta o paga. */
  "requiere_sesion",
  /** 404/410, o un dominio que no existe. */
  "no_encontrada",
  /** Se descargó pero no hay texto legible: una página armada con JavaScript, un PDF escaneado. */
  "no_legible",
  /** La política de seguridad no la deja pedir: IP privada, puerto raro, credenciales en la URL. */
  "bloqueada",
  /** No contestó a tiempo. */
  "tiempo",
  /** Pesa más de lo que se descarga (y no se puede leer a medias, como un PDF). */
  "muy_grande",
  /** Una imagen, un video, un zip: no es una página ni un PDF. */
  "tipo_no_soportado",
  /** El sitio falló (5xx, 429, la conexión se cayó). Puede servir intentar más tarde. */
  "no_disponible",
] as const;

export type WebReadStatus = (typeof WEB_READ_STATUSES)[number];

// La tool con la que el chat lee un enlace. Vive aquí, como la de memoria,
// porque la usan los dos lados: la API la declara y la web reconoce su part.
export const READ_LINK_TOOL_NAME = "leer_enlace";

/** Lecturas por turno (ADR-028): la cuarta contesta `estado: "limite"`. */
export const WEB_READS_PER_TURN = 3;

/**
 * Redes que no muestran contenido sin sesión. La API no las pide (devuelve
 * `requiere_sesion` sin hacer la petición) y la UI dice "pide iniciar sesión"
 * en vez de "pide cuenta o pago". Una sola lista para los dos lados. Corta a
 * propósito: un sitio con login a medias (LinkedIn, Medium) sí se intenta.
 */
export const SESSION_DOMAINS = [
  "instagram.com",
  "tiktok.com",
  "facebook.com",
  "fb.com",
  "fb.watch",
  "threads.net",
  "threads.com",
  "x.com",
  "twitter.com",
] as const;

/** Si un host (sin `www.` o con él, sin punto final) es de una red que pide sesión. */
export function isSessionHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return SESSION_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`));
}

export const readLinkInputSchema = z.object({
  /** La dirección tal cual la pegó el creator o la trajo una búsqueda. */
  url: z.string().trim().min(4).max(2048),
});
export type ReadLinkInput = z.infer<typeof readLinkInputSchema>;

/**
 * Lo que guarda la parte del mensaje y ve la UI: una referencia, no el texto.
 * El texto lo recibe el modelo aparte (`toModelOutput` en la API).
 */
export interface ReadLinkOutput {
  /** La fila de `web_reads`; null si ni se intentó (el tope del turno). */
  readId: string | null;
  url: string;
  /** A dónde llevaron los redirects, si llegó a leerse. */
  urlFinal: string | null;
  titulo: string | null;
  /** Host sin `www.`, para la lista de fuentes. */
  dominio: string | null;
  estado: WebReadStatus | "limite";
  /** Solo se guardó el inicio. */
  truncado: boolean;
  /** No había cuerpo: solo la descripción de la página. */
  soloDescripcion: boolean;
}

// La tool con la que el chat busca en la web (ADR-028). Igual que la de leer:
// la API la declara y la web reconoce su parte.
export const WEB_SEARCH_TOOL_NAME = "buscar_en_web";

/** Búsquedas por turno (ADR-028): la tercera contesta `estado: "limite"`. */
export const WEB_SEARCHES_PER_TURN = 2;

/** Resultados que se le dan al modelo por búsqueda. */
export const WEB_SEARCH_RESULTS = 5;

export const webSearchInputSchema = z.object({
  /** Lo que se busca, como se escribiría en un buscador: "precio del café en Mérida". */
  consulta: z.string().trim().min(3).max(200),
});
export type WebSearchInput = z.infer<typeof webSearchInputSchema>;

export interface WebSearchResult {
  titulo: string;
  url: string;
  /** Host sin `www.`. */
  dominio: string;
  /** El texto del buscador alrededor de lo que se buscó. */
  fragmento: string;
  /** La fecha que dice el buscador, tal cual ("hace 2 días", "2026-10-20"); no siempre viene. */
  fecha: string | null;
}

/** Lo que guarda la parte del mensaje: los resultados son chicos y van completos. */
export interface WebSearchOutput {
  /** La búsqueda cobrada (referencia del asiento); null si no se hizo. */
  searchId: string | null;
  consulta: string;
  estado: "ok" | "sin_resultados" | "no_disponible" | "limite";
  resultados: WebSearchResult[];
}
