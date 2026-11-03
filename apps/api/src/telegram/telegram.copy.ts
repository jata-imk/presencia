// Lo que el bot dice (F11, ADR-030). Español mexicano, tuteo (regla dura #1).
// Los comandos van en inglés por convención (decisión de Jose, 2026-11-02);
// lo que el creator lee, siempre en español.

import { ATTACHMENT_TEXT_EXTENSIONS, TELEGRAM_LINK_TTL_MINUTES } from "@presencia/shared";

/** Los comandos del menú de Telegram (`setMyCommands`), con su descripción. */
export const TELEGRAM_COMMANDS = [
  { command: "start", description: "Empezar o conectar tu cuenta de Presencia" },
  { command: "help", description: "Qué puedo hacer por ti aquí" },
  { command: "new", description: "Empezar un chat nuevo (si tu Telegram no tiene temas)" },
  { command: "disconnect", description: "Desconectar este Telegram de tu cuenta" },
] as const;

const settings = (webUrl: string) => `${webUrl}/configuracion/canales`;

/**
 * Lo que entra por aquí (F11 PR5), con las extensiones de texto de
 * `packages/shared`: si se agrega una, el bot la anuncia sola. Las imágenes
 * mandadas como archivo también entran ("imágenes").
 */
const FORMATS = (() => {
  const ext = [...ATTACHMENT_TEXT_EXTENSIONS];
  const list = ext.length > 1 ? `${ext.slice(0, -1).join(", ")} y ${ext.at(-1)!}` : ext.join("");
  return `fotos e imágenes, PDF o archivos ${list}`;
})();

export const copy = {
  notLinked: (webUrl: string) =>
    "Hola, soy Presencia. Para trabajar conmigo desde aquí, conecta tu cuenta en " +
    `Configuración → Canales conectados:\n${settings(webUrl)}`,
  linked:
    "¡Listo! Tu cuenta de Presencia quedó conectada. Cada tema de este chat es un chat de " +
    "Presencia: lo que hablemos aquí también lo ves en la web.",
  alreadyLinked:
    "Este Telegram ya está conectado a tu cuenta de Presencia. Escribe /help para ver qué puedo hacer.",
  invalid: (webUrl: string) =>
    `Ese enlace ya no sirve. Genera uno nuevo en Configuración → Canales conectados:\n${settings(webUrl)}`,
  expired: (webUrl: string) =>
    `Ese enlace ya venció (dura ${String(TELEGRAM_LINK_TTL_MINUTES)} minutos). Genera uno nuevo en Configuración → Canales ` +
    `conectados:\n${settings(webUrl)}`,
  taken:
    "Este Telegram ya está conectado a otra cuenta de Presencia. Escribe /disconnect para " +
    "desconectarlo y vuelve a abrir el enlace.",
  help:
    "Puedo ayudarte a crear contenido desde aquí, igual que en la web. Mándame texto, " +
    `${FORMATS} (sueltos o en álbum).\n\n` +
    "Cada tema de este chat es un chat de Presencia: abre uno nuevo para empezar otra idea.\n\n" +
    "Si tu Telegram no muestra temas, todo va al mismo chat: escribe /new para empezar otro.\n\n" +
    "/help — esta ayuda\n/new — empezar un chat nuevo\n/disconnect — desconectar este Telegram de tu cuenta",
  disconnected:
    "Listo, desconecté este Telegram de tu cuenta. Tus chats siguen en Presencia. Para volver " +
    "a conectarte, genera un enlace en Configuración → Canales conectados.",
  notLinkedToDisconnect: "Este Telegram no está conectado a ninguna cuenta de Presencia.",
  unlinkedFromWeb:
    "Desconectaste este Telegram desde Presencia. Tus chats siguen en la web. Si fue un error, " +
    "vuelve a conectarte en Configuración → Canales conectados.",
  // --- Los adjuntos (F11 PR5) ---
  /** Las notas de voz y los audios llegan en el PR6. */
  voiceSoon:
    "Las notas de voz y los audios llegan muy pronto. Mientras, escríbeme o mándame fotos y archivos.",
  audioSoon: "los audios llegan muy pronto.",
  unsupported: `Eso todavía no lo leo por aquí. Mándame texto, ${FORMATS}.`,
  readingFiles: "Leyendo tus archivos…",
  /**
   * Un archivo que no entró: el resto del mensaje sigue. Sin nombre (un video
   * del carrete), lo que es, sin comillas: "No pude leer un video".
   */
  skipped: (filename: string | null, label: string | null, reason: string) =>
    `No pude leer ${filename ? `«${filename}»` : (label ?? "un archivo")}: ${reason}`,
  unsupportedFile: `por aquí entran ${FORMATS}.`,
  heicAsFile: "es una foto HEIC mandada como archivo. Mándala como foto y la leo.",
  fileTooBig: "pesa más de 20 MB y Telegram no me deja bajarlo. Súbelo desde la web.",
  fileFailed: "algo falló al bajarlo. Vuelve a mandarlo.",
  tooMuchToRead:
    "Esos archivos son demasiado largos para leerlos juntos. Mándamelos en mensajes separados.",
  stoppedBeforeStart: "Lo detuviste antes de que empezara. Mándamelo otra vez cuando quieras.",
  // --- La conversación (F11 PR4) ---
  newChat: "Listo: lo que escribas ahora empieza un chat nuevo.",
  newInTopic:
    "Aquí cada tema es un chat. Para empezar otro, abre un tema nuevo (o escribe fuera de los temas).",
  queueFull: "Voy con tus mensajes anteriores. Espera a que termine y me cuentas lo siguiente.",
  noQuota: (webUrl: string) =>
    `Se acabó tu cuota de este periodo, así que no puedo responder. Revisa tu plan:\n${webUrl}/configuracion/plan`,
  busy: "Estoy terminando otra respuesta en este chat. Escríbeme en cuanto acabe.",
  turnFailed: "Algo salió mal generando la respuesta. Inténtalo de nuevo.",
  cantRetry: "Esa respuesta ya no se puede reintentar: el chat siguió después.",
  chatGone: "Ese chat ya no existe en Presencia. Escribe algo para empezar uno nuevo.",
  thinking: "Pensando…",
  stoppedNote: "Detuviste la respuesta.",
  emptyReply: "No me salió una respuesta. Inténtalo de nuevo.",
  retryButton: "Reintentar",
  openButton: "Abrir en Presencia",
  openInWeb: (url: string) => `Ábrelo en Presencia: ${url}`,
  sourcesTitle: "Fuentes",
  cardTitle: (red: string) => `Borrador para ${red}`,
};
