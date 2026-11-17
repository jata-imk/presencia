import { ArrowUpRight, CircleCheck, Upload } from "lucide-react";
import type { ReactNode } from "react";
import { assetContentUrl, type LibrarySummaryDto } from "@presencia/shared";
import { plural, type LibraryShortcut } from "../../lib/library/library.js";

// Los cuatro atajos de Biblioteca (F12, Claude Design "Presencia -
// Biblioteca" §01). Cada celda aplica su filtro con un clic y lo quita con
// otro. En angosto van en 2×2, sin carrusel: un gesto horizontal escondería
// la mitad (`presencia-biblioteca.md` §3).
//
// El acomodo sale del orden de las celdas y de cuánto abarca cada una; no hay
// posiciones escritas, así que las tres rejillas (2, 3 y 2fr·1fr·1fr) usan el
// mismo marcado.

/** Cuántas miniaturas caben en "Listas para publicar". */
const READY_THUMBS = 3;

function Cell({
  on,
  onClick,
  className,
  children,
}: {
  on: boolean;
  onClick: () => void;
  className: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex min-w-0 overflow-hidden rounded-lg border border-line p-3 text-left transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus @lg:p-3.5 @4xl:p-4 ${
        on ? "bg-secondary ring-2 ring-accent ring-inset" : "bg-card"
      } ${className}`}
    >
      {children}
    </button>
  );
}

function Heading({ title, sub }: { title: string; sub: ReactNode }) {
  return (
    <span className="block min-w-0 flex-1">
      <span className="block font-display text-base font-semibold text-brand @4xl:text-[15px]">
        {title}
      </span>
      <span className="mt-0.5 block text-xs text-fg-secondary">{sub}</span>
    </span>
  );
}

/** Miniaturas a todo el alto de su fila, cada una con su proporción real. */
function Thumbs({ ids, className }: { ids: string[]; className: string }) {
  return (
    <span className={`flex min-w-0 overflow-hidden ${className}`}>
      {ids.map((id) => (
        <img
          key={id}
          src={assetContentUrl(id)}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-auto shrink-0 rounded-[6px] bg-lib-tile object-cover"
        />
      ))}
    </span>
  );
}

function IconBox({ tone, children }: { tone: "info" | "success"; children: ReactNode }) {
  return (
    <span
      className={`flex size-8 shrink-0 items-center justify-center rounded-md ${
        tone === "info" ? "bg-info-bg text-info-fg" : "bg-success-bg text-success-fg"
      }`}
    >
      {children}
    </span>
  );
}

export function LibraryBento({
  summary,
  active,
  onToggle,
}: {
  summary: LibrarySummaryDto;
  active: LibraryShortcut | null;
  onToggle: (shortcut: LibraryShortcut) => void;
}) {
  const { generatedThisWeek, readyToPublish, uploaded, published } = summary;
  return (
    <div
      role="group"
      aria-label="Atajos"
      className="mb-7 grid grid-cols-2 gap-2 @lg:grid-cols-3 @lg:grid-rows-[150px_auto] @lg:gap-3 @4xl:grid-cols-[2fr_1fr_1fr] @4xl:grid-rows-[118px_88px]"
    >
      <Cell
        on={active === "week"}
        onClick={() => onToggle("week")}
        className="flex-col gap-3 @lg:col-span-2 @4xl:col-span-1 @4xl:row-span-2"
      >
        <span className="flex items-start gap-2">
          <Heading
            title="Generadas esta semana"
            sub={plural(generatedThisWeek.count, "imagen", "imágenes")}
          />
          <ArrowUpRight size={15} className="shrink-0 text-fg-muted" aria-hidden />
        </span>
        <Thumbs
          ids={generatedThisWeek.assetIds}
          className="h-10 gap-2 @lg:h-auto @lg:min-h-0 @lg:flex-1"
        />
      </Cell>

      <Cell
        on={active === "ready"}
        onClick={() => onToggle("ready")}
        className="flex-col gap-3 @4xl:col-span-2 @4xl:flex-row @4xl:items-start"
      >
        <Heading
          title="Listas para publicar"
          sub={
            <>
              <span className="@lg:hidden">{readyToPublish.count} en borradores</span>
              <span className="hidden @lg:inline">
                {plural(readyToPublish.count, "elegida", "elegidas")} en cards en borrador
              </span>
            </>
          }
        />
        <Thumbs
          ids={readyToPublish.assetIds.slice(0, READY_THUMBS)}
          className="h-10 shrink gap-1.5 @lg:h-12 @4xl:h-[84px]"
        />
      </Cell>

      <Cell
        on={active === "uploads"}
        onClick={() => onToggle("uploads")}
        className="items-start gap-2.5"
      >
        <IconBox tone="info">
          <Upload size={16} aria-hidden />
        </IconBox>
        <Heading title="Subidas por ti" sub={plural(uploaded.count, "imagen", "imágenes")} />
      </Cell>

      <Cell
        on={active === "published"}
        onClick={() => onToggle("published")}
        className="items-start gap-2.5 @lg:col-span-2 @4xl:col-span-1"
      >
        <IconBox tone="success">
          <CircleCheck size={16} aria-hidden />
        </IconBox>
        <Heading title="Publicadas" sub={`${String(published.count)} en cards publicadas`} />
      </Cell>
    </div>
  );
}
