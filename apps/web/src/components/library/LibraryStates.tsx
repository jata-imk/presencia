import { CloudOff, MessageSquare, RefreshCw, SearchX, Sparkles, Upload } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { BENTO_GRID_CLASS, BENTO_SPANS } from "./LibraryBento.js";
import { GRID_CLASS } from "./LibraryItems.js";

// Los estados de Biblioteca que no son "hay imágenes" (F12,
// `presencia-biblioteca.md` §5 y Claude Design "Presencia - Biblioteca" §05):
// vacía, sin resultados, cargando y error.

const PRIMARY =
  "flex items-center gap-2 rounded-md bg-primary px-4 font-display text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover";
const SECONDARY =
  "flex items-center gap-2 rounded-md border border-line bg-card px-4 font-display text-sm font-semibold text-brand transition-colors hover:bg-secondary";

function StateTitle({ children, big = false }: { children: ReactNode; big?: boolean }) {
  return (
    <h2
      className={`mt-1 font-display font-semibold text-balance text-brand ${
        big ? "text-xl tracking-[-0.02em]" : "text-[20px]"
      }`}
    >
      {children}
    </h2>
  );
}

/**
 * Biblioteca sin ninguna imagen. Las salidas son dos: ir a crear al Chat o
 * subir. La tercera del diseño ("Generar imagen") llega con su modal.
 */
export function LibraryEmpty({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="mx-auto mt-8 flex max-w-[520px] flex-col items-center gap-3 text-center @lg:mt-16">
      <div className="flex size-16 items-center justify-center rounded-[18px] bg-tint-plum text-accent">
        <Sparkles size={28} aria-hidden />
      </div>
      <StateTitle big>Aquí vivirán todas tus imágenes</StateTitle>
      <p className="text-base leading-[1.65] text-pretty text-fg-secondary">
        Cada imagen que generes desde una card del chat se guarda sola, con su chat y su card de
        origen. También puedes subir las tuyas.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Link to="/chats" className={`${PRIMARY} h-10`}>
          <MessageSquare size={15} aria-hidden />
          Ir a Chats
        </Link>
        <button type="button" onClick={onUpload} className={`${SECONDARY} h-10`}>
          <Upload size={15} aria-hidden />
          Subir imágenes
        </button>
      </div>
      <button
        type="button"
        onClick={onUpload}
        className="mt-5 w-full rounded-lg border-[1.5px] border-dashed border-accent p-6 text-sm leading-normal text-fg-secondary transition-colors hover:bg-secondary"
      >
        <span className="block font-medium text-fg">
          Arrastra tus imágenes a cualquier parte de esta vista
        </span>
        <span className="block">JPG, PNG o WebP de hasta 10 MB</span>
      </button>
    </div>
  );
}

/** Nada coincide. Dice qué se buscó y deja limpiar todo de un clic. */
export function LibraryNoResults({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="mx-auto mt-14 flex max-w-[440px] flex-col items-center gap-3 text-center">
      <div className="flex size-14 items-center justify-center rounded-xl bg-tint-plum text-accent">
        <SearchX size={26} aria-hidden />
      </div>
      <StateTitle>
        {query ? `Sin resultados para «${query}»` : "Ninguna imagen coincide con estos filtros"}
      </StateTitle>
      <p className="text-base leading-[1.6] text-pretty text-fg-secondary">
        Buscamos en prompts, textos alternativos y títulos de chats. Prueba con otras palabras o
        quita algún filtro.
      </p>
      <button type="button" onClick={onClear} className={`${SECONDARY} mt-2 h-9`}>
        Limpiar búsqueda y filtros
      </button>
    </div>
  );
}

/** Lo primero que dice es que no se perdió nada. */
export function LibraryError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="mx-auto mt-[72px] flex max-w-[440px] flex-col items-center gap-3 text-center"
    >
      <div className="flex size-14 items-center justify-center rounded-xl bg-error-bg text-error">
        <CloudOff size={26} aria-hidden />
      </div>
      <StateTitle>No pudimos cargar tu Biblioteca</StateTitle>
      <p className="text-base leading-[1.6] text-fg-secondary">
        Tus imágenes siguen guardadas. Revisa tu conexión e inténtalo de nuevo.
      </p>
      <button type="button" onClick={onRetry} className={`${PRIMARY} mt-2 h-9`}>
        <RefreshCw size={15} aria-hidden />
        Reintentar
      </button>
    </div>
  );
}

// Proporciones reales (4:5, 1:1, 16:9) para que la cuadrícula no brinque al
// llegar las imágenes.
const SKELETON_RATIOS = [
  [4, 5],
  [1, 1],
  [16, 9],
  [4, 5],
  [4, 5],
  [1, 1],
  [16, 9],
  [1, 1],
  [4, 5],
  [16, 9],
  [1, 1],
  [4, 5],
] as const;

/** Las celdas de la cuadrícula mientras llega una consulta. */
function GridSkeleton() {
  return (
    <div aria-hidden>
      <div className="skeleton mb-3.5 h-3.5 w-[60px] rounded-sm" />
      <div className={GRID_CLASS}>
        {SKELETON_RATIOS.map(([w, h], index) => (
          // En angosto bastan seis: doce son tres pantallas de esqueleto.
          <div key={index} className={`flex-col gap-2 ${index < 6 ? "flex" : "hidden @lg:flex"}`}>
            <div className="relative aspect-square rounded-lg bg-lib-tile">
              <div className="absolute inset-2 flex items-center justify-center @lg:inset-3">
                <div
                  style={{ aspectRatio: `${String(w)} / ${String(h)}` }}
                  className={`skeleton rounded-[6px] ${w > h ? "w-full" : "h-full"}`}
                />
              </div>
            </div>
            <div className="skeleton h-2.5 w-4/5 rounded-sm" />
            <div className="skeleton h-2.5 w-1/2 rounded-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

function BentoSkeletonCell({ className, wide }: { className: string; wide?: boolean }) {
  return (
    <div className={`flex flex-col gap-2.5 rounded-lg border border-line bg-card p-4 ${className}`}>
      <div className="skeleton h-3 w-24 rounded-sm" />
      <div className="skeleton h-2.5 w-3/5 rounded-sm" />
      {wide && <div className="hidden flex-1 rounded-[6px] bg-lib-tile @lg:block" />}
    </div>
  );
}

/** La pantalla entera mientras llega por primera vez: atajos y cuadrícula. */
export function LibrarySkeleton() {
  return (
    <div role="status" aria-label="Cargando tu Biblioteca">
      <div className={BENTO_GRID_CLASS}>
        <BentoSkeletonCell wide className={BENTO_SPANS.week} />
        <BentoSkeletonCell className={BENTO_SPANS.ready} />
        <BentoSkeletonCell className={BENTO_SPANS.uploads} />
        <BentoSkeletonCell className={BENTO_SPANS.published} />
      </div>
      <GridSkeleton />
    </div>
  );
}
