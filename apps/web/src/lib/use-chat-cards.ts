import { useCallback, useEffect, useState } from "react";
import type { PublicationCardDto } from "@presencia/shared";
import { apiFetch } from "./api.js";

// El tool part de la card (persistido en messages.parts, append-only) solo
// sabe cómo nació — "Borrador" para siempre, aunque después se programe o
// publique. Este hook trae el estado VIVO desde publication_cards y
// PublicationCard hace el merge por cardId: contenido del tool part,
// estado de acá.
export function useChatCards(chatId: string) {
  const [cards, setCards] = useState<Map<string, PublicationCardDto>>(new Map());

  const refresh = useCallback(() => {
    apiFetch<PublicationCardDto[]>(`/api/chats/${chatId}/cards`)
      .then((rows) => setCards(new Map(rows.map((c) => [c.id, c]))))
      .catch(() => {
        // Silencioso a propósito (mismo criterio que use-quota.ts): sin
        // estado vivo, PublicationCard cae al tool part — el chat sigue
        // usable, solo se pierde el badge/toolbar actualizados.
      });
  }, [chatId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { cards, refresh };
}
