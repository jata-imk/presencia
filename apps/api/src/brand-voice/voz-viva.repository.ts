import { Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  textoDePublicacion,
  type DecisionDeVoz,
  type EdicionDePublicacion,
  type ReglaDeVozViva,
} from "@presencia/shared";
import { brandVoices, cardVersions, chats, folders, publicationCards } from "../db/schema.js";
import type { Tx } from "../db/db.service.js";

// Lo que lee y escribe «Aprender de mis ediciones» (F12.5). Como el resto de
// los repositorios, sin filtrar por user_id: el RLS de la transacción es el
// filtro.

/**
 * Cuántas publicaciones se leen. Las reglas miran a lo más 6 por regla, pero
 * cada regla filtra las suyas (una sin emojis no cuenta para la de emojis):
 * con 40 sobra para que cada una llene su ventana sin leer todo el historial.
 */
const PUBLICACIONES_LEIDAS = 40;

@Injectable()
export class VozVivaRepository {
  /**
   * Las publicaciones que salieron (programadas, publicadas o que fallaron al
   * publicarse), con lo que escribió la IA y lo que quedó, de la más reciente a
   * la más vieja.
   *
   * - Lo que escribió la IA es la versión 1 de la card (`source: chat`), que
   *   se guarda la primera vez que la card cambia. Sin versión 1, la card
   *   nunca se editó: original y final son lo mismo, y cuenta igual (programar
   *   el borrador tal cual también dice algo).
   * - Solo las de chats que escriben con esta voz: sin carpeta, o en una
   *   carpeta sin voz propia o con esta. Las de una carpeta con otra voz
   *   hablan de otra voz (fase "Carpetas con contexto").
   * - Una sola por grupo multi-red: la misma edición hecha en Instagram y en
   *   Facebook es una decisión, no dos.
   */
  async ediciones(tx: Tx, brandVoiceId: string): Promise<EdicionDePublicacion[]> {
    const momento = sql<Date>`coalesce(
      (select max(${cardVersions.updatedAt}) from ${cardVersions} where ${cardVersions.cardId} = ${publicationCards.id}),
      ${publicationCards.createdAt}
    )`;
    const filas = await tx
      .select({
        groupId: publicationCards.groupId,
        final: publicationCards.content,
        original: cardVersions.content,
        momento,
      })
      .from(publicationCards)
      .innerJoin(chats, eq(chats.id, publicationCards.chatId))
      .leftJoin(folders, eq(folders.id, chats.folderId))
      .leftJoin(
        cardVersions,
        and(
          eq(cardVersions.cardId, publicationCards.id),
          eq(cardVersions.n, 1),
          eq(cardVersions.source, "chat"),
        ),
      )
      .where(
        and(
          inArray(publicationCards.status, ["scheduled", "published", "failed"]),
          or(isNull(folders.brandVoiceId), eq(folders.brandVoiceId, brandVoiceId)),
        ),
      )
      .orderBy(desc(momento))
      .limit(PUBLICACIONES_LEIDAS);

    const grupos = new Set<string>();
    const salida: EdicionDePublicacion[] = [];
    for (const fila of filas) {
      if (fila.groupId) {
        if (grupos.has(fila.groupId)) continue;
        grupos.add(fila.groupId);
      }
      const final = textoDePublicacion(fila.final);
      const original = fila.original === null ? final : textoDePublicacion(fila.original);
      if (!final || !original) continue;
      // `momento` sale de una expresión cruda: el driver la entrega como texto.
      salida.push({ original, final, momento: new Date(fila.momento).toISOString() });
    }
    return salida;
  }

  /** Prende o apaga «Aprender de mis ediciones». No mueve `updated_at`: no cambia cómo suena la voz. */
  async setAprender(tx: Tx, aprender: boolean): Promise<void> {
    await tx
      .update(brandVoices)
      .set({ learnFromEdits: aprender })
      .where(eq(brandVoices.isDefault, true));
  }

  /**
   * Anota la decisión del creator sobre una regla, sin tocar las demás. Tampoco
   * mueve `updated_at`: el rasgo aceptado llega por el PATCH de «Así escribes»,
   * que sí lo mueve.
   */
  async guardarDecision(tx: Tx, regla: ReglaDeVozViva, decision: DecisionDeVoz): Promise<void> {
    // `at` con el reloj de Postgres, el mismo que fecha las versiones contra
    // las que se compara: con el de la app, un desfase entre servidores haría
    // que una edición anterior al "No" contara como posterior.
    const at = sql`to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
    await tx
      .update(brandVoices)
      .set({
        voiceProposalDecisions: sql`${brandVoices.voiceProposalDecisions} || jsonb_build_object(${regla}::text, jsonb_build_object('decision', ${decision}::text, 'at', ${at}))`,
      })
      .where(eq(brandVoices.isDefault, true));
  }
}
