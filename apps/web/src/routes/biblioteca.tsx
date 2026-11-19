import { Loader2, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  ASSET_UPLOAD_MIME_TYPES,
  assetContentUrl,
  type LibraryAssetDto,
  type LibraryCardRef,
  type LibraryDeleteResultDto,
} from "@presencia/shared";
import { LibraryBento } from "../components/library/LibraryBento.js";
import { LibraryDetail } from "../components/library/LibraryDetail.js";
import {
  LibraryGrid,
  LibraryList,
  type LibrarySelection,
} from "../components/library/LibraryItems.js";
import {
  LibraryDeleteDialog,
  LibrarySelectionBar,
} from "../components/library/LibrarySelection.js";
import {
  LibraryEmpty,
  LibraryError,
  LibraryNoResults,
  LibrarySkeleton,
} from "../components/library/LibraryStates.js";
import { LibraryToolbar, type LibraryView } from "../components/library/LibraryToolbar.js";
import { LibraryDropOverlay, UploadPanel } from "../components/library/LibraryUpload.js";
import { useFileDrop } from "../lib/attachments/use-file-drop.js";
import { useTimezone } from "../lib/calendar/use-timezone.js";
import {
  NO_FILTERS,
  activeShortcut,
  assetName,
  copyablePrompt,
  deleteResultToast,
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
  useLibraryAsset,
  useLibraryItems,
  useLibrarySummary,
  useLibraryUploads,
} from "../lib/library/use-library.js";
import { usePublicationPanelStore } from "../stores/publication-panel-store.js";
import { showToast } from "../stores/toast-store.js";

// La pantalla de Biblioteca (F12, `presencia-biblioteca.md`): compone, no
// calcula. Los filtros, los grupos de fecha y los nombres salen de
// lib/library/library.ts; los datos, de sus hooks.
//
// Maneja su propio alto (`handle.ownScroll` en App.tsx): el encabezado y la
// barra de herramientas se quedan fijos y solo se desplaza el contenido, y el
// velo de arrastre y el panel de subida se anclan a lo que se ve, no al final
// de una página larga.
//
// Dos contenedores (`@container`): la raíz, contra la que se acomoda el panel
// de detalle, y la columna principal, contra la que se acomoda todo lo demás.
// En escritorio el panel empuja la columna, y la cuadrícula y la barra de
// herramientas se acomodan al ancho que les queda, no al de la pantalla.
//
// "Generar imagen" llega con su backend (PR 10).

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

/** Entre una descarga y la siguiente: varias de golpe, el navegador descarta algunas. */
const DOWNLOAD_GAP_MS = 300;

/**
 * "Descargar" de la selección: una descarga por imagen, sin zip. La API la
 * sirve para guardar (Content-Disposition), así que el enlace no navega. El
 * navegador puede pedir permiso la primera vez que una página descarga varias.
 */
function downloadAll(assets: LibraryAssetDto[]) {
  assets.forEach((asset, index) => {
    setTimeout(() => {
      const link = document.createElement("a");
      link.href = `${assetContentUrl(asset.id)}?download=1`;
      document.body.append(link);
      link.click();
      link.remove();
    }, index * DOWNLOAD_GAP_MS);
  });
  showToast({
    title:
      assets.length === 1
        ? `Descargando ${assetName(assets[0]!)}`
        : `Descargando ${String(assets.length)} imágenes`,
    tone: "success",
    durationMs: 2500,
  });
}

const NO_SELECTION: LibrarySelection = new Set();

