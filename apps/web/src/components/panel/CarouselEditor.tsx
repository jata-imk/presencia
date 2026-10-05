import {
  ArrowLeft,
  ArrowRight,
  GripVertical,
  ImagePlus,
  Loader2,
  Maximize2,
  MoreHorizontal,
  Plus,
  RectangleHorizontal,
  RectangleVertical,
  Sparkles,
  Square,
  Star,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { assetContentUrl, type CarouselSlide, type ImageAspectRatio } from "@presencia/shared";
import type { CarouselActions } from "../../lib/cards/use-card-controller.js";
import { EmptyImageState, SelectedImage } from "../cards/CardMedia.js";
import { StyleChip } from "../cards/StyleChip.js";
import { ImageViewer, type ViewerItem } from "../ui/ImageViewer.js";
import { Menu, MENU_CONTENT_CLASS, MENU_ITEM_CLASS } from "../ui/Menu.js";
import { Segmented } from "./PanelParts.js";

// El carrusel en el modo Editar del panel (F10.6, "Chat Rediseño" §3.3;
// rediseño F10.6.1 tras el recorrido de Jose).
//
// - Una TIRA horizontal de miniaturas (decisión de Jose): siempre una fila,
//   quepan 3 o 10 slides; la grilla de 3 columnas 4:5 no entraba en el ancho
//   default del panel con más de 2 filas.
// - Todo lo que cambia el carrusel vive EN la miniatura: el agarre para
//   arrastrar (grande y siempre visible) y su menú ⋯ con Hacer portada,
//   mover, ver en grande y quitar. Es el patrón accesible de reordenar
//   (Salesforce/Atlassian): el menú es la alternativa al arrastre con teclado
//   y en touch, donde el drag de HTML5 no existe. Las flechas que había en el
//   detalle se quitaron: se leían como "ver la siguiente" y reordenaban.
// - Debajo, el slide elegido con las piezas de imagen de siempre, que
//   `carousel.mediaFor` apunta a ESE slide.

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

function slideLabel(index: number): string {
  return index === 0 ? "Portada" : `Slide ${String(index + 1)}`;
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
  // El visor abierto en el slide con este id (null = cerrado).
  const [viewing, setViewing] = useState<string | null>(null);
  // Después de "+ Agregar" el elegido tiene que ser el nuevo, pero su id lo
  // pone la API: se elige el último cuando la card llega con uno más.
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
  const generating = carousel.generatingIds.length > 0;
  const full = slides.length >= carousel.max;

  // La miniatura elegida se trae a la vista DENTRO de la tira (no con
  // scrollIntoView, que también movería el panel).
  const strip = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const row = strip.current;
    const tile = row?.querySelector<HTMLElement>('[data-selected="true"]');
    if (!row || !tile) return;
    const left = tile.offsetLeft - row.offsetLeft;
    if (left < row.scrollLeft) row.scrollLeft = left - 8;
    else if (left + tile.offsetWidth > row.scrollLeft + row.clientWidth) {
      row.scrollLeft = left + tile.offsetWidth - row.clientWidth + 8;
    }
  }, [selectedId, slides.length]);

  // Qué orilla de la tira tiene más slides escondidos: esa se desvanece, para
  // que un corte a media miniatura se lea como "hay más" y no como un error.
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const row = strip.current;
    if (!row) return;
    const update = () => {
      const left = row.scrollLeft > 2;
      const right = row.scrollLeft + row.clientWidth < row.scrollWidth - 2;
      setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    };
    update();
    row.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(row);
    return () => {
      row.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [slides.length]);

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

  // El visor recorre las imágenes del carrusel (los slides sin imagen no).
  const viewerItems: (ViewerItem & { slideId: string })[] = slides.flatMap((slide, index) =>
    slide.assetId
      ? [
          {
            slideId: slide.id,
            assetId: slide.assetId,
            alt: slide.imagePrompt ?? slideLabel(index),
            label: slideLabel(index),
          },
        ]
      : [],
  );
  const viewerStart = viewerItems.findIndex((item) => item.slideId === viewing);

  return (
    <div className="flex flex-col gap-3">
      <ol
        ref={strip}
        aria-label="Slides del carrusel"
        className={`-mx-1 flex snap-x scroll-px-1 gap-2 overflow-x-auto px-1 pt-1 pb-2 ${
          edges.left ? "mask-l-from-[calc(100%-2.5rem)]" : ""
        } ${edges.right ? "mask-r-from-[calc(100%-2.5rem)]" : ""}`}
      >
        {slides.map((slide, index) => (
          <SlideTile
            key={slide.id}
            slide={slide}
            index={index}
            count={slides.length}
            aspect={carousel.aspect}
            selected={slide.id === selected.id}
            generating={carousel.generatingIds.includes(slide.id)}
            busy={busy}
            canRemove={!generating}
            dropTarget={over === index && dragging !== null && dragging !== index}
            onSelect={() => setSelectedId(slide.id)}
            onMove={(to) => reorderTo(index, to)}
            onView={() => setViewing(slide.id)}
            onRemove={() => carousel.remove(slide.id)}
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
          <li className="w-22 shrink-0 snap-start">
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
              className={`flex w-full flex-col items-center justify-center gap-1 rounded-lg border-[1.5px] border-dashed border-line-focus font-display text-[11.5px] font-semibold text-fg-muted transition-colors hover:border-accent hover:bg-tint-plum hover:text-accent disabled:opacity-50 ${ASPECT_CLASS[carousel.aspect]}`}
            >
              <Plus size={18} aria-hidden />
              Agregar
            </button>
          </li>
        )}
      </ol>

      {/* La barra del carrusel: lo que aplica a TODOS los slides. */}
      <div className="flex flex-col gap-2.5 rounded-lg bg-surface px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <StyleChip
            value={carousel.style}
            onChange={carousel.setStyle}
            disabled={busy || generating}
          />
          {carousel.aspectOptions.length > 1 && (
            <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
              Recorte
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
                  disabled: busy || carousel.requesting || generating,
                }))}
              />
            </span>
          )}
          <span className="ml-auto font-display text-xs font-semibold text-fg-secondary">
            {slides.length} de {carousel.max}
          </span>
        </div>
        <p className="text-[11px] leading-snug text-fg-muted">
          Arrastra las miniaturas o usa su menú ⋯ para ordenar; la primera es la portada.
          {carousel.aspectOptions.length > 1 &&
            " Recortar no usa IA ni gasta tu mes; guardamos las originales."}
        </p>
        {carousel.missingPercent !== null && (
          <button
            type="button"
            onClick={carousel.generateMissing}
            disabled={busy || generating}
            className="inline-flex h-9 items-center justify-center gap-2 self-start rounded-full bg-primary px-4 font-display text-[13px] font-semibold text-primary-fg hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles size={15} aria-hidden />
            Generar{" "}
            {carousel.missingCount === 1
              ? "la que falta"
              : `las ${String(carousel.missingCount)} que faltan`}
            <span className="font-medium opacity-80">· {priceLabel(carousel.missingPercent)}</span>
          </button>
        )}
      </div>

      {/* El slide elegido. */}
      <section aria-label={slideLabel(selectedIndex)} className="rounded-xl border border-line p-3">
        <div className="mb-2.5 flex items-center gap-2">
          {selectedIndex === 0 && <Star size={14} className="text-accent" aria-hidden />}
          <h3 className="font-display text-[13.5px] font-semibold text-fg">
            {slideLabel(selectedIndex)}
          </h3>
          <span className="text-xs text-fg-muted">
            {selectedIndex + 1} de {slides.length}
          </span>
        </div>
        {selected.assetId ? (
          <SelectedImage
            key={`${selected.id}-${selected.assetId}`}
            assetId={selected.assetId}
            alt={selected.imagePrompt ?? "Imagen del carrusel"}
            prompt={selected.imagePrompt}
            media={media}
            onExpand={() => setViewing(selected.id)}
          />
        ) : (
          <EmptyImageState
            key={selected.id}
            note={selectedIndex === 0 ? missingNote : "Este slide todavía no tiene imagen."}
            prompt={selected.imagePrompt}
            media={media}
          />
        )}
      </section>

      {viewing !== null && viewerStart !== -1 && (
        <ImageViewer
          items={viewerItems}
          startIndex={viewerStart}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

function SlideTile({
  slide,
  index,
  count,
  aspect,
  selected,
  generating,
  busy,
  canRemove,
  dropTarget,
  onSelect,
  onMove,
  onView,
  onRemove,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: {
  slide: CarouselSlide;
  index: number;
  count: number;
  aspect: ImageAspectRatio;
  selected: boolean;
  generating: boolean;
  busy: boolean;
  canRemove: boolean;
  dropTarget: boolean;
  onSelect: () => void;
  onMove: (to: number) => void;
  onView: () => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragOver: (event: DragEvent) => void;
  onDragEnd: () => void;
  onDrop: (event: DragEvent) => void;
}) {
  const label = slideLabel(index);
  return (
    <li
      data-selected={selected}
      draggable={!busy}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDrop={onDrop}
      className="group relative w-22 shrink-0 snap-start"
    >
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`${label}${slide.assetId ? "" : ", sin imagen"}`}
        onClick={onSelect}
        className={`block w-full overflow-hidden rounded-lg bg-tint-plum transition-[outline-color] ${ASPECT_CLASS[aspect]} ${
          selected
            ? "outline-2 outline-offset-2 outline-primary"
            : dropTarget
              ? "outline-2 outline-offset-2 outline-accent outline-dashed"
              : "outline-1 -outline-offset-1 outline-line hover:outline-line-focus"
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
          <span className="flex size-full flex-col items-center justify-center gap-1 p-1.5 text-center text-[10px] leading-tight text-fg-muted">
            <ImagePlus size={16} strokeWidth={1.5} aria-hidden />
            <span className="line-clamp-3">{slide.imagePrompt ?? "Sin imagen"}</span>
          </span>
        )}
        {generating && (
          <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-card/70">
            <Loader2
              size={18}
              className="text-accent motion-safe:animate-spin"
              aria-label="Generando"
            />
          </span>
        )}
      </button>

      {/* Insignia: portada o número. */}
      <span className="pointer-events-none absolute top-1 left-1 inline-flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-md bg-fg/75 px-1 font-display text-[10px] font-bold text-fg-inverse">
        {index === 0 ? <Star size={10} aria-label="Portada" /> : index + 1}
      </span>

      {/* Agarre: grande y siempre visible (antes era un ícono de 14 px que
          casi no se veía). Toda la miniatura se arrastra; esto dice que se
          puede. Solo mouse: con teclado y touch está el menú ⋯. */}
      <span
        aria-hidden
        title="Arrastra para reordenar"
        className={`absolute bottom-1 left-1 hidden size-6 items-center justify-center rounded-full bg-card/90 text-fg-secondary shadow-sm sm:flex ${
          busy ? "cursor-not-allowed opacity-50" : "cursor-grab active:cursor-grabbing"
        }`}
      >
        <GripVertical size={14} />
      </span>

      <Menu placement="bottom-end">
        <Menu.Trigger
          aria-label={`Opciones de ${label}`}
          title="Opciones"
          className="absolute right-1 bottom-1 flex size-6 items-center justify-center rounded-full bg-card/90 text-fg shadow-sm hover:bg-card aria-expanded:bg-card"
        >
          <MoreHorizontal size={14} aria-hidden />
        </Menu.Trigger>
        <Menu.Content className={`${MENU_CONTENT_CLASS} w-52`}>
          <Menu.Item
            className={MENU_ITEM_CLASS}
            disabled={busy || index === 0}
            onClick={() => onMove(0)}
          >
            <Star size={14} aria-hidden />
            Hacer portada
          </Menu.Item>
          <Menu.Item
            className={MENU_ITEM_CLASS}
            disabled={busy || index === 0}
            onClick={() => onMove(index - 1)}
          >
            <ArrowLeft size={14} aria-hidden />
            Mover a la izquierda
          </Menu.Item>
          <Menu.Item
            className={MENU_ITEM_CLASS}
            disabled={busy || index === count - 1}
            onClick={() => onMove(index + 1)}
          >
            <ArrowRight size={14} aria-hidden />
            Mover a la derecha
          </Menu.Item>
          <Menu.Item className={MENU_ITEM_CLASS} disabled={!slide.assetId} onClick={onView}>
            <Maximize2 size={14} aria-hidden />
            Ver en grande
          </Menu.Item>
          <div className="my-1 border-t border-line" role="separator" />
          <Menu.Item
            className={`${MENU_ITEM_CLASS} text-error-fg`}
            disabled={busy || !canRemove}
            onClick={onRemove}
          >
            <Trash2 size={14} aria-hidden />
            Quitar slide
          </Menu.Item>
        </Menu.Content>
      </Menu>
    </li>
  );
}
