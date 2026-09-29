import { ImageOff, ImagePlus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { assetContentUrl, type CardImageJob, type ImageAspectRatio } from "@presencia/shared";
import { GeneratingImage } from "../cards/CardMedia.js";

// Piezas comunes de las vistas previas por red (F10.5, rd-preview.jsx). Las
// vistas previas usan solo datos reales: el nombre de la cuenta conectada,
// iniciales en vez de una foto que no tenemos, y ninguna métrica — un "2,847
// me gusta" de ejemplo engañaría justo antes de publicar.

/** Quién publica: la cuenta conectada de esa red, o nadie todavía. */
export interface PreviewAccount {
  name: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    parts.length > 1 ? parts[0]![0]! + parts.at(-1)![0]! : (parts[0] ?? "").slice(0, 2);
  return letters.toUpperCase();
}

export function PreviewAvatar({
  account,
  size,
  ring = false,
}: {
  account: PreviewAccount | null;
  size: number;
  /** El aro de historias de Instagram. */
  ring?: boolean;
}) {
  const circle = (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold ${
        account ? "bg-tint-plum text-accent" : "border border-line bg-surface text-fg-muted"
      }`}
    >
      {account ? initials(account.name) : "?"}
    </span>
  );
  if (!ring) return circle;
  return (
    <span className="preview-story-ring inline-flex shrink-0 rounded-full p-[2px]">
      <span className="inline-flex rounded-full border-2 border-card">{circle}</span>
    </span>
  );
}

export function accountName(account: PreviewAccount | null): string {
  return account?.name ?? "Tu cuenta";
}

/**
 * La imagen como la vería la red: la real mientras exista, el hueco de
 * "generando" mientras el generador trabaja, o nada.
 */
export function PreviewImage({
  assetId,
  job,
  alt,
  className = "",
}: {
  assetId: string | undefined;
  job: CardImageJob | null;
  alt: string;
  className?: string;
}) {
  const [failedId, setFailedId] = useState<string | null>(null);
  if (job?.status === "generating") {
    return (
      <div className={`bg-surface p-3 ${className}`}>
        <GeneratingImage aspectRatio={job.aspectRatio} />
      </div>
    );
  }
  if (!assetId) return null;
  if (failedId === assetId) {
    return (
      <div
        className={`flex items-center gap-2 bg-surface px-3.5 py-3 text-xs text-fg-secondary ${className}`}
      >
        <ImageOff size={16} strokeWidth={1.5} aria-hidden="true" />
        No pudimos cargar la imagen. Recarga la página para intentarlo de nuevo.
      </div>
    );
  }
  return (
    <img
      src={assetContentUrl(assetId)}
      alt={alt}
      loading="lazy"
      onError={() => setFailedId(assetId)}
      className={`block h-auto w-full ${className}`}
    />
  );
}

/** El hueco que Instagram no deja publicar vacío. */
export function MissingImage({ aspect = "4:5" }: { aspect?: ImageAspectRatio }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 bg-surface px-6 text-center text-[12.5px] text-fg-secondary ${
        aspect === "1:1" ? "aspect-square" : aspect === "16:9" ? "aspect-video" : "aspect-[4/5]"
      }`}
    >
      <ImagePlus size={26} strokeWidth={1.5} className="text-fg-muted" aria-hidden="true" />
      Agrega una imagen para continuar
    </div>
  );
}

const HASHTAG = /(#[\p{L}\p{N}_]+)/u;

/** El texto del post con los hashtags en el color de enlace de la red. */
export function PostText({ text, tagClassName }: { text: string; tagClassName: string }) {
  const pieces = text.split(HASHTAG);
  return (
    <>
      {pieces.map((piece, i) =>
        i % 2 === 1 ? (
          <span key={i} className={tagClassName}>
            {piece}
          </span>
        ) : (
          piece
        ),
      )}
    </>
  );
}

/**
 * Texto cortado como lo corta la red en el feed ("… más"), expandible. Cortar
 * en el límite de palabra más cercano, no a la mitad de una.
 */
export function Truncated({
  text,
  limit,
  more,
  moreClassName,
  render,
}: {
  text: string;
  limit: number;
  more: string;
  moreClassName: string;
  render: (visible: string) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  if (expanded || text.length <= limit) return <>{render(text)}</>;
  const cut = text.lastIndexOf(" ", limit);
  const visible = text.slice(0, cut > limit * 0.6 ? cut : limit).trimEnd();
  return (
    <>
      {render(visible)}…{" "}
      <button type="button" onClick={() => setExpanded(true)} className={moreClassName}>
        {more}
      </button>
    </>
  );
}
