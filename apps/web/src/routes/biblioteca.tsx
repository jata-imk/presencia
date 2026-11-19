import { Loader2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ASSET_UPLOAD_MIME_TYPES, type LibraryAssetDto } from "@presencia/shared";
import { LibraryBento } from "../components/library/LibraryBento.js";
import { LibraryGrid, LibraryList } from "../components/library/LibraryItems.js";
import {
  LibraryEmpty,
  LibraryError,
  LibraryNoResults,
  LibrarySkeleton,
} from "../components/library/LibraryStates.js";
import { LibraryToolbar, type LibraryView } from "../components/library/LibraryToolbar.js";
import { LibraryDropOverlay, UploadPanel } from "../components/library/LibraryUpload.js";
import { ImageViewer } from "../components/ui/ImageViewer.js";
import { useFileDrop } from "../lib/attachments/use-file-drop.js";
import { useTimezone } from "../lib/calendar/use-timezone.js";
import {
  NO_FILTERS,
  activeShortcut,
  assetName,
  chatLabel,
  copyablePrompt,
  groupByDate,
  hasFilters,
  libraryDropVerdict,
  plural,
  queryString,
  shortcutFilters,
  toQuery,
  type LibraryShortcut,
} from "../lib/library/library.js";
import {
  useDebouncedValue,
  useLibraryItems,
  useLibrarySummary,
  useLibraryUploads,
} from "../lib/library/use-library.js";
import { showToast } from "../stores/toast-store.js";

// La pantalla de Biblioteca (F12, `presencia-biblioteca.md`): compone, no
// calcula. Los filtros, los grupos de fecha y los nombres salen de
// lib/library/library.ts; los datos, de sus hooks.
//
// Maneja su propio alto (`handle.ownScroll` en App.tsx): el encabezado y la
// barra de herramientas se quedan fijos y solo se desplaza el contenido, y el
// velo de arrastre y el panel de subida se anclan a lo que se ve, no al final
// de una página larga. La raíz es un `@container`: el acomodo depende del
// ancho que le queda a la pantalla, no del de la ventana.
//
// En este PR abrir una imagen la muestra en el visor. El panel de detalle, la
// selección múltiple y eliminar llegan en el siguiente; "Generar imagen", con
// su backend.

/** Relleno de tipo para `now` antes de la primera respuesta; nunca se pinta. */
const EPOCH = new Date(0);

/** Cuánto se espera a que dejen de teclear antes de buscar. */
const SEARCH_DELAY_MS = 250;

// Fuera del componente: no leen su estado, y así no cambian entre renders (la
// cuadrícula y la lista van en `memo`).
function copyPrompt(asset: LibraryAssetDto) {
  const prompt = copyablePrompt(asset);
  if (!prompt) return;
  navigator.clipboard.writeText(prompt).then(
    () => showToast({ title: "Prompt copiado", tone: "success", durationMs: 2500 }),
    () => showToast({ title: "No se pudo copiar el prompt" }),
  );
}

function announceDownload(asset: LibraryAssetDto) {
  showToast({ title: `Descargando ${assetName(asset)}`, tone: "success", durationMs: 2500 });
}

