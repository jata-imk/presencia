// Lo que el bot dice (F11, ADR-030). Español mexicano, tuteo (regla dura #1).
// Los comandos van en inglés por convención (decisión de Jose, 2026-11-02);
// lo que el creator lee, siempre en español.

import { TELEGRAM_LINK_TTL_MINUTES } from "@presencia/shared";

/** Los comandos del menú de Telegram (`setMyCommands`), con su descripción. */
export const TELEGRAM_COMMANDS = [
  { command: "start", description: "Empezar o conectar tu cuenta de Presencia" },
  { command: "help", description: "Qué puedo hacer por ti aquí" },
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
    "/help — esta ayuda\n/disconnect — desconectar este Telegram de tu cuenta",
  disconnected:
    "Listo, desconecté este Telegram de tu cuenta. Tus chats siguen en Presencia. Para volver " +
    "a conectarte, genera un enlace en Configuración → Canales conectados.",
  notLinkedToDisconnect: "Este Telegram no está conectado a ninguna cuenta de Presencia.",
  unlinkedFromWeb:
    "Desconectaste este Telegram desde Presencia. Tus chats siguen en la web. Si fue un error, " +
    "vuelve a conectarte en Configuración → Canales conectados.",
  /** F11 PR3: el bot ya vincula, pero todavía no conversa (llega en el PR4). */
  comingSoon: (webUrl: string) =>
    `Ya estamos conectados. Muy pronto vas a poder crear contenido desde aquí; por ahora, sigue en la web:\n${webUrl}`,
};
