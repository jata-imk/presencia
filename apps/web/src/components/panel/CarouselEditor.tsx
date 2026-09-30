import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  ImagePlus,
  Loader2,
  Plus,
  RectangleHorizontal,
  RectangleVertical,
  Sparkles,
  Square,
  Star,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type DragEvent } from "react";
import { assetContentUrl, type CarouselSlide, type ImageAspectRatio } from "@presencia/shared";
import type { CarouselActions } from "../../lib/cards/use-card-controller.js";
import { EmptyImageState, SelectedImage } from "../cards/CardMedia.js";
import { Segmented } from "./PanelParts.js";

// El carrusel en el modo Editar del panel (F10.6, "Chat Rediseño" §3.3):
// grilla de slides con la portada marcada, arrastrar para reordenar, "+
// Agregar slide" y el recorte de todo el carrusel. Debajo, el slide elegido
// con las piezas de imagen de siempre (composer, versiones, ajustar), que
// `carousel.mediaFor` apunta a ESE slide.
//
// Reordenar tiene dos caminos a propósito: arrastrar (mouse) y las flechas
// del slide elegido (teclado y touch, donde el drag de HTML5 no existe).

const ASPECT_CLASS: Record<ImageAspectRatio, string> = {
  "4:5": "aspect-[4/5]",
  "1:1": "aspect-square",
  "16:9": "aspect-video",
};

const ASPECT_ICON: Record<ImageAspectRatio, LucideIcon> = {
  "4:5": RectangleVertical,
  "1:1": Square,
  "16:9": RectangleHorizontal,
};

function priceLabel(percent: number): string {
  return `${percent.toLocaleString("es-MX", { maximumFractionDigits: 1 })}% de tu mes`;
}

function move<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

