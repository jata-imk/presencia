import { and, eq, inArray, sql } from "drizzle-orm";
import type { CardContent } from "@presencia/shared";
import type { DbService } from "../src/db/db.service.js";
import { brandVoices, cardVersions, chats, publicationCards } from "../src/db/schema.js";

// F12.5 «Aprender de mis ediciones»: un chat con cinco publicaciones donde el
// creator le quitó los emojis al borrador de la IA, para que Configuración ›
// Voz de marca muestre la propuesta «Casi sin emojis» y su evidencia (y el
// punto en el sub-nav). Dos de ellas además cambian «chido» por «padre»: es lo
// que «Revisar mis ediciones» debería encontrar y las reglas no.
//
// Se recrea en cada corrida, también con la cuenta ya existente: así la
// propuesta vuelve después de aceptarla o descartarla. Si ya hay un rasgo que
// hable de emojis en «Así escribes», la regla no propone nada (ya lo dijo):
// quítalo para volver a verla.
//
// Van como `published` y en el pasado: una `scheduled` sembrada necesita
// provider_ref para que el reconciliador no la marque fallida (ver
// seedCalendar), y una publicada no la mira nadie más.

type Tx = Parameters<Parameters<DbService["runWithTenant"]>[1]>[0];

const TITULO = "Voz viva: ediciones de ejemplo";

const EDICIONES: [borrador: string, publicado: string][] = [
  [
    "Lunes de productividad 🚀🔥\nTe comparto el sistema con el que planeo mi semana en 20 minutos.",
    "Lunes de productividad.\nTe comparto el sistema con el que planeo mi semana en 20 minutos.",
  ],
  [
    "Qué chido es automatizar lo aburrido 🤖✨\nEstas tres herramientas me ahorran horas.",
    "Qué padre es automatizar lo aburrido.\nEstas tres herramientas me ahorran horas.",
  ],
  ["¿Cuál usas tú? Cuéntame 👇😄", "¿Cuál usas tú? Cuéntame."],
  [
    "Está bien chido el nuevo flujo de Notion 💡\nTe dejo la plantilla.",
    "Está bien padre el nuevo flujo de Notion.\nTe dejo la plantilla.",
  ],
  [
    "Mi escritorio de trabajo en Mérida ☀️🌴\nMenos cosas, más foco.",
    "Mi escritorio de trabajo en Mérida.\nMenos cosas, más foco.",
  ],
];

const texto = (body: string): CardContent => ({
  archetype: "text_first",
  body,
  hashtags: [],
  assetIds: [],
});

export async function seedVozViva(tx: Tx, userId: string): Promise<number> {
  const previos = await tx.select({ id: chats.id }).from(chats).where(eq(chats.title, TITULO));
  const ids = previos.map((chat) => chat.id);
  if (ids.length > 0) {
    // Las cards primero: borrar el chat las dejaría huérfanas en el calendario.
    await tx.delete(publicationCards).where(inArray(publicationCards.chatId, ids));
    await tx.delete(chats).where(inArray(chats.id, ids));
  }
  // Un "No" anterior a la regla de emojis la callaría con estas mismas cards.
  await tx
    .update(brandVoices)
    .set({
      learnFromEdits: true,
      voiceProposalDecisions: sql`${brandVoices.voiceProposalDecisions} - 'emojis'`,
    })
    .where(and(eq(brandVoices.userId, userId), eq(brandVoices.isDefault, true)));

  const [chat] = await tx
    .insert(chats)
    .values({ userId, title: TITULO, lastMessageAt: new Date(Date.now() - 5 * 86_400_000) })
    .returning({ id: chats.id });
  if (!chat) throw new Error("No se pudo crear el chat de voz viva");

  for (const [i, [borrador, publicado]] of EDICIONES.entries()) {
    const publicadaEn = new Date(Date.now() - (i + 1) * 86_400_000);
    const [card] = await tx
      .insert(publicationCards)
      .values({
        userId,
        chatId: chat.id,
        archetype: "text_first",
        network: "linkedin",
        status: "published",
        content: texto(publicado),
        scheduledAt: publicadaEn,
        publishedAt: publicadaEn,
      })
      .returning({ id: publicationCards.id });
    if (!card) throw new Error("No se pudo crear la card de voz viva");
    // La versión 1 es lo que escribió la IA; la 2, la edición del creator.
    await tx.insert(cardVersions).values([
      { userId, cardId: card.id, n: 1, source: "chat", content: texto(borrador) },
      { userId, cardId: card.id, n: 2, source: "manual", content: texto(publicado) },
    ]);
  }
  return EDICIONES.length;
}
