import type { ReactNode } from "react";
import type { CardContent, CardStatus, SocialNetwork } from "@presencia/shared";
import { type BadgeKind } from "./Badge.js";
import { PublishedBanner, ScheduledBanner } from "./Banner.js";
import { CardHeader } from "./CardHeader.js";
import { GlowFrame } from "./GlowFrame.js";
import { TextCardBody } from "./TextCardBody.js";
import { VideoCardBody } from "./VideoCardBody.js";
import { VisualCardBody } from "./VisualCardBody.js";

// El cuerpo visual de una publicación, sin acciones. Una sola fuente de
// verdad para "cómo se ve una publicación", usada en Chat y en el modal
// "Ver" del Calendario (presencia-calendario.md §3).
//
// Recibe campos sueltos y no un PublicationCardDto a propósito: en Chat la
// card puede pintarse ANTES de que exista su fila viva — el tool part ya
// trajo el contenido pero cards-store todavía no tiene el estado. Exigir un
// DTO obligaría a ese caller a fabricar uno con campos inventados. Acá cada
// caller pasa lo que de verdad sabe.
//
// Las acciones van por `footer` en vez de estar adentro porque son distintas
// según la superficie: CardToolbar en Chat, el footer contextual del modal
// en el Calendario.

const STATUS_BORDER: Record<Exclude<CardStatus, "draft">, string> = {
  scheduled: "border-info-border",
  published: "border-success-border",
  failed: "border-error-border",
  canceled: "border-line",
};

// video_script en draft nunca tiene material listo (Presencia no genera
// video, F10/F11 pendiente) — el badge lo dice en vez de fingir "Borrador"
// genérico.
export function badgeKindFor(archetype: CardContent["archetype"], status: CardStatus): BadgeKind {
  if (archetype === "video_script" && status === "draft") return "waiting";
  return status;
}

export interface PublicationCardViewProps {
  /** Id de la fila viva. Solo se usa para el link "Ver en calendario". */
  cardId?: string;
  content: CardContent;
  network: SocialNetwork;
  status: CardStatus;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  /** Mensaje real del proveedor cuando status es "failed". */
  errorMessage?: string | null;
  footer?: ReactNode;
  /** El modal "Ver" del Calendario apaga el link "Ver en calendario": ya estás ahí. */
  showCalendarLink?: boolean;
  /**
   * Deshabilita el marco animado de borrador. El GlowFrame es un loop
   * infinito de CSS que llama la atención sobre "esto es nuevo"; dentro de
   * un modal centrado que el usuario abrió a propósito, esa llamada de
   * atención ya no aporta y compite con el contenido.
   */
  glow?: boolean;
}

export function PublicationCardView({
  cardId,
  content,
  network,
  status,
  scheduledAt,
  publishedAt,
  errorMessage,
  footer,
  showCalendarLink = true,
  glow = true,
}: PublicationCardViewProps) {
  const inner = (
    <>
      {status === "scheduled" && scheduledAt && (
        <ScheduledBanner
          scheduledAt={scheduledAt}
          cardId={cardId}
          showCalendarLink={showCalendarLink}
        />
      )}
      {status === "published" && publishedAt && <PublishedBanner publishedAt={publishedAt} />}
      <CardHeader network={network} badge={badgeKindFor(content.archetype, status)} />
      {/* El mensaje real (p.ej. "puede que sí se haya creado, revisa
          PostFast antes de reintentar") sobrevive al cierre del drawer vía
          CardsService.toDto — el fallback solo cubre filas viejas sin él. */}
      {status === "failed" && (
        <div className="border-b border-error-border bg-error-bg px-4 py-2.5 text-xs font-medium text-error">
          {errorMessage ??
            "No se pudo confirmar esta publicación con el proveedor. Puedes reintentar."}
        </div>
      )}
      {content.archetype === "visual_first" && <VisualCardBody content={content} />}
      {content.archetype === "video_script" && (
        <VideoCardBody content={content} showWaitingForMaterial={status === "draft"} />
      )}
      {content.archetype === "text_first" && <TextCardBody content={content} network={network} />}
      {footer}
    </>
  );

  if (status === "draft" && glow) {
    return (
      <GlowFrame radius={14} thickness={2}>
        {inner}
      </GlowFrame>
    );
  }
  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-card shadow-sm ${
        status === "draft" ? "border-ai-border" : STATUS_BORDER[status]
      }`}
    >
      {inner}
    </div>
  );
}
