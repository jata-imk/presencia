import { Ban, PlusCircle, Upload, XCircle } from "lucide-react";
import { ATTACHMENTS_PER_MESSAGE } from "@presencia/shared";
import type { DropVerdict } from "../../lib/attachments/use-file-drop.js";

// El overlay al arrastrar archivos sobre la columna del chat (F10.9, Claude
// Design "Chat Adjuntos" §3). Cubre la conversación y el composer, nunca el
// sidebar ni el panel de la card. Si no se puede soltar, lo dice ANTES de
// soltar: un tipo que no se acepta, o que ya hay 10.
export function DropOverlay({ verdict, count }: { verdict: DropVerdict; count: number }) {
  const reject = verdict !== "accept";
  const title =
    verdict === "limit"
      ? `Ya tienes ${String(ATTACHMENTS_PER_MESSAGE)} archivos`
      : verdict === "type"
        ? "Este tipo de archivo no se puede adjuntar"
        : "Suelta para adjuntar";
  const detail =
    verdict === "limit"
      ? "Es el máximo por mensaje. Envía este y adjunta el resto en el siguiente."
      : verdict === "type"
        ? "Solo imágenes, PDF y archivos de texto (.md, .txt, .csv, .json)"
        : "Imágenes, PDF y archivos de texto · hasta 25 MB";

  return (
    <div
      className={`pointer-events-none absolute inset-2 z-30 flex flex-col items-center justify-center gap-3 rounded-[20px] border-2 border-dashed bg-app/95 p-6 text-center sm:inset-3.5 ${
        reject ? "border-error" : "border-line-focus"
      }`}
      role="status"
      aria-live="polite"
    >
      <span
        className={`inline-flex size-[60px] items-center justify-center rounded-[18px] ${
          reject ? "bg-error-bg text-error-fg" : "bg-tint-plum text-brand"
        }`}
      >
        {reject ? <Ban size={26} aria-hidden /> : <Upload size={26} aria-hidden />}
      </span>
      <div className="font-display text-xl font-bold tracking-[-0.01em] text-fg">{title}</div>
      <div
        className={`max-w-[380px] text-[13.5px] leading-normal ${reject ? "text-error-fg" : "text-fg-secondary"}`}
      >
        {detail}
      </div>
      {count > 0 && (
        <div className="mt-1.5 flex -rotate-2 items-center gap-1.5 rounded-[10px] border border-line bg-card py-1.5 pr-2.5 pl-2.5 shadow-lg">
          <span className="font-display text-xs font-semibold text-fg">
            {count === 1 ? "1 archivo" : `${String(count)} archivos`}
          </span>
          {reject ? (
            <XCircle size={14} className="text-error" aria-hidden />
          ) : (
            <PlusCircle size={14} className="text-brand" aria-hidden />
          )}
        </div>
      )}
    </div>
  );
}
