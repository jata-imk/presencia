import { useMemo, useState } from "react";
import { CardToolbar } from "./cards/CardToolbar.js";
import type { CardMediaActions } from "./cards/CardMedia.js";
import { PublicationCardView } from "./cards/PublicationCardView.js";
import { ApiError } from "../lib/api.js";
import { imageFileProblem } from "../lib/cards/card-image.js";
import { cancelCardSchedule, rescheduleCard, uploadCardImage } from "../lib/cards-api.js";
import type { CardToolPart } from "../lib/chat-types.js";
import { useCard, useCardsStore, useChatCards } from "../stores/cards-store.js";
import { useScheduleDrawerStore } from "../stores/schedule-drawer-store.js";
import { useToastStore } from "../stores/toast-store.js";

const ARCHETYPE_LABEL: Record<string, string> = {
  "tool-crear_borrador_visual": "Post visual",
  "tool-crear_borrador_video": "Guion de video",
  "tool-crear_borrador_texto": "Post de texto",
};

// F6 PR4: ya no recibe liveCard/siblingCards/onCardsChanged por props — se
// suscribe directo a cards-store (ver stores/cards-store.ts). F8.6: la card
// viva sale de `byId`, así que cambia sola cuando cambia en cualquier lado.
// Un solo <ScheduleDrawer/> vive en ChatView, escuchando schedule-drawer-store;
// esta card solo le pide que se abra.
export function PublicationCard({ part, chatId }: { part: CardToolPart; chatId: string }) {
  const label = ARCHETYPE_LABEL[part.type] ?? "Borrador";
  const toast = useToastStore((s) => s.show);
  const openDrawer = useScheduleDrawerStore((s) => s.open);
  const chatCards = useChatCards(chatId);
  const applyCards = useCardsStore((s) => s.apply);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const cardId = part.state === "output-available" ? part.output.cardId : undefined;
  const liveCard = useCard(cardId);
  const siblingCards = useMemo(
    () =>
      liveCard?.groupId
        ? chatCards.filter((c) => c.groupId === liveCard.groupId && c.id !== liveCard.id)
        : [],
    [chatCards, liveCard],
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

  const { network } = part.output;
  // F10: el contenido vivo manda. El del tool part es el de nacimiento,
  // congelado en messages.parts — sin esto, la imagen que se sube o se
  // genera después nunca aparecería en la card del chat. Solo cae al del
  // tool part mientras cards-store no tiene la fila (un instante al crearla).
  const content = liveCard?.content ?? part.output.content;

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

  // Las acciones de imagen solo existen mientras la card se puede editar: una
  // card programada ya viajó al proveedor con su imagen (la API lo impide
  // igual, esto es para no ofrecer lo que va a fallar).
  const media: CardMediaActions | undefined =
    liveCard && (status === "draft" || status === "failed") && content.archetype !== "video_script"
      ? { upload: (file) => void handleUpload(liveCard.id, file), uploading }
      : undefined;

  async function handleUpload(cardId: string, file: File) {
    const problem = imageFileProblem(file);
    if (problem) {
      toast({ title: "No se pudo subir la imagen", description: problem });
      return;
    }
    setUploading(true);
    try {
      applyCards(await uploadCardImage(cardId, file));
    } catch (err) {
      toast({
        title: "No se pudo subir la imagen",
        description: err instanceof ApiError ? err.message : "Inténtalo de nuevo.",
      });
    } finally {
      setUploading(false);
    }
  }

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
      applyCards(await cancelCardSchedule(liveCard.id));
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
                  .then(applyCards)
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
      media={media}
      footer={
        liveCard ? (
          <CardToolbar
            status={status}
            busy={busy}
            postUrl={liveCard.postUrl}
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
