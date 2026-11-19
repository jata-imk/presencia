import { useId, useRef, useState } from "react";
import { Check, ImageIcon, Loader2, Search, Upload, X } from "lucide-react";
import {
  ASSET_UPLOAD_MIME_TYPES,
  assetContentUrl,
  LIBRARY_SEARCH_MAX,
  type LibraryAssetDto,
  type LibraryOrigin,
} from "@presencia/shared";
import {
  assetName,
  NO_FILTERS,
  ORIGIN_LABELS,
  queryString,
  toQuery,
} from "../../lib/library/library.js";
import { useDebouncedValue, useLibraryItems, useLoadMore } from "../../lib/library/use-library.js";
import { Modal } from "../ui/Modal.js";

// "Elegir de Biblioteca" (F12 PR5, Claude Design "Presencia - Biblioteca" →
// ElegirDeBiblioteca): cualquier imagen del creator, para dejarla como la de
// la card o la de un slide. Lo elige él (ADR-005). El mismo buscador que la
// pantalla, sin los filtros de red y estado: aquí se busca una imagen, no se
// administra la Biblioteca. Modal centrado, igual que "Usar una que
// adjuntaste", por la misma razón (ver ChatImagePicker).

/** Lo que la card ofrece para traer una imagen de Biblioteca. */
export interface LibraryImageSource {
  /** "Para la imagen de tu card de Instagram", "Para el slide 3 de tu carrusel…". */
  subtitle: string;
  /** Resuelve `true` si quedó como la imagen (el toast ya avisó si no). */
  use: (assetId: string) => Promise<boolean>;
  /** Una línea para el pie: qué le pasa a la imagen (el recorte de un carrusel). */
  note?: string;
}

type Tab = "all" | LibraryOrigin;

const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "generated", label: "Generadas con IA" },
  { value: "uploaded", label: "Subidas por ti" },
];

/** La consulta del modal: el texto y la pestaña, nada más. */
export function pickerQuery(tab: Tab, text: string): string {
  return queryString(toQuery({ ...NO_FILTERS, origin: tab === "all" ? null : tab }, text.trim()));
}