export function LibraryPage() {
  const timeZone = useTimezone();
  const [filters, setFilters] = useState(NO_FILTERS);
  const [text, setText] = useState("");
  const [view, setView] = useState<LibraryView>("grid");
  const [viewing, setViewing] = useState<LibraryAssetDto | null>(null);

  const query = useDebouncedValue(text.trim(), SEARCH_DELAY_MS);
  const search = useMemo(() => queryString(toQuery(filters, query)), [filters, query]);

  const { summary, error: summaryError, reload: reloadSummary } = useLibrarySummary();
  const list = useLibraryItems(search);
  const { reload: reloadItems, loadMore, prepend } = list;

  const uploads = useLibraryUploads((assets) => {
    reloadSummary();
    // Sin filtros ni búsqueda, lo recién subido va arriba y ya: recargar
    // tiraría las páginas cargadas y el lugar de la lectura. Con ellos no se
    // sabe si lo nuevo los cumple, así que se vuelve a preguntar.
    if (search === "") prepend(assets);
    else reloadItems();
  });
  const fileInput = useRef<HTMLInputElement>(null);
  const pickFiles = () => fileInput.current?.click();
  const { drag, handlers } = useFileDrop({ onFiles: uploads.add, judge: libraryDropVerdict });

  // "Ahora" es el momento en que llegó la consulta: los grupos de fecha no
  // cambian de lugar a media lectura, y sí se recalculan con cada consulta.
  const { items, loadedAt } = list;
  const groups = useMemo(
    () => (items && loadedAt ? groupByDate(items, timeZone, loadedAt) : []),
    [items, timeZone, loadedAt],
  );

  // Al llegar al final de lo cargado se pide la página siguiente. El
  // centinela se observa contra la zona de scroll, con margen para pedirla
  // antes de que se vea el hueco.
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const canLoadMore = list.hasMore && !list.stale && !list.moreFailed;
  useEffect(() => {
    const target = sentinel.current;
    if (!target || !canLoadMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { root: scroller.current, rootMargin: "600px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
    // `items`: tras cada página el centinela puede seguir a la vista (pantalla
    // alta, página corta) y el observador no vuelve a avisar solo.
  }, [canLoadMore, loadMore, items]);

  function toggleShortcut(shortcut: LibraryShortcut) {
    setFilters(
      activeShortcut(filters) === shortcut ? NO_FILTERS : shortcutFilters(shortcut, new Date()),
    );
  }

  function clearAll() {
    setFilters(NO_FILTERS);
    setText("");
  }

  const error = summaryError ?? list.error;
  const searching = query !== "";
  const narrowed = searching || hasFilters(filters);
  // Vacía es "sin filtros ni búsqueda, no hay nada". Mientras llega la
  // respuesta de haberlos quitado (`stale`) todavía no se sabe.
  const empty = !narrowed && !list.stale && items?.length === 0;
  const { network, cardStatus } = filters;
  const match = useMemo(() => ({ network, cardStatus }), [network, cardStatus]);
  const itemProps = {
    groups,
    hasMore: list.hasMore,
    match,
    timeZone,
    // Solo se pintan con `items`, y entonces `loadedAt` ya existe.
    now: loadedAt ?? EPOCH,
    onOpen: setViewing,
    onCopyPrompt: copyPrompt,
    onDownload: announceDownload,
  };

  return (
    <div
      className="@container relative flex h-full flex-col bg-surface"
      // El arrastre vale en toda la pantalla, también sobre el encabezado.
      {...handlers}
    >
      <input
        ref={fileInput}
        type="file"
        multiple
        accept={ASSET_UPLOAD_MIME_TYPES.join(",")}
        className="hidden"
        onChange={(event) => {
          uploads.add(Array.from(event.target.files ?? []));
          // Para que elegir el mismo archivo otra vez vuelva a disparar.
          event.target.value = "";
        }}
      />

      <header className="flex shrink-0 items-center gap-4 px-4 py-3 @lg:px-6 @lg:pt-5 @lg:pb-4 @4xl:px-8">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-lg leading-tight font-semibold tracking-[-0.02em] text-brand @lg:text-xl">
            Biblioteca
          </h1>
          <p className="mt-0.5 hidden text-sm text-fg-secondary @lg:block">
            Todo lo que generas y subes se guarda aquí, con su chat y su card de origen.
          </p>
        </div>
        <button
          type="button"
          onClick={pickFiles}
          className="flex h-11 shrink-0 items-center gap-2 rounded-md bg-primary px-3.5 font-display text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover @lg:h-9"
        >
          <Upload size={15} aria-hidden />
          Subir
        </button>
      </header>

      {/* Vacía no hay nada que filtrar: la barra no aparece. Con error sí se
          queda: si lo que falló fue esta búsqueda o este filtro, quitarlo es
          la salida, y "Reintentar" solo repetiría lo mismo. */}
      {!empty && (
        <LibraryToolbar
          search={text}
          onSearch={setText}
          filters={filters}
          onFilters={setFilters}
          view={view}
          onView={setView}
        />
      )}

      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-[120px] @lg:px-6 @4xl:px-8"
      >
        {error ? (
          <LibraryError
            onRetry={() => {
              reloadSummary();
              reloadItems();
            }}
          />
        ) : !summary || !items ? (
          <LibrarySkeleton />
        ) : empty ? (
          <LibraryEmpty onUpload={pickFiles} />
        ) : (
          <>
            {/* Los atajos se esconden mientras se busca, para no competir con
                los resultados. */}
            {!searching && (
              <LibraryBento
                summary={summary}
                active={activeShortcut(filters)}
                onToggle={toggleShortcut}
              />
            )}
            {items.length === 0 ? (
              <LibraryNoResults query={query} onClear={clearAll} />
            ) : (
              <div
                aria-busy={list.stale}
                className={`transition-opacity ${list.stale ? "opacity-60" : ""}`}
              >
                {narrowed && (
                  <p role="status" className="mb-4 text-sm text-fg-secondary">
                    {/* El total no se sabe hasta cargar todo: con páginas
                        pendientes se dice lo que es cierto. */}
                    {list.hasMore
                      ? `Más de ${String(items.length)} resultados`
                      : plural(items.length, "resultado", "resultados")}
                  </p>
                )}
                {view === "grid" ? <LibraryGrid {...itemProps} /> : <LibraryList {...itemProps} />}
                {list.moreFailed ? (
                  <p className="mt-6 text-center text-sm text-fg-secondary">
                    No pudimos cargar más imágenes.{" "}
                    <button
                      type="button"
                      onClick={loadMore}
                      className="font-semibold text-accent hover:underline"
                    >
                      Reintentar
                    </button>
                  </p>
                ) : (
                  list.hasMore && (
                    <div
                      ref={sentinel}
                      role="status"
                      aria-label="Cargando más imágenes"
                      className="mt-6 flex justify-center text-fg-muted"
                    >
                      <Loader2 size={18} className="animate-spin" aria-hidden />
                    </div>
                  )
                )}
              </div>
            )}
          </>
        )}
      </div>

      <UploadPanel uploads={uploads.uploads} busy={uploads.busy} onClose={uploads.clear} />
      {drag && <LibraryDropOverlay verdict={drag.verdict} count={drag.count} />}

      {viewing && (
        <ImageViewer
          items={[
            {
              assetId: viewing.id,
              alt: viewing.alt ?? "",
              label: assetName(viewing),
            },
          ]}
          subtitle={chatLabel(viewing)}
          downloadable
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
