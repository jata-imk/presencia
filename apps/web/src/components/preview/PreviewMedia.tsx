import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import {
  assetContentUrl,
  type CardContent,
  type CardImageJob,
  type ImageAspectRatio,
} from "@presencia/shared";
import { PreviewImage } from "./PreviewParts.js";

// Las imágenes de un post como las acomoda cada red (F10.6, carrusel). Con
// una sola imagen es la misma PreviewImage de siempre; con varias:
//
// - `carousel` (Instagram): una a la vez, flechas, puntos y "1/5".
// - `grid` (Facebook, LinkedIn): una grande arriba y el resto en fila; a
//   partir de cierta cantidad la última dice "+N".
// - `mosaic` (X): hasta 4 en mosaico con esquinas redondeadas.
// - `strip` (Threads): tira horizontal con scroll.
//
// Fiel en disposición, no en píxeles: cada red ajusta sus propios recortes y
// eso cambia más seguido que esta app.

export type MediaLayout = "carousel" | "grid" | "mosaic" | "strip";

export interface PreviewMediaItem {
  assetId: string;
  alt: string;
}

/** Las imágenes de la card, en orden, con el texto alternativo de cada una. */
export function mediaItems(content: CardContent): PreviewMediaItem[] {
  if (content.archetype === "video_script") return [];
  const fallback =
    "imagePrompt" in content && content.imagePrompt
      ? content.imagePrompt
      : "Imagen de la publicación";
  if (content.slides) {
    return content.slides.flatMap((s, i) =>
      s.assetId
        ? [{ assetId: s.assetId, alt: s.imagePrompt ?? `Imagen ${String(i + 1)} del carrusel` }]
        : [],
    );
  }
  return content.assetIds.map((assetId) => ({ assetId, alt: fallback }));
}

/** La proporción de todo el carrusel (la de la card, o la del primer slide por default). */
export function mediaAspect(content: CardContent): ImageAspectRatio {
  return content.archetype !== "video_script" && content.slidesAspect
    ? content.slidesAspect
    : "4:5";
}

const ASPECT_CLASS: Record<ImageAspectRatio, string> = {
  "4:5": "aspect-[4/5]",
  "1:1": "aspect-square",
  "16:9": "aspect-video",
};

export function PreviewMedia({
  items,
  job,
  layout,
  aspect = "4:5",
  className = "",
}: {
  items: PreviewMediaItem[];
  job: CardImageJob | null;
  layout: MediaLayout;
  /** Instagram recorta todo el carrusel a una proporción: el hueco no salta al pasar. */
  aspect?: ImageAspectRatio;
  className?: string;
}) {
  // Una sola (o ninguna todavía, generando): la de siempre.
  if (items.length <= 1) {
    return (
      <PreviewImage
        assetId={items[0]?.assetId}
        job={items.length === 0 ? job : null}
        alt={items[0]?.alt ?? "Imagen de la publicación"}
        className={className}
      />
    );
  }
  switch (layout) {
    case "carousel":
      return <Carousel items={items} aspect={aspect} className={className} />;
    case "mosaic":
      return <Mosaic items={items.slice(0, 4)} className={className} />;
    case "strip":
      return <Strip items={items} className={className} />;
    default:
      return <Grid items={items} className={className} />;
  }
}

function Img({ item, className = "" }: { item: PreviewMediaItem; className?: string }) {
  return (
    <img
      src={assetContentUrl(item.assetId)}
      alt={item.alt}
      loading="lazy"
      draggable={false}
      className={`block size-full object-cover ${className}`}
    />
  );
}

