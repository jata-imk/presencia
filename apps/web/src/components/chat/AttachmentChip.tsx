import { AlertCircle, AlertTriangle, Ban, RefreshCw, X } from "lucide-react";
import {
  attachmentWarning,
  formatSize,
  middleEllipsis,
  type PendingAttachment,
} from "../../lib/attachments/attachments.js";
import { FileTile } from "./FileTile.js";

// Un adjunto en el composer (F10.9, Claude Design "Chat Adjuntos" §1-2):
// miniatura o ícono, nombre cortado a la mitad, peso, × para quitarlo, la barra
// de progreso mientras sube y, abajo, el aviso que no bloquea (PDF escaneado,
// archivo largo) o el error que sí.
export function AttachmentChip({
  item,
  onRemove,
  onRetry,
}: {
  item: PendingAttachment;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const uploading = item.status === "uploading";
  const failed = item.status === "error";
  const warning = attachmentWarning(item.dto);
  const wide = failed || warning !== null;
  // Móvil un poco más angosto: los chips van en una sola fila con scroll.
  const width = wide ? "w-[260px]" : "w-[196px] sm:w-[216px]";
  // Un PDF escaneado demasiado largo, o un tipo que no se acepta: quitarlo es
  // la única salida. Lo demás (la red) se puede reintentar.
  const blocking = failed && !item.retryable;

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-xl border ${width} ${
        failed ? "border-error-border bg-error-bg" : "border-transparent bg-surface"
      }`}
    >
      <div className="flex items-center gap-2.5 py-[7px] pr-1.5 pl-[7px]">
        <span className={uploading ? "opacity-55" : undefined}>
          {item.previewUrl ? (
            <img src={item.previewUrl} alt="" className="size-9 shrink-0 rounded-lg object-cover" />
          ) : (
            <FileTile name={item.name} kind={item.kind} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div title={item.name} className="truncate text-[12.5px] font-semibold text-fg">
            {/* Cortado a la mitad para que siempre se vea la extensión. */}
            {middleEllipsis(item.name, wide ? 24 : 17)}
          </div>
          <div
            className={`mt-px truncate text-[11.5px] ${failed ? "text-error-fg" : "text-fg-muted"}`}
          >
            {uploading
              ? `Subiendo… ${String(item.progress)}%`
              : `${formatSize(item.size)}${item.dto?.pages ? ` · ${String(item.dto.pages)} págs.` : ""}`}
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Quitar ${item.name}`}
          className="flex size-[22px] shrink-0 items-center justify-center self-start rounded-md text-fg-muted hover:bg-secondary-hover hover:text-fg"
        >
          <X size={13} strokeWidth={2} />
        </button>
      </div>

      {wide && (
        <div
          className={`flex items-start gap-1.5 border-t px-[9px] pt-1.5 pb-2 text-[11.5px] leading-[1.4] ${
            failed ? "border-error-border text-error-fg" : "border-line-subtle text-fg-secondary"
          }`}
          role={failed ? "alert" : "status"}
        >
          {failed ? (
            blocking ? (
              <Ban size={12} className="mt-px shrink-0" aria-hidden />
            ) : (
              <AlertCircle size={12} className="mt-px shrink-0" aria-hidden />
            )
          ) : (
            <AlertTriangle size={12} className="mt-px shrink-0 text-warning-fg" aria-hidden />
          )}
          <span className="flex-1">{failed ? item.error : warning}</span>
          {failed && item.retryable && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-[3px] font-display font-bold whitespace-nowrap underline"
            >
              <RefreshCw size={11} strokeWidth={2} aria-hidden />
              Reintentar
            </button>
          )}
        </div>
      )}

      {uploading && (
        <div
          className="absolute bottom-0 left-0 h-[3px] rounded-r-[3px] bg-primary transition-[width]"
          style={{ width: `${String(item.progress)}%` }}
          aria-hidden
        />
      )}
    </div>
  );
}
