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
