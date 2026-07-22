import { tool, type ToolSet } from "ai";
import {
  buildTextFirstContent,
  buildVideoScriptContent,
  buildVisualFirstContent,
  textFirstToolInputSchema,
  videoScriptToolInputSchema,
  visualFirstToolInputSchema,
} from "@presencia/shared";
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

// Tres tools, una por arquetipo (ADR-005): el modelo no llena un objeto con
// reglas condicionales, elige cuál tool llamar — esa elección es la
// inferencia del arquetipo. Cada una cierra sobre userId/chatId del request
// (mismo patrón que evita fugas de tenant que runWithTenant).
export function buildPublicationCardTools(deps: PublicationCardToolsDeps): ToolSet {
  return {
    crear_borrador_visual: tool({
      description:
        "Crea un borrador de publicación visual (imagen o carrusel) para " +
        "Instagram o Facebook. Úsala solo cuando el usuario pida explícitamente " +
        "un post listo para esas redes — no para lluvia de ideas.",
      inputSchema: visualFirstToolInputSchema,
      execute: async (input) => {
        const content = buildVisualFirstContent(input);
        const card = await deps.dbService.runWithTenant(deps.userId, (tx) =>
          deps.cardsRepository.insertCard(tx, {
            userId: deps.userId,
            chatId: deps.chatId,
            archetype: "visual_first",
            network: input.network,
            content,
          }),
        );
        deps.createdCardIds.push(card.id);
        return { cardId: card.id, network: card.network, status: card.status };
      },
    }),

    crear_borrador_video: tool({
      description:
        "Crea un borrador de guion de video para TikTok o YouTube. Úsala " +
        "solo cuando el usuario pida explícitamente un guion listo para esas " +
        "redes — no para lluvia de ideas.",
      inputSchema: videoScriptToolInputSchema,
      execute: async (input) => {
        const content = buildVideoScriptContent(input);
        const card = await deps.dbService.runWithTenant(deps.userId, (tx) =>
          deps.cardsRepository.insertCard(tx, {
            userId: deps.userId,
            chatId: deps.chatId,
            archetype: "video_script",
            network: input.network,
            content,
          }),
        );
        deps.createdCardIds.push(card.id);
        return { cardId: card.id, network: card.network, status: card.status };
      },
    }),

    crear_borrador_texto: tool({
      description:
        "Crea un borrador de publicación de texto para LinkedIn, Threads o X. " +
        "Úsala solo cuando el usuario pida explícitamente un post listo para " +
        "esas redes — no para lluvia de ideas.",
      inputSchema: textFirstToolInputSchema,
      execute: async (input) => {
        const content = buildTextFirstContent(input);
        const card = await deps.dbService.runWithTenant(deps.userId, (tx) =>
          deps.cardsRepository.insertCard(tx, {
            userId: deps.userId,
            chatId: deps.chatId,
            archetype: "text_first",
            network: input.network,
            content,
          }),
        );
        deps.createdCardIds.push(card.id);
        return { cardId: card.id, network: card.network, status: card.status };
      },
    }),
  };
}
