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
