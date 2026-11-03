import type { Message } from "grammy/types";

// Qué mensajes son del creator y cuáles son avisos de servicio (F11, ADR-030).
//
// Telegram manda como `message` también lo que no escribió nadie: "tema
// creado", "mensaje fijado", "fondo cambiado"… En iOS, escribir fuera de un
// tema crea uno implícito y llegan DOS updates: el aviso `forum_topic_created`
// y el mensaje. Contestar a los dos duplicaba la respuesta (prueba en vivo,
// 2026-11-02). Lista de lo que sí se contesta, no de lo que se ignora: un aviso
// de servicio nuevo del Bot API queda en silencio, no recibe respuesta.

const CONTENT_FIELDS = [
  "text",
  "photo",
  "document",
  "voice",
  "audio",
  "video",
  "video_note",
  "animation",
  "sticker",
  "location",
  "venue",
  "contact",
  "poll",
  "dice",
  "story",
  "paid_media",
  "checklist",
] as const satisfies readonly (keyof Message)[];

/** El mensaje lo mandó el creator (texto, archivo, ubicación…), no es un aviso de servicio. */
export function isUserContent(message: Message): boolean {
  return CONTENT_FIELDS.some((field) => message[field] !== undefined);
}
