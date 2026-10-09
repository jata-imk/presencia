import type { UIMessage } from "ai";
import { textOf } from "./history-compaction.js";

// Lo puro del título automático (F10.8): qué lee el modelo y cómo se limpia lo
// que responde. Aparte del servicio para probarlo sin levantar env ni base.

/** Hasta qué respuesta del asistente se intenta titular. */
export const TITLE_ATTEMPTS = 3;

// Holgado para "máximo 7 palabras, un poco más si hace falta". Es el tope de
// lo que se guarda; donde no cabe (sidebar, cabecera en móvil) la UI lo trunca
// con elipsis.
const MAX_TITLE_CHARS = 80;
/** Una palabra de enlace al final, que solo queda ahí si el corte partió la frase. */
const TRAILING_CONNECTOR =
  /\s+(?:de|del|la|las|el|los|en|para|con|por|y|o|a|al|un|una|sobre|sin|que)$/iu;
/** Cuánto de cada mensaje lee el modelo: el inicio basta para el tema. */
const MAX_CHARS_PER_MESSAGE = 600;
/** Lo que responde el modelo cuando todavía no hay tema. */
const NO_TOPIC = "VACÍO";

export const TITLE_SYSTEM = `Titulas conversaciones de Presencia, un asistente que ayuda a creators mexicanos con sus redes sociales.

Lee el inicio de la conversación y escribe un título en español mexicano que diga de qué trata:
- Trata de usar un máximo de 7 palabras, pero no te limites si hace falta un poco más para que se entienda. Escríbelo como lo pondría el propio creator en su lista de chats.
- Concreto: nunca uno que no diga nada, como "Nueva conversación".
- Sin comillas, sin emojis y sin punto final.
- Si todavía no hay un tema claro (solo un saludo o una pregunta vaga), responde exactamente ${NO_TOPIC}.

Responde solo con el título.`;

/** Las respuestas del asistente en la conversación (cuenta la que acaba de llegar). */
export function assistantTurns(conversation: UIMessage[]): number {
  return conversation.filter((m) => m.role === "assistant").length;
}

/**
 * Lo que lee el modelo: solo el texto de los primeros mensajes, sin tools ni
 * razonamiento. El JSON de una card no ayuda a titular y sí cuesta tokens.
 */
export function transcriptForTitle(conversation: UIMessage[]): string {
  return conversation
    .slice(0, 2 * TITLE_ATTEMPTS)
    .flatMap((message) => {
      const text = textOf(message).slice(0, MAX_CHARS_PER_MESSAGE);
      if (!text) return [];
      return [`${message.role === "user" ? "Creator" : "Presencia"}: ${text}`];
    })
    .join("\n\n");
}

/**
 * El título limpio, o `null` si el modelo dijo que aún no hay tema (o no dijo
 * nada). Los modelos a veces envuelven en comillas o cierran con punto aunque
 * se les pida que no: se quitan aquí en vez de confiar en el prompt.
 */
export function cleanTitle(raw: string): string | null {
  let title = (raw.split("\n").find((line) => line.trim()) ?? "").trim();
  title = title.replace(/^["'“”«»`*]+|["'“”«»`*]+$/g, "").trim();
  title = title.replace(/[.:;,!¡¿?]+$/u, "").trim();
  // Sin el cierre, la apertura queda coja: "¿Qué publicar el lunes".
  title = title.replace(/^[¡¿]+/u, "").trim();
  title = title.replace(/\s+/g, " ");
  const bare = title
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase();
  if (!title || bare === "VACIO") return null;
  if (title.length > MAX_TITLE_CHARS) {
    // Por puntos de código, no por unidades UTF-16: un emoji partido a la
    // mitad dejaría un surrogate suelto en la base.
    const chars = Array.from(title);
    const cut = chars.slice(0, MAX_TITLE_CHARS).join("");
    const space = cut.lastIndexOf(" ");
    // Si el corte cae justo al final de una palabra, la palabra se queda.
    const endsOnWord = chars[MAX_TITLE_CHARS] === " ";
    title = (endsOnWord || space <= 20 ? cut : cut.slice(0, space)).trim();
    // Lo que el corte deja colgando: "…de la nueva sucursal de", "…en Mérida:".
    let previous;
    do {
      previous = title;
      title = title
        .replace(TRAILING_CONNECTOR, "")
        .replace(/[.:;,!¡¿?]+$/u, "")
        .trim();
    } while (title !== previous);
  }
  return title.charAt(0).toUpperCase() + title.slice(1);
}
