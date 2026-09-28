import type { CardContent, SocialNetwork } from "@presencia/shared";
import { missingImageNote, selectedAssetId } from "../../lib/cards/card-image.js";
import {
  CardImage,
  EmptyImageState,
  ImageActionStrip,
  type CardMediaActions,
} from "./CardMedia.js";
import { Hashtags } from "./Hashtags.js";

type VisualFirstContent = Extract<CardContent, { archetype: "visual_first" }>;

// Portado de VisualPreview/CardVisual (arquetipos.jsx) — el mockup renderiza
// un post de Instagram completo con usuario/avatar/"2,847 me gusta" de
// ejemplo. Se omite esa parte: es contenido de muestra del mockup, no datos
// reales, y mostrar un contador de "me gusta" falso engañaría antes de
// publicar. Se mantiene sí la estructura honesta: la imagen elegida (o el
// estado "esperando imagen", con el prompt sugerido) + caption + hashtags.
//
// F10: la imagen es real (Biblioteca, `/api/assets/:id/content`). `media`
// solo viene cuando la card se puede editar; sin él no hay acciones.
export function VisualCardBody({
  content,
  network,
  media,
}: {
  content: VisualFirstContent;
  network: SocialNetwork;
  media?: CardMediaActions;
}) {
  const assetId = selectedAssetId(content);

  return (
    <div className="px-4 pt-3.5 pb-1">
      {assetId ? (
        <>
          <CardImage
            key={assetId}
            assetId={assetId}
            alt={content.imagePrompt ?? "Imagen de la publicación"}
          />
          {media && <ImageActionStrip media={media} />}
        </>
      ) : (
        <EmptyImageState
          note={missingImageNote(network)}
          prompt={content.imagePrompt}
          media={media}
        />
      )}
      <p className="mt-3 text-sm whitespace-pre-wrap text-fg">{content.caption}</p>
      <Hashtags tags={content.hashtags} />
    </div>
  );
}
