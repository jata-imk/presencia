import { useMemo, useState } from "react";
import { CardToolbar } from "./cards/CardToolbar.js";
import { PublicationCardView } from "./cards/PublicationCardView.js";
import { ApiError } from "../lib/api.js";
import { cancelCardSchedule, rescheduleCard } from "../lib/cards-api.js";
import type { CardToolPart } from "../lib/chat-types.js";
import { useCardsForChat, useCardsStore } from "../stores/cards-store.js";
import { useScheduleDrawerStore } from "../stores/schedule-drawer-store.js";
import { useToastStore } from "../stores/toast-store.js";

const ARCHETYPE_LABEL: Record<string, string> = {
  "tool-crear_borrador_visual": "Post visual",
  "tool-crear_borrador_video": "Guion de video",
  "tool-crear_borrador_texto": "Post de texto",
};

// F6 PR4: ya no recibe liveCard/siblingCards/onCardsChanged por props — se
// suscribe directo a cards-store por chatId (ver stores/cards-store.ts).
// Un solo <ScheduleDrawer/> vive en ChatView, escuchando schedule-drawer-store;
// esta card solo le pide que se abra.
export function PublicationCard({ part, chatId }: { part: CardToolPart; chatId: string }) {
  const label = ARCHETYPE_LABEL[part.type] ?? "Borrador";
  const toast = useToastStore((s) => s.show);
  const openDrawer = useScheduleDrawerStore((s) => s.open);
  const cards = useCardsForChat(chatId);
  const refresh = useCardsStore((s) => s.refresh);
  const [busy, setBusy] = useState(false);

  const cardId = part.state === "output-available" ? part.output.cardId : undefined;
  const liveCard = cardId ? cards.get(cardId) : undefined;
  const siblingCards = useMemo(
    () =>
      liveCard?.groupId
        ? [...cards.values()].filter((c) => c.groupId === liveCard.groupId && c.id !== liveCard.id)
        : [],
    [cards, liveCard],
  );

  if (part.state === "input-streaming" || part.state === "input-available") {
    return (
      <div className="rounded-lg border border-line-subtle bg-card p-3 text-sm text-fg-muted">
        Generando {label.toLowerCase()}…
      </div>
    );
  }

  if (part.state === "output-error") {
    return (
      <div className="rounded-lg border border-line-subtle bg-error-bg p-3 text-sm text-error">
        No se pudo crear el borrador: {part.errorText}
      </div>
    );
  }

  if (part.state !== "output-available") return null;

  const { content, network } = part.output;

  // Mensajes persistidos antes de que la tool devolviera `content` (previo
  // a F3 PR3) traen output sin ese campo — sin este guard, truena al leer
  // content.archetype en vez de mostrar algo legible.
  if (!content) {
    return (
      <div className="rounded-lg border border-line-subtle bg-card p-3 text-sm text-fg-muted">
        Borrador creado con una versión anterior — ábrelo en tu Biblioteca para verlo.
      </div>
    );
  }

  // El tool part solo sabe "recién creado" — el badge/toolbar reales vienen
  // de liveCard (estado vivo en publication_cards, vía cards-store). Sin
  // liveCard todavía, se degrada a "draft": es el estado real al nacer la
  // card y nunca miente sobre algo peor.
  const status = liveCard?.status ?? "draft";

  function openScheduleDrawer() {
    if (!liveCard) return;
    // Batch solo al programar por primera vez (draft) con hermanas también
    // en draft — reprogramar/reintentar una card ya tocada es siempre
    // individual (cada red sigue su propio horario desde ahí en adelante).
    const isFirstSchedule = liveCard.status === "draft";
    const draftSiblings = siblingCards.filter((c) => c.status === "draft");
    openDrawer(
      isFirstSchedule && draftSiblings.length > 0 ? [liveCard, ...draftSiblings] : [liveCard],
    );
  }

  async function handleCancel() {
    if (!liveCard || liveCard.status !== "scheduled") return;
    const previous = {
      socialAccountId: liveCard.socialAccountId,
      scheduledAt: liveCard.scheduledAt,
    };
    setBusy(true);
    try {
      await cancelCardSchedule(liveCard.id);
      await refresh(chatId);
      toast({
        title: "Programación cancelada",
        description: "Vuelve a borrador.",
        onUndo:
          previous.socialAccountId && previous.scheduledAt
            ? () => {
                rescheduleCard(liveCard.id, {
                  socialAccountId: previous.socialAccountId!,
                  scheduledAt: previous.scheduledAt!,
                })
                  .then(() => refresh(chatId))
                  .catch((err: unknown) => {
                    toast({
                      title:
                        err instanceof ApiError
                          ? err.message
                          : "No se pudo deshacer — ese horario ya no es válido.",
                    });
                  });
              }
            : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <PublicationCardView
      cardId={liveCard?.id}
      content={content}
      network={network}
      status={status}
      scheduledAt={liveCard?.scheduledAt}
      publishedAt={liveCard?.publishedAt}
      errorMessage={liveCard?.errorMessage}
      footer={
        liveCard ? (
          <CardToolbar
            status={status}
            busy={busy}
            onSchedule={openScheduleDrawer}
            onCancel={() => void handleCancel()}
          />
        ) : (
          // La card ya existe (el tool part la trajo) pero cards-store
          // todavía no tiene su estado vivo — pasa un instante si el modelo
          // sigue hablando después de crearla (se refresca al terminar el
          // turno, ver chat.tsx).
          <p className="border-t border-line px-4 py-2.5 text-xs text-fg-muted">
            Cargando acciones…
          </p>
        )
      }
    />
  );
}
