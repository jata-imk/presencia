import { ImagePlus } from "lucide-react";
import type { CardContent } from "@presencia/shared";
import { Hashtags } from "./Hashtags.js";

type VisualFirstContent = Extract<CardContent, { archetype: "visual_first" }>;

// Portado de VisualPreview/CardVisual (arquetipos.jsx) — el mockup renderiza
// un post de Instagram completo con usuario/avatar/"2,847 me gusta" de
// ejemplo. Se omite esa parte: es contenido de muestra del mockup, no datos
// reales, y mostrar un contador de "me gusta" falso engañaría antes de
// publicar. Se mantiene sí la estructura honesta: imagen (o el prompt/el
// estado "esperando imagen" si no hay ninguna) + caption + hashtags.
export function VisualCardBody({ content }: { content: VisualFirstContent }) {
  const hasAsset = content.assetIds.length > 0;

  return (
    <div className="px-4 pt-3.5 pb-1">
      {hasAsset ? (
        // F10/F11 (generación/subida de imagen) no está construido — cuando
        // exista, este bloque resuelve el asset real en vez del placeholder.
        <div className="flex aspect-[4/5] w-full items-center justify-center rounded-lg bg-gradient-to-br from-pink-orchid via-blush-pop to-icy-blue text-4xl opacity-70">
          🖼
        </div>
      ) : content.imagePrompt ? (
        <div className="rounded-lg border border-line bg-tint-plum px-3.5 py-3">
          <p className="mb-1 text-xs font-semibold text-fg">Prompt de imagen</p>
          <p className="text-xs text-fg-secondary">{content.imagePrompt}</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-ai-border bg-ai-bg px-4 py-8 text-center">
          <ImagePlus className="text-accent" size={26} strokeWidth={1.5} />
          <p className="text-sm font-semibold text-fg">Esperando imagen</p>
          <p className="text-xs text-fg-secondary">
            Esta red necesita una imagen antes de programar.
          </p>
        </div>
      )}
      <p className="mt-3 text-sm whitespace-pre-wrap text-fg">{content.caption}</p>
      <Hashtags tags={content.hashtags} />
    </div>
  );
}
