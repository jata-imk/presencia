// Lo que el bot dice (F11, ADR-030). Español mexicano, tuteo (regla dura #1).
// Los comandos van en inglés por convención (decisión de Jose, 2026-11-02);
// lo que el creator lee, siempre en español.

import { TELEGRAM_LINK_TTL_MINUTES } from "@presencia/shared";

/** Los comandos del menú de Telegram (`setMyCommands`), con su descripción. */
export const TELEGRAM_COMMANDS = [
  { command: "start", description: "Empezar o conectar tu cuenta de Presencia" },
  { command: "help", description: "Qué puedo hacer por ti aquí" },
  { command: "new", description: "Empezar un chat nuevo (si tu Telegram no tiene temas)" },
  { command: "disconnect", description: "Desconectar este Telegram de tu cuenta" },
] as const;

const settings = (webUrl: string) => `${webUrl}/configuracion/canales`;

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
    "Puedo ayudarte a crear contenido desde aquí, igual que en la web.\n\n" +
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
  // --- La conversación (F11 PR4) ---
  /** F11 PR4: solo texto. Fotos y archivos llegan en el PR5; notas de voz, en el PR6. */
  notYet:
    "Por ahora solo leo texto por aquí. Las fotos, los archivos y las notas de voz llegan muy " +
    "pronto; mientras, mándamelos desde la web.",
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
