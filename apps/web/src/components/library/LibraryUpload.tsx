import { Ban, CircleAlert, CircleCheck, CloudUpload, Image as ImageIcon, X } from "lucide-react";
import { formatSize } from "../../lib/attachments/attachments.js";
import { UPLOAD_TYPE_ERROR, uploadsTitle, type LibraryUpload } from "../../lib/library/library.js";

// Subir a Biblioteca (F12, Claude Design "Presencia - Biblioteca" §08): el
// velo al arrastrar archivos sobre la pantalla y el panel con el avance de
// cada uno.

/**
 * El velo de "suelta aquí". Cubre la pantalla de Biblioteca, no el sidebar ni
 * el topbar. Si nada de lo que se arrastra es una imagen que aceptamos, lo
 * dice antes de soltar.
 */
export function LibraryDropOverlay({ verdict }: { verdict: "accept" | "type" | "limit" }) {
  const reject = verdict !== "accept";
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-0 z-30 bg-lib-veil p-4"
    >
      <div
        className={`flex size-full flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed bg-lib-drop p-6 text-center ${
          reject ? "border-error" : "border-accent"
        }`}
      >
        <div
          className={`flex size-16 items-center justify-center rounded-[18px] ${
            reject ? "bg-error-bg text-error-fg" : "bg-primary text-primary-fg"
          }`}
        >
          {reject ? <Ban size={30} aria-hidden /> : <CloudUpload size={30} aria-hidden />}
        </div>
        <div className="mt-1.5 font-display text-[22px] font-semibold text-brand">
          {reject ? "Este archivo no se puede subir" : "Suelta para subir a tu Biblioteca"}
        </div>
        <div className={`text-base ${reject ? "text-error-fg" : "text-fg-secondary"}`}>
          {reject ? UPLOAD_TYPE_ERROR : "JPG, PNG o WebP de hasta 10 MB"}
        </div>
      </div>
    </div>
  );
}

function UploadState({ upload }: { upload: LibraryUpload }) {
  if (upload.status === "error") {
    return <CircleAlert size={17} className="mt-1.5 shrink-0 text-error" aria-label="Con error" />;
  }
  if (upload.status === "done") {
    return <CircleCheck size={17} className="mt-1.5 shrink-0 text-success" aria-label="Subido" />;
  }
  return (
    <span className="mt-1.5 shrink-0 text-xs font-medium text-fg-secondary tabular-nums">
      {upload.status === "queued" ? "En espera" : `${String(upload.percent)}%`}
    </span>
  );
}

/** El panel flotante con una fila por archivo. Abajo a la derecha; a lo ancho en angosto. */
export function UploadPanel({
  uploads,
  busy,
  onClose,
}: {
  uploads: LibraryUpload[];
  /** Hay subidas en curso: el panel no se puede cerrar todavía. */
  busy: boolean;
  onClose: () => void;
}) {
  if (uploads.length === 0) return null;
  return (
    <div
      role="status"
      aria-label="Subidas"
      className="absolute right-3 bottom-3 left-3 z-20 flex max-h-[60%] flex-col overflow-hidden rounded-lg border border-line bg-card shadow-xl @lg:right-6 @lg:bottom-6 @lg:left-auto @lg:w-[380px]"
    >
      <div className="flex h-12 shrink-0 items-center gap-2 pr-2 pl-4">
        <span className="flex-1 font-display text-base font-semibold text-brand">
          {uploadsTitle(uploads)}
        </span>
        {!busy && (
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-md text-fg-secondary transition-colors hover:bg-secondary"
          >
            <X size={16} aria-hidden />
          </button>
        )}
      </div>
      <ul className="min-h-0 overflow-y-auto">
        {uploads.map((upload) => (
          <li
            key={upload.id}
            className={`flex items-start gap-3 border-t border-line px-4 py-3 ${
              upload.status === "error" ? "bg-error-bg" : ""
            }`}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-lib-tile text-fg-muted">
              <ImageIcon size={15} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
                  {upload.name}
                </span>
                <span className="text-xs whitespace-nowrap text-fg-muted">
                  {formatSize(upload.sizeBytes)}
                </span>
              </span>
              {upload.error && (
                <span className="mt-1 block text-sm leading-normal text-error-fg">
                  {upload.error}
                </span>
              )}
              {upload.status === "uploading" && (
                <span className="mt-2 block h-1 overflow-hidden rounded-full bg-secondary">
                  <span
                    className="block h-full rounded-full bg-accent transition-[width]"
                    style={{ width: `${String(upload.percent)}%` }}
                  />
                </span>
              )}
            </span>
            <UploadState upload={upload} />
          </li>
        ))}
      </ul>
    </div>
  );
}