export function LibraryPicker({
  source,
  busy = false,
  onUploadOwn,
  onClose,
}: {
  source: LibraryImageSource;
  /** La card está ocupada (generando, subiendo): no se puede cambiar la imagen ahora. */
  busy?: boolean;
  /** "Subir desde tu equipo": el mismo camino que "Subir la mía" (nace en la card). */
  onUploadOwn: (file: File) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const [text, setText] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [selected, setSelected] = useState<LibraryAssetDto | null>(null);
  const [using, setUsing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const debounced = useDebouncedValue(text, 250);
  const list = useLibraryItems(pickerQuery(tab, debounced));
  const { items } = list;
  const canLoadMore = list.hasMore && !list.stale && !list.moreFailed;
  const { scroller, sentinel } = useLoadMore(canLoadMore, list.loadMore, items);
  const filtered = text.trim() !== "" || tab !== "all";

  function use(asset = selected) {
    if (!asset || using || busy) return;
    setUsing(true);
    void source.use(asset.id).then((ok) => {
      setUsing(false);
      if (ok) onClose();
    });
  }

  function uploadOwn() {
    fileInput.current?.click();
  }

  return (
    <Modal
      onClose={onClose}
      labelledBy={titleId}
      maxWidth="max-w-[760px]"
      panelClassName="flex h-[min(640px,88vh)] flex-col overflow-hidden"
    >
      <input
        ref={fileInput}
        type="file"
        accept={ASSET_UPLOAD_MIME_TYPES.join(",")}
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) {
            onUploadOwn(file);
            onClose();
          }
        }}
      />

      <div className="flex items-start gap-3 pt-5 pr-3 pb-3 pl-5 sm:pl-6">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="font-display text-lg font-semibold text-brand">
            Elegir de Biblioteca
          </h2>
          <p className="mt-0.5 text-[13px] text-fg-secondary">{source.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="flex size-9 shrink-0 items-center justify-center rounded-md text-fg-secondary hover:bg-secondary hover:text-fg"
        >
          <X size={18} aria-hidden />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 px-5 pb-3.5 sm:px-6">
        <label className="flex h-9 min-w-0 flex-[1_1_240px] items-center gap-2 rounded-md border border-line bg-secondary px-3 focus-within:border-line-focus">
          <Search size={15} className="shrink-0 text-fg-muted" aria-hidden />
          <input
            type="text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            aria-label="Buscar en tu Biblioteca"
            maxLength={LIBRARY_SEARCH_MAX}
            placeholder="Busca por prompt, texto alternativo o chat"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-muted"
          />
          {text && (
            <button
              type="button"
              aria-label="Borrar búsqueda"
              onClick={() => setText("")}
              className="flex shrink-0 text-fg-muted hover:text-fg"
            >
              <X size={14} aria-hidden />
            </button>
          )}
        </label>
        <div
          role="group"
          aria-label="Origen"
          className="flex max-w-full overflow-x-auto rounded-md border border-line bg-secondary p-0.5"
        >
          {TABS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={tab === value}
              onClick={() => setTab(value)}
              className={`flex h-[30px] shrink-0 items-center rounded-[6px] px-3 font-display text-[13px] font-medium whitespace-nowrap transition-colors ${
                tab === value ? "bg-card text-brand shadow-md" : "text-fg-secondary hover:text-fg"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto border-t border-line px-5 pt-0.5 pb-5 sm:px-6"
      >
        {list.error && !items ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <p className="text-sm text-fg-secondary">
              No pudimos cargar tu Biblioteca. Tus imágenes siguen guardadas.
            </p>
            <button
              type="button"
              onClick={list.reload}
              className="text-xs font-semibold text-accent underline-offset-2 hover:underline"
            >
              Reintentar
            </button>
          </div>
        ) : !items ? (
          <div
            className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-2.5 pt-3.5 sm:grid-cols-[repeat(auto-fill,minmax(108px,1fr))]"
            aria-busy="true"
            aria-label="Cargando"
          >
            {Array.from({ length: 10 }, (_, i) => (
              <span key={i} className="aspect-square animate-pulse rounded-[10px] bg-lib-tile" />
            ))}
          </div>
        ) : items.length === 0 ? (
          filtered ? (
            <p className="px-4 py-14 text-center text-sm text-fg-secondary">
              Sin resultados. Prueba con otras palabras.
            </p>
          ) : (
            <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
              <span className="flex size-12 items-center justify-center rounded-xl bg-secondary text-fg-muted">
                <ImageIcon size={22} aria-hidden />
              </span>
              <p className="font-display text-sm font-bold text-fg">
                Aún no tienes imágenes en tu Biblioteca
              </p>
              <p className="max-w-[300px] text-xs leading-relaxed text-fg-secondary">
                Aquí aparece cada imagen que generas o subes. Sube una desde tu equipo para usarla
                en esta publicación.
              </p>
            </div>
          )
        ) : (
          <>
            <div
              role="radiogroup"
              aria-labelledby={titleId}
              className={`grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-2.5 pt-3.5 transition-opacity sm:grid-cols-[repeat(auto-fill,minmax(108px,1fr))] ${
                list.stale ? "opacity-60" : ""
              }`}
            >
              {items.map((asset) => {
                const checked = asset.id === selected?.id;
                const name = assetName(asset);
                return (
                  <button
                    key={asset.id}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    aria-label={name}
                    title={name}
                    onClick={() => setSelected(checked ? null : asset)}
                    onDoubleClick={() => {
                      setSelected(asset);
                      use(asset);
                    }}
                    className={`relative flex aspect-square items-center justify-center rounded-[10px] transition-[padding,background-color] duration-150 ease-out ${
                      checked
                        ? "bg-tint-plum p-3.5 ring-2 ring-accent"
                        : "bg-lib-tile p-2 hover:ring-1 hover:ring-accent"
                    }`}
                  >
                    <img
                      src={assetContentUrl(asset.id)}
                      alt=""
                      loading="lazy"
                      width={asset.width}
                      height={asset.height}
                      className="max-h-full max-w-full rounded-[5px] object-contain"
                    />
                    {checked && (
                      <span className="absolute top-1.5 left-1.5 flex size-[22px] items-center justify-center rounded-full bg-primary text-primary-fg">
                        <Check size={13} strokeWidth={3} aria-hidden />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div ref={sentinel} aria-hidden className="h-px" />
            {list.loadingMore && (
              <div className="flex justify-center pt-4">
                <Loader2
                  size={18}
                  className="animate-spin text-fg-muted"
                  aria-label="Cargando más"
                />
              </div>
            )}
            {list.moreFailed && (
              <div className="flex justify-center pt-4">
                <button
                  type="button"
                  onClick={list.loadMore}
                  className="text-xs font-semibold text-accent underline-offset-2 hover:underline"
                >
                  No pudimos cargar más. Reintentar
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line bg-app px-5 py-3.5 sm:px-6">
        <div className="flex min-w-0 flex-[1_1_200px] items-center">
          {busy ? (
            <span className="text-xs text-fg-muted">
              Espera a que termine la imagen que se está generando
            </span>
          ) : selected ? (
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-fg">{assetName(selected)}</p>
              <p className="truncate text-xs text-fg-secondary">
                {`${String(selected.width)} × ${String(selected.height)} · ${ORIGIN_LABELS[selected.origin]}`}
                {source.note ? ` · ${source.note}` : ""}
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={uploadOwn}
              className="flex items-center gap-1.5 text-[13px] text-accent underline-offset-2 hover:underline"
            >
              <Upload size={14} aria-hidden />
              Subir desde tu equipo
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-[38px] rounded-md border border-line bg-card px-4 font-display text-[13px] font-semibold text-brand hover:bg-secondary"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => use()}
            disabled={!selected || using || busy}
            className="flex h-[38px] items-center gap-1.5 rounded-md bg-primary px-4 font-display text-[13px] font-semibold text-primary-fg hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-secondary disabled:text-fg-muted"
          >
            {using && <Loader2 size={14} className="animate-spin" aria-hidden />}
            {using ? "Usando…" : "Usar esta imagen"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
