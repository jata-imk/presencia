import { z } from "zod";
import type { SocialNetwork } from "./publication.js";

// F6.5: búsqueda global del ⌘K (ADR-017). Full-text de Postgres sobre los
// cuerpos (mensajes, cards) y trigramas sobre los nombres (chats,
// carpetas). Los resultados vienen CATEGORIZADOS y no en una sola lista
// rankeada: cada mecanismo produce un score con su propia escala
// (ts_rank_cd vs word_similarity) y normalizarlos entre sí sería inventar
// una equivalencia que no existe. Además es lo que pide el overview §5.

/** Mínimo para que un trigrama diga algo útil. Se valida en el servidor. */
export const SEARCH_MIN_LENGTH = 2;

export const searchQuerySchema = z.object({
  q: z.string().trim().min(SEARCH_MIN_LENGTH).max(200),
});

export interface SearchChatHit {
  id: string;
  title: string;
  folderId: string | null;
  archivedAt: string | null;
}

export interface SearchMessageHit {
  id: string;
  chatId: string;
  chatTitle: string;
  /** Fragmento con `<b>` alrededor de los términos (ts_headline). */
  snippet: string;
  createdAt: string;
}

export interface SearchFolderHit {
  id: string;
  name: string;
  icon: string | null;
}

export interface SearchCardHit {
  id: string;
  chatId: string | null;
  network: SocialNetwork;
  snippet: string;
}

export interface SearchResultsDto {
  chats: SearchChatHit[];
  messages: SearchMessageHit[];
  folders: SearchFolderHit[];
  cards: SearchCardHit[];
}
