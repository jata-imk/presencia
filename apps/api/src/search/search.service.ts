import { Inject, Injectable } from "@nestjs/common";
import type { SearchResultsDto } from "@presencia/shared";
import { SearchRepository } from "./search.repository.js";
import { DbService } from "../db/db.service.js";

@Injectable()
export class SearchService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(SearchRepository) private readonly repo: SearchRepository,
  ) {}

  // Las cuatro queries van en la MISMA transacción con tenant: una sola
  // vuelta de RLS y una sola conexión. Se lanzan en paralelo — son
  // independientes entre sí y el driver las serializa sobre la conexión
  // igual, pero sin esperar el round-trip de cada una en secuencia.
  search(userId: string, q: string): Promise<SearchResultsDto> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const [chatRows, messageRows, folderRows, cardRows] = await Promise.all([
        this.repo.searchChats(tx, q),
        this.repo.searchMessages(tx, q),
        this.repo.searchFolders(tx, q),
        this.repo.searchCards(tx, q),
      ]);

      return {
        chats: chatRows.map((r) => ({
          id: r.id,
          title: r.title,
          folderId: r.folderId,
          archivedAt: r.archivedAt?.toISOString() ?? null,
        })),
        messages: messageRows.map((r) => ({
          id: r.id,
          chatId: r.chatId,
          chatTitle: r.chatTitle,
          snippet: r.snippet,
          createdAt: r.createdAt.toISOString(),
        })),
        folders: folderRows,
        cards: cardRows,
      };
    });
  }
}