export function CarouselEditor({
  carousel,
  missingNote,
}: {
  carousel: CarouselActions;
  missingNote: string;
}) {
  const { slides } = carousel;
  const [selectedId, setSelectedId] = useState<string>(slides[0]!.id);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  // Después de "+ Agregar slide" el elegido tiene que ser el nuevo, pero su
  // id lo pone la API: se elige el último cuando la card llega con uno más.
  const [addedFrom, setAddedFrom] = useState<number | null>(null);
  useEffect(() => {
    if (addedFrom !== null && slides.length > addedFrom) {
      setSelectedId(slides.at(-1)!.id);
      setAddedFrom(null);
    }
  }, [slides, addedFrom]);

  // El elegido pudo desaparecer (se quitó, otra pestaña): vuelve a la portada.
  const selectedIndex = Math.max(
    0,
    slides.findIndex((s) => s.id === selectedId),
  );
  const selected = slides[selectedIndex]!;
  const media = carousel.mediaFor(selected, selectedIndex);
  const busy = carousel.changing;
  const full = slides.length >= carousel.max;

  function reorderTo(from: number, to: number) {
    // Con un cambio en camino el orden de acá puede ser viejo, y la API lo
    // rechazaría (409): se espera a que llegue.
    if (busy || from === to || to < 0 || to >= slides.length) return;
    carousel.reorder(move(slides, from, to).map((s) => s.id));
  }

  function onDrop(event: DragEvent, to: number) {
    event.preventDefault();
    if (dragging !== null) reorderTo(dragging, to);
    setDragging(null);
    setOver(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="listbox" aria-label="Slides del carrusel" className="grid grid-cols-3 gap-2.5">
        {slides.map((slide, index) => (
          <SlideTile
            key={slide.id}
            slide={slide}
            index={index}
            aspect={carousel.aspect}
            selected={slide.id === selected.id}
            generating={carousel.generatingIds.includes(slide.id)}
            draggable={!busy}
            dropTarget={over === index && dragging !== null && dragging !== index}
            onSelect={() => setSelectedId(slide.id)}
            onDragStart={() => setDragging(index)}
            onDragOver={(event) => {
              event.preventDefault();
              setOver(index);
            }}
            onDragEnd={() => {
              setDragging(null);
              setOver(null);
            }}
            onDrop={(event) => onDrop(event, index)}
          />
        ))}
        {!full && (
          <button
            type="button"
            onClick={() => {
              // El nuevo queda elegido, listo para escribirle su prompt.
              setAddedFrom(slides.length);
              void carousel.add().then((ok) => {
                if (!ok) setAddedFrom(null);
              });
            }}
            disabled={busy}
            className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-[1.5px] border-dashed border-line-focus font-display text-[12.5px] font-semibold text-fg-muted hover:bg-secondary disabled:opacity-50 ${ASPECT_CLASS[carousel.aspect]}`}
          >
            <Plus size={18} aria-hidden />
            Agregar slide
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-fg-muted">
        <span className="hidden sm:inline">Arrastra para reordenar · la primera es la portada</span>
        <span className="sm:hidden">La primera es la portada</span>
        <span className="font-display font-semibold text-fg-secondary">
          {slides.length}/{carousel.max}
        </span>
        <div className="flex-1" />
        {carousel.aspectOptions.length > 1 && (
          <span className="inline-flex items-center gap-1.5">
            Recorte:
            <Segmented<ImageAspectRatio>
              small
              label="Recorte del carrusel"
              value={carousel.aspect}
              // También la ya elegida: vuelve a recortar lo que no esté en ella
              // (una imagen subida o traída de antes de elegir la proporción).
              onChange={(aspect) => carousel.setAspect(aspect)}
              options={carousel.aspectOptions.map((a) => ({
                value: a,
                label: a,
                Icon: ASPECT_ICON[a],
                disabled: busy || carousel.requesting || carousel.generatingIds.length > 0,
              }))}
            />
          </span>
        )}
      </div>

      {carousel.missingPercent !== null && (
        <button
          type="button"
          onClick={carousel.generateMissing}
          disabled={busy || carousel.generatingIds.length > 0}
          className="inline-flex h-9 items-center justify-center gap-2 self-start rounded-md bg-primary px-3.5 font-display text-[13px] font-semibold text-primary-fg hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles size={15} aria-hidden />
          Generar{" "}
          {carousel.missingCount === 1
            ? "la que falta"
            : `las ${String(carousel.missingCount)} que faltan`}{" "}
          · {priceLabel(carousel.missingPercent)}
        </button>
      )}

      <div className="rounded-lg border border-line p-3">
        <div className="mb-2.5 flex items-center gap-1.5">
          <span className="font-display text-[13px] font-semibold text-fg">
            {selectedIndex === 0 ? "Portada" : `Slide ${String(selectedIndex + 1)}`}
          </span>
          <div className="flex-1" />
          <IconAction
            Icon={ChevronLeft}
            label="Mover a la izquierda"
            disabled={busy || selectedIndex === 0}
            onClick={() => reorderTo(selectedIndex, selectedIndex - 1)}
          />
          <IconAction
            Icon={ChevronRight}
            label="Mover a la derecha"
            disabled={busy || selectedIndex === slides.length - 1}
            onClick={() => reorderTo(selectedIndex, selectedIndex + 1)}
          />
          <IconAction
            Icon={Trash2}
            label="Quitar slide"
            disabled={busy || carousel.generatingIds.length > 0}
            onClick={() => carousel.remove(selected.id)}
          />
        </div>
        {selected.assetId ? (
          <SelectedImage
            key={`${selected.id}-${selected.assetId}`}
            assetId={selected.assetId}
            alt={selected.imagePrompt ?? "Imagen del carrusel"}
            prompt={selected.imagePrompt}
            media={media}
          />
        ) : (
          <EmptyImageState
            key={selected.id}
            note={selectedIndex === 0 ? missingNote : "Este slide todavía no tiene imagen."}
            prompt={selected.imagePrompt}
            media={media}
          />
        )}
      </div>
    </div>
  );
}

function SlideTile({
  slide,
  index,
  aspect,
  selected,
  generating,
  draggable,
  dropTarget,
  onSelect,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: {
  slide: CarouselSlide;
  index: number;
  aspect: ImageAspectRatio;
  selected: boolean;
  generating: boolean;
  draggable: boolean;
  dropTarget: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onDragOver: (event: DragEvent) => void;
  onDragEnd: () => void;
  onDrop: (event: DragEvent) => void;
}) {
  const label = index === 0 ? "Portada" : `Slide ${String(index + 1)}`;
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      aria-label={`${label}${slide.assetId ? "" : ", sin imagen"}`}
      draggable={draggable}
      onClick={onSelect}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDrop={onDrop}
      className={`group relative overflow-hidden rounded-lg bg-tint-plum text-left ${ASPECT_CLASS[aspect]} ${
        selected
          ? "outline-2 outline-offset-2 outline-primary"
          : dropTarget
            ? "outline-2 outline-offset-2 outline-line-focus"
            : "outline-1 -outline-offset-1 outline-line"
      }`}
    >
      {slide.assetId ? (
        <img
          src={assetContentUrl(slide.assetId)}
          alt=""
          loading="lazy"
          draggable={false}
          className="size-full object-cover"
        />
      ) : (
        <span className="flex size-full flex-col items-center justify-center gap-1.5 p-2 text-center text-[11px] leading-snug text-fg-muted">
          <ImagePlus size={18} strokeWidth={1.5} aria-hidden />
          <span className="line-clamp-3">{slide.imagePrompt ?? "Sin imagen"}</span>
        </span>
      )}
      {generating && (
        <span className="absolute inset-0 flex items-center justify-center bg-card/70">
          <Loader2
            size={18}
            className="text-accent motion-safe:animate-spin"
            aria-label="Generando"
          />
        </span>
      )}
      <span className="absolute top-1.5 left-1.5 inline-flex h-5 min-w-5 items-center gap-1 rounded-md bg-fg/70 px-1.5 font-display text-[10.5px] font-bold text-fg-inverse">
        {index === 0 ? (
          <>
            <Star size={10} aria-hidden />
            Portada
          </>
        ) : (
          index + 1
        )}
      </span>
      <span className="absolute top-1.5 right-1 hidden text-fg-inverse opacity-85 drop-shadow sm:block">
        <GripVertical size={14} aria-hidden />
      </span>
    </button>
  );
}

function IconAction({
  Icon,
  label,
  disabled,
  onClick,
}: {
  Icon: LucideIcon;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-md text-fg-secondary hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon size={15} aria-hidden />
    </button>
  );
}