export function LibraryPage() {
  const timeZone = useTimezone();
  const [filters, setFilters] = useState(NO_FILTERS);
  const [text, setText] = useState("");
  const [view, setView] = useState<LibraryView>("grid");
  const [openId, setOpenId] = useState<string | null>(null);
  const [selection, setSelection] = useState<LibrarySelection>(NO_SELECTION);
  const [deleting, setDeleting] = useState<LibraryAssetDto[] | null>(null);
  const navigate = useNavigate();

  const query = useDebouncedValue(text.trim(), SEARCH_DELAY_MS);
  const search = useMemo(() => queryString(toQuery(filters, query)), [filters, query]);

  const { summary, error: summaryError, reload: reloadSummary } = useLibrarySummary();
  const list = useLibraryItems(search);
  const { reload: reloadItems, loadMore, prepend, remove } = list;
  const { detail, versions, failed: detailFailed, reload: reloadDetail } = useLibraryAsset(openId);

  // Otra búsqueda u otros filtros: lo marcado puede ya no verse, y eliminar
  // algo que no está en pantalla sorprendería.
  useEffect(() => setSelection(NO_SELECTION), [search]);

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

  const onToggleSelect = useCallback((asset: LibraryAssetDto) => {
    setSelection((current) => {
      const next = new Set(current);
      if (next.has(asset.id)) next.delete(asset.id);
      else next.add(asset.id);
      return next;
    });
  }, []);
  const onOpen = useCallback((asset: LibraryAssetDto) => setOpenId(asset.id), []);
  const closeDetail = useCallback(() => setOpenId(null), []);

  // Esc cierra el panel; si no hay panel, quita la selección. Con el diálogo
  // de eliminar abierto, Esc es de él.
  useEffect(() => {
    if (deleting || (!openId && selection.size === 0)) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (openId) setOpenId(null);
      else setSelection(NO_SELECTION);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleting, openId, selection.size]);

  // Lo que muestra el panel: el detalle si ya llegó (es más fresco); si no,
  // lo que trae el listado. Una versión que no está cargada espera al detalle.
  // Si el detalle no se pudo traer, no se cae al listado: lo más probable es
  // que se haya eliminado en otra pestaña, y el panel no puede ofrecer
  // acciones sobre algo que ya no existe.
  const opened =
    openId && !detailFailed
      ? detail?.id === openId
        ? detail
        : (items?.find((item) => item.id === openId) ?? null)
      : null;
  const selected = useMemo(
    () => (items ?? []).filter((item) => selection.has(item.id)),
    [items, selection],
  );

  function viewCard(card: LibraryCardRef & { chatId: string }) {
    // Igual que "Abrir en el chat" del Calendario: se llega al chat con esa
    // card ya abierta en el panel.
    usePublicationPanelStore.getState().openForHandoff(card.chatId, [card.id], card.id);
    void navigate(`/chats/${card.chatId}`);
  }

  function afterDelete(result: LibraryDeleteResultDto) {
    setDeleting(null);
    if (result.deleted.length > 0) {
      remove(result.deleted);
      reloadSummary();
    }
    const gone = new Set(result.deleted);
    if (openId && gone.has(openId)) setOpenId(null);
    // Se eliminó otra versión de la imagen abierta: su historial cambió.
    else if (openId && versions?.some((version) => gone.has(version.assetId))) reloadDetail();
    // Las que no se pudieron quedan marcadas: siguen ahí, y así se ve cuáles.
    setSelection((current) => {
      const left = new Set([...current].filter((id) => !gone.has(id)));
      return left.size === 0 ? NO_SELECTION : left;
    });
    const toast = deleteResultToast(result);
    showToast({
      title: toast.title,
      ...(toast.description ? { description: toast.description } : {}),
      ...(result.blocked.length === 0 ? { tone: "success" as const } : {}),
      durationMs: result.blocked.length === 0 ? 2500 : 6000,
    });
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
    selection,
    onOpen,
    onCopyPrompt: copyPrompt,
    onDownload: announceDownload,
    onToggleSelect,
  };

  return (
    <div
      className="@container relative flex h-full bg-surface"
      // El arrastre vale en toda la pantalla, también sobre el encabezado.
      {...handlers}
    >
      <div className="@container relative flex min-w-0 flex-1 flex-col">
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
                  {view === "grid" ? (
                    <LibraryGrid {...itemProps} />
                  ) : (
                    <LibraryList {...itemProps} />
                  )}
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

        {selected.length > 0 && (
          <LibrarySelectionBar
            count={selected.length}
            onClear={() => setSelection(NO_SELECTION)}
            onDownload={() => downloadAll(selected)}
            onDelete={() => setDeleting(selected)}
          />
        )}
      </div>

      {openId && (
        <>
          {/* Tablet: el panel va encima, con velo. En escritorio empuja y no
              hay velo; en móvil ocupa todo. */}
          <div
            aria-hidden
            onClick={closeDetail}
            className="absolute inset-0 z-20 hidden bg-overlay @lg:block @4xl:hidden"
          />
          <LibraryDetail
            asset={opened}
            versions={versions}
            failed={detailFailed}
            timeZone={timeZone}
            onClose={closeDetail}
            onDelete={(asset) => setDeleting([asset])}
            onCopyPrompt={copyPrompt}
            onDownload={announceDownload}
            onSelectVersion={setOpenId}
            onViewCard={viewCard}
          />
        </>
      )}

      <UploadPanel uploads={uploads.uploads} busy={uploads.busy} onClose={uploads.clear} />
      {drag && <LibraryDropOverlay verdict={drag.verdict} count={drag.count} />}

      {deleting && (
        <LibraryDeleteDialog
          assets={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={afterDelete}
        />
      )}
    </div>
  );
}
