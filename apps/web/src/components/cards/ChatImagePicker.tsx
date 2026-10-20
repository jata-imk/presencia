import { useEffect, useId, useRef, useState } from "react";
import { toCalendarDate } from "@internationalized/date";
import { Check, ImageIcon, Loader2, Upload, X } from "lucide-react";
import { ASSET_UPLOAD_MIME_TYPES, type AttachmentDto } from "@presencia/shared";
import { middleEllipsis } from "../../lib/attachments/attachments.js";
import { formatTime, todayIn, zonedFromIso } from "../../lib/calendar/tz.js";
import { useTimezone } from "../../lib/calendar/use-timezone.js";
import { Modal } from "../ui/Modal.js";

// "Usar una que adjuntaste" (F10.9, Claude Design "Chat Adjuntos" §5): las
// imágenes que el creator ya mandó en el chat de la card, para dejar una como
// la imagen de la publicación. La elige él: el modelo nunca toca la imagen de
// una card (ADR-005). Es un modal centrado y no el popover/hoja del diseño:
// en el panel la zona de imagen cambia de alto con cada estado, y un modal se
// ve igual desde el botón y desde el menú ⋯, en desktop y en el celular.

/** Lo que la card ofrece para traer una imagen del chat. */
export interface ChatImageSource {
  /** Las imágenes enviadas en el chat, la más nueva primero. */
  list: () => Promise<AttachmentDto[]>;
  /** Resuelve `true` si quedó como la imagen (el toast ya avisó si no). */
  use: (attachmentId: string) => Promise<boolean>;
  /** Una línea para el pie: qué le pasa a la imagen (el recorte de un carrusel). */
  note?: string;
}

/** "Hoy 10:42", "Ayer 18:05", "12 oct": cuándo se mandó, en la zona del creator. */
export function sentAtLabel(iso: string, timeZone: string): string {
  const at = zonedFromIso(iso, timeZone);
  const days = toCalendarDate(at).compare(todayIn(timeZone));
  if (days === 0) return `Hoy ${formatTime(at)}`;
  if (days === -1) return `Ayer ${formatTime(at)}`;
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone })
    .format(at.toDate())
    .replace(/\.$/, "");
}

export function ChatImagePicker({
  source,
  onUploadOwn,
  onClose,
}: {
  source: ChatImageSource;
  /** El estado vacío ofrece subir la propia, con el mismo camino que "Subir la mía". */
  onUploadOwn: (file: File) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const timeZone = useTimezone();
  const [images, setImages] = useState<AttachmentDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [using, setUsing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    source
      .list()
      .then((list) => {
        if (!alive) return;
        setImages(list);
        // Con una sola no hay nada que elegir: queda marcada.
        if (list.length === 1) setSelected(list[0]!.id);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
    // Sin `source`: cambia en cada render de la card. Se pide al abrir y al reintentar.
  }, [attempt]);

  function pick(id = selected) {
    if (!id || using) return;
    setUsing(true);
    void source.use(id).then((ok) => {
      setUsing(false);
      if (ok) onClose();
    });
  }

  const count = images?.length ?? 0;
  return (
    <Modal
      onClose={onClose}
      labelledBy={titleId}
      maxWidth="max-w-md"
      panelClassName="flex max-h-[85vh] flex-col py-3"
    >
      <div className="flex items-center gap-2 px-4 pb-2.5">
        <h2 id={titleId} className="flex-1 font-display text-sm font-bold text-fg">
          Imágenes de este chat{count > 0 ? ` · ${String(count)}` : ""}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="flex size-8 items-center justify-center rounded-md text-fg-secondary hover:bg-surface hover:text-fg"
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      {failed ? (
        <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
          <p className="text-sm text-fg-secondary">No se pudieron cargar las imágenes del chat.</p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="text-xs font-semibold text-accent underline-offset-2 hover:underline"
          >
            Reintentar
          </button>
        </div>
      ) : images === null ? (
        <div className="grid grid-cols-3 gap-2 px-4" aria-busy="true" aria-label="Cargando">
          {[0, 1, 2].map((i) => (
            <span key={i} className="aspect-square animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      ) : images.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-5 pt-4 pb-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-surface text-fg-muted">
            <ImageIcon size={22} aria-hidden />
          </span>
          <p className="font-display text-sm font-bold text-fg">
            Aún no adjuntas imágenes en este chat
          </p>
          <p className="max-w-[260px] text-xs leading-relaxed text-fg-secondary">
            Arrastra una al chat o súbela directamente a esta publicación.
          </p>
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
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="mt-1.5 flex items-center gap-1.5 rounded-md border border-line bg-card px-2.5 py-1.5 text-xs font-medium text-fg-secondary"
          >
            <Upload size={13} strokeWidth={1.75} aria-hidden />
            Subir la mía
          </button>
        </div>
      ) : (
        <>
          <div
            role="radiogroup"
            aria-labelledby={titleId}
            className="grid min-h-0 grid-cols-3 gap-2 overflow-y-auto px-4 pt-0.5 pb-1"
          >
            {images.map((image) => {
              const checked = image.id === selected;
              return (
                <button
                  key={image.id}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-label={image.filename}
                  onClick={() => setSelected(image.id)}
                  onDoubleClick={() => {
                    setSelected(image.id);
                    pick(image.id);
                  }}
                  className="flex min-w-0 flex-col gap-1 rounded-lg text-left"
                >
                  <span
                    className={`relative block overflow-hidden rounded-lg bg-surface outline-offset-2 ${
                      checked ? "outline-2 outline-primary" : ""
                    }`}
                  >
                    <img
                      src={image.url}
                      alt=""
                      loading="lazy"
                      className="aspect-square w-full object-cover"
                    />
                    {checked && (
                      <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-fg">
                        <Check size={12} strokeWidth={3} aria-hidden />
                      </span>
                    )}
                  </span>
                  <span className="truncate text-[11px] text-fg-secondary" title={image.filename}>
                    {middleEllipsis(image.filename, 18)}
                  </span>
                  <span className="-mt-1 text-[10.5px] text-fg-muted">
                    {sentAtLabel(image.createdAt, timeZone)}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-2.5 flex items-center gap-2 border-t border-line px-4 pt-3">
            <span className="flex-1 text-[11.5px] leading-snug text-fg-muted">
              {source.note ? `${source.note} · sin costo de cuota` : "Sin costo de cuota"}
            </span>
            <button
              type="button"
              onClick={() => pick()}
              disabled={!selected || using}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg disabled:cursor-not-allowed disabled:opacity-50"
            >
              {using && <Loader2 size={13} className="animate-spin" aria-hidden />}
              {using ? "Usando…" : "Usar imagen"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
