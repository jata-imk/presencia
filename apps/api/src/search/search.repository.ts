import { Injectable } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import type { SocialNetwork } from "@presencia/shared";
import { chats, folders, messages, publicationCards } from "../db/schema.js";
import type { Tx } from "../db/db.service.js";

// Búsqueda global (ADR-017). Ninguna query filtra por user_id: el RLS de
// la transacción es el filtro, y messages.user_id está denormalizado justo
// para que acá no haga falta un join a chats por tenant.
//
// Dos mecanismos a propósito: trigramas para nombres cortos (tolerar typos
// y coincidencias parciales importa más que el stemming) y FTS con la
// config es_unaccent para los cuerpos largos (ahí sí importa que
// "programar" encuentre "programando").
//
// `search_tsv` y `f_unaccent` viven SOLO en la migración 0014, nunca en
// schema.ts — drizzle-kit diffea contra el snapshot, así que si nunca
// entran a uno tampoco las va a querer borrar. Por eso se referencian con
// plantillas `sql` crudas y no como columnas de Drizzle.
const MESSAGES_TSV = sql`${messages}.search_tsv`;
const CARDS_TSV = sql`${publicationCards}.search_tsv`;

/** Tope por sección: el ⌘K muestra un puñado por categoría, no una lista larga. */
const LIMIT = 6;

// websearch_to_tsquery y NUNCA to_tsquery: el segundo lanza `syntax error`
// con input libre del usuario (un `&` suelto alcanza). Este acepta
// comillas, `or` y `-`, y jamás tira.
const tsquery = (q: string) => sql`websearch_to_tsquery('es_unaccent', ${q})`;

const HEADLINE_OPTS = "MaxFragments=1,MaxWords=18,MinWords=5";

export interface ChatHitRow {
  id: string;
  title: string;
  folderId: string | null;
  archivedAt: Date | null;
}
export interface FolderHitRow {
  id: string;
  name: string;
  icon: string | null;
}
export interface MessageHitRow {
  id: string;
  chatId: string;
  chatTitle: string;
  snippet: string;
  createdAt: Date;
}
export interface CardHitRow {
  id: string;
  chatId: string | null;
  network: SocialNetwork;
  snippet: string;
}

@Injectable()
export class SearchRepository {
  // `<%` (word_similarity) y no `%`: `%` compara la query contra el título
  // ENTERO, así que una query corta contra un título largo casi nunca pasa
  // el umbral. `<%` la compara contra la mejor extensión de palabras
  // dentro del target, que es exactamente el caso de uso.
  //
  // Los archivados también se buscan: son justo los más difíciles de
  // encontrar a mano. El DTO los marca para que la UI los distinga.
  searchChats(tx: Tx, q: string): Promise<ChatHitRow[]> {
    return tx
      .select({
        id: chats.id,
        title: chats.title,
        folderId: chats.folderId,
        archivedAt: chats.archivedAt,
      })
      .from(chats)
      .where(sql`${q} <% f_unaccent(${chats.title})`)
      .orderBy(
        sql`word_similarity(${q}, f_unaccent(${chats.title})) desc`,
        sql`coalesce(${chats.lastMessageAt}, ${chats.createdAt}) desc`,
      )
      .limit(LIMIT);
  }

  searchFolders(tx: Tx, q: string): Promise<FolderHitRow[]> {
    return tx
      .select({ id: folders.id, name: folders.name, icon: folders.icon })
      .from(folders)
      .where(sql`${q} <% f_unaccent(${folders.name})`)
      .orderBy(sql`word_similarity(${q}, f_unaccent(${folders.name})) desc`)
      .limit(LIMIT);
  }

  // ts_headline es caro: corre sobre las filas ya recortadas por el LIMIT,
  // nunca sobre el conjunto completo de candidatos.
  searchMessages(tx: Tx, q: string): Promise<MessageHitRow[]> {
    const text = sql`jsonb_path_query_array(${messages.parts}, '$[*] ? (@.type == "text").text')::text`;
    return tx
      .select({
        id: messages.id,
        chatId: messages.chatId,
        chatTitle: chats.title,
        snippet: sql<string>`ts_headline('es_unaccent', ${text}, ${tsquery(q)}, ${HEADLINE_OPTS})`,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .innerJoin(chats, eq(chats.id, messages.chatId))
      .where(sql`${MESSAGES_TSV} @@ ${tsquery(q)}`)
      .orderBy(sql`ts_rank_cd(${MESSAGES_TSV}, ${tsquery(q)}) desc`)
      .limit(LIMIT);
  }

  searchCards(tx: Tx, q: string): Promise<CardHitRow[]> {
    // Mismos campos que la columna generada de 0014 — los tres arquetipos
    // tienen campos distintos y el que no aplica aporta ''.
    const text = sql`
      coalesce(${publicationCards.content} ->> 'caption', '') || ' ' ||
      coalesce(${publicationCards.content} ->> 'body', '') || ' ' ||
      coalesce(${publicationCards.content} ->> 'hook', '') || ' ' ||
      coalesce(${publicationCards.content} ->> 'script', '')`;
    return tx
      .select({
        id: publicationCards.id,
        chatId: publicationCards.chatId,
        network: publicationCards.network,
        snippet: sql<string>`ts_headline('es_unaccent', ${text}, ${tsquery(q)}, ${HEADLINE_OPTS})`,
      })
      .from(publicationCards)
      .where(sql`${CARDS_TSV} @@ ${tsquery(q)}`)
      .orderBy(sql`ts_rank_cd(${CARDS_TSV}, ${tsquery(q)}) desc`)
      .limit(LIMIT);
  }
}
