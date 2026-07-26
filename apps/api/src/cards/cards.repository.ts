import { Injectable } from "@nestjs/common";
import { inArray } from "drizzle-orm";
import type { CardContent, SocialNetwork } from "@presencia/shared";
import { publicationCards } from "../db/schema.js";
import type { Tx } from "../db/db.service.js";

// Todo acceso a publication_cards vive aquí (patrón de ChatRepository).
// Las queries no filtran por user_id: el RLS de la transacción es el filtro.

export type CardRow = typeof publicationCards.$inferSelect;

@Injectable()
export class CardsRepository {
  async insertCard(
    tx: Tx,
    input: {
      userId: string;
      chatId: string;
      network: SocialNetwork;
      content: CardContent;
    },
  ): Promise<CardRow> {
    // archetype se deriva de content.archetype (nunca un parámetro aparte):
    // hace imposible insertar una fila con archetype y content desalineados.
    const [card] = await tx
      .insert(publicationCards)
      .values({ ...input, archetype: input.content.archetype })
      .returning();
    if (!card) throw new Error("No se pudo crear la card de publicación");
    return card;
  }

  // La card nace durante el stream, antes de que exista el mensaje assistant
  // (que se inserta en onEnd) — backfill de message_id una vez que sí existe.
  async linkCardsToMessage(tx: Tx, cardIds: string[], messageId: string): Promise<void> {
    if (cardIds.length === 0) return;
    await tx
      .update(publicationCards)
      .set({ messageId, updatedAt: new Date() })
      .where(inArray(publicationCards.id, cardIds));
  }
}
