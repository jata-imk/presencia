import { useState } from "react";
import { Plus } from "lucide-react";
import {
  NETWORK_TEXT_LIMITS,
  buildPostText,
  type CardContent,
  type SocialNetwork,
} from "@presencia/shared";
import { missingImageNote, selectedAssetId } from "../../lib/cards/card-image.js";
import { EmptyImageState, SelectedImage, type CardMediaActions } from "./CardMedia.js";
import { Hashtags } from "./Hashtags.js";

type TextFirstContent = Extract<CardContent, { archetype: "text_first" }>;

// Portado de CardText (arquetipos.jsx) — el mockup envuelve el texto en un
// mockup de post de LinkedIn con avatar/nombre/título de ejemplo ("Jose
// Tejero · Diseñador & Creador de contenido IA"). Se omite esa identidad
// falsa (no es el perfil real conectado) y el tiempo de lectura estimado
// (dato inventado); se conserva el conteo de caracteres — ese sí es
// real, calculado del contenido tal cual.

export function TextCardBody({
  content,
  network,
  media,
}: {
  content: TextFirstContent;
  network: SocialNetwork;
  /** F10: solo cuando la card se puede editar. */
  media?: CardMediaActions;
}) {
  // Mismo límite y mismo texto que la vista previa del panel (F10.5): el
  // que se publica, con hashtags incluidos (buildPostText).
  const max = NETWORK_TEXT_LIMITS[network];
  const used = buildPostText(content).length;
  const over = used > max;
  const assetId = selectedAssetId(content);

  return (
    <div className="px-4 py-3.5">
      <div className="rounded-lg border border-line bg-app px-3.5 py-3">
        <p className="text-sm leading-relaxed whitespace-pre-wrap text-fg">{content.body}</p>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-line">
          <div
            className={`h-full rounded-full ${over ? "bg-error" : "bg-success"}`}
            style={{ width: `${Math.min((used / max) * 100, 100)}%` }}
          />
        </div>
        <span className={`text-[11px] font-semibold ${over ? "text-error" : "text-fg-muted"}`}>
          {used} / {max}
        </span>
      </div>
      <Hashtags tags={content.hashtags} />
      {/* La imagen acompañante (F10) es secundaria en estas redes: va
          después del texto, y sin imagen ni card editable no ocupa nada. */}
      {assetId ? (
        <div className="mt-3">
          <SelectedImage
            assetId={assetId}
            alt={content.imagePrompt ?? "Imagen de la publicación"}
            prompt={content.imagePrompt}
            media={media}
          />
        </div>
      ) : (
        media && <OptionalImage prompt={content.imagePrompt} network={network} media={media} />
      )}
    </div>
  );
}

/**
 * Sin imagen, en una red de texto: cerrada, porque la mayoría de estos posts
 * no la llevan. Se abre sola si hay un trabajo en curso o que acaba de
 * terminar mal, para que el usuario vea en qué quedó.
 */
function OptionalImage({
  prompt,
  network,
  media,
}: {
  prompt: string | undefined;
  network: SocialNetwork;
  media: CardMediaActions;
}) {
  const [open, setOpen] = useState(false);
  const job = media.generation?.job;
  if (open || (job && job.status !== "done")) {
    return (
      <div className="mt-3">
        <EmptyImageState note={missingImageNote(network)} prompt={prompt} media={media} />
      </div>
    );
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-md border border-line bg-card px-2.5 py-1.5 text-xs font-medium text-fg-secondary"
      >
        <Plus size={13} strokeWidth={1.75} />
        Agregar imagen
      </button>
      {prompt && <span className="text-[11px] text-fg-muted">El chat sugirió una.</span>}
    </div>
  );
}