function Carousel({
  items,
  aspect,
  className,
}: {
  items: PreviewMediaItem[];
  aspect: ImageAspectRatio;
  className: string;
}) {
  const [index, setIndex] = useState(0);
  const at = Math.min(index, items.length - 1);
  return (
    <div className={className}>
      <div
        role="group"
        aria-roledescription="carrusel"
        aria-label={`Imagen ${String(at + 1)} de ${String(items.length)}`}
        className={`relative bg-surface ${ASPECT_CLASS[aspect]}`}
      >
        {/* Todas montadas y solo la actual visible: se cargan de una vez y
            pasar a la siguiente no deja el hueco vacío mientras llega. */}
        {items.map((item, i) => (
          <img
            key={item.assetId + String(i)}
            src={assetContentUrl(item.assetId)}
            alt={i === at ? item.alt : ""}
            aria-hidden={i !== at}
            draggable={false}
            className={`absolute inset-0 size-full object-cover ${i === at ? "" : "invisible"}`}
          />
        ))}
        <span className="absolute top-2.5 right-2.5 rounded-full bg-fg/70 px-2 py-0.5 text-[11px] font-semibold text-fg-inverse">
          {at + 1}/{items.length}
        </span>
        {at > 0 && (
          <button
            type="button"
            aria-label="Imagen anterior"
            onClick={() => setIndex(at - 1)}
            className="absolute top-1/2 left-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-card/90 text-fg shadow-sm"
          >
            <ChevronLeft size={16} aria-hidden />
          </button>
        )}
        {at < items.length - 1 && (
          <button
            type="button"
            aria-label="Imagen siguiente"
            onClick={() => setIndex(at + 1)}
            className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-card/90 text-fg shadow-sm"
          >
            <ChevronRight size={16} aria-hidden />
          </button>
        )}
      </div>
      <div aria-hidden className="flex justify-center gap-1 pt-2.5">
        {items.map((item, i) => (
          <span
            key={item.assetId + String(i)}
            className={`size-1.5 rounded-full ${i === at ? "bg-info" : "bg-line"}`}
          />
        ))}
      </div>
    </div>
  );
}

/** Facebook / LinkedIn: la primera grande, las siguientes en fila; "+N" en la última visible. */
function Grid({ items, className }: { items: PreviewMediaItem[]; className: string }) {
  const [first, ...rest] = items;
  const visible = rest.slice(0, 3);
  const hidden = rest.length - visible.length;
  if (items.length === 2) {
    return (
      <div className={`grid grid-cols-2 gap-0.5 ${className}`}>
        {items.map((item, i) => (
          <div key={item.assetId + String(i)} className="aspect-[4/5]">
            <Img item={item} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      <div className="aspect-[4/3]">
        <Img item={first!} />
      </div>
      <div className={`grid gap-0.5 ${visible.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
        {visible.map((item, i) => (
          <div key={item.assetId + String(i)} className="relative aspect-square">
            <Img item={item} />
            {hidden > 0 && i === visible.length - 1 && (
              <span className="absolute inset-0 flex items-center justify-center bg-fg/55 font-display text-xl font-bold text-fg-inverse">
                +{hidden}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** X: hasta 4, en mosaico dentro de un marco redondeado. */
function Mosaic({ items, className }: { items: PreviewMediaItem[]; className: string }) {
  const n = items.length;
  return (
    <div
      className={`grid aspect-video grid-cols-2 gap-0.5 overflow-hidden rounded-2xl border border-line ${
        n === 4 ? "grid-rows-2" : n === 3 ? "grid-rows-2" : "grid-rows-1"
      } ${className}`}
    >
      {items.map((item, i) => (
        <div
          key={item.assetId + String(i)}
          className={`min-h-0 ${n === 3 && i === 0 ? "row-span-2" : ""}`}
        >
          <Img item={item} />
        </div>
      ))}
    </div>
  );
}

/** Threads: tira horizontal que se desliza. */
function Strip({ items, className }: { items: PreviewMediaItem[]; className: string }) {
  return (
    <div
      className={`flex snap-x snap-mandatory [scrollbar-width:none] gap-1.5 overflow-x-auto ${className}`}
    >
      {items.map((item, i) => (
        <div
          key={item.assetId + String(i)}
          className="aspect-[4/5] w-[62%] shrink-0 snap-start overflow-hidden rounded-lg border border-line"
        >
          <Img item={item} />
        </div>
      ))}
    </div>
  );
}
