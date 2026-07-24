import { tool, type ToolSet } from "ai";
import { CARD_ARCHETYPE_TOOLS } from "@presencia/shared";
import type { CardsRepository } from "./cards.repository.js";
import type { DbService } from "../db/db.service.js";

export interface PublicationCardToolsDeps {
  userId: string;
  chatId: string;
  dbService: DbService;
  cardsRepository: CardsRepository;
  // Closure compartido con streamChat: onEnd hace el backfill de messageId
  // sobre estos ids una vez que el mensaje assistant existe en DB.
  createdCardIds: string[];
}

// Una tool por entrada de CARD_ARCHETYPE_TOOLS (@presencia/shared) — nombre,
// descripción y schema viven en un solo lugar, nunca copiados a mano por
// tool (ADR-005). El modelo elige cuál tool llamar, y esa elección es la
// inferencia del arquetipo; cada tool cierra sobre userId/chatId del request
// (mismo patrón que evita fugas de tenant que runWithTenant).
export function buildPublicationCardTools(deps: PublicationCardToolsDeps): ToolSet {
  const tools: ToolSet = {};
  for (const def of CARD_ARCHETYPE_TOOLS) {
    tools[def.toolName] = tool({
      description: def.description,
      inputSchema: def.inputSchema,
      execute: async (input) => {
        const content = def.buildContent(input);
        // archetype se deriva de content.archetype dentro de insertCard —
        // nunca se pasa por separado, así es imposible que se desalineen.
        const card = await deps.dbService.runWithTenant(deps.userId, (tx) =>
          deps.cardsRepository.insertCard(tx, {
            userId: deps.userId,
            chatId: deps.chatId,
            network: input.network,
            content,
          }),
        );
        deps.createdCardIds.push(card.id);
        return { cardId: card.id, network: card.network, status: card.status };
      },
    });
  }
  return tools;
}
