import { Ban, PlusCircle, Upload, XCircle } from "lucide-react";
import {
  ATTACHMENTS_PER_MESSAGE,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_TEXT_EXTENSIONS,
} from "@presencia/shared";
import { formatSize } from "../../lib/attachments/attachments.js";
import type { DropVerdict } from "../../lib/attachments/use-file-drop.js";

// El overlay al arrastrar archivos sobre la columna del chat (F10.9, Claude
// Design "Chat Adjuntos" §3). Cubre la conversación y el composer, nunca el
// sidebar ni el panel de la card. Si no se puede soltar, lo dice ANTES de
// soltar: un tipo que no se acepta, o que ya hay 10.
export function DropOverlay({
  verdict,
  count,
  tall = false,
}: {
  verdict: DropVerdict;
  count: number;
  /**
   * La zona es más alta que la pantalla (la de chat nuevo, que hace scroll):
   * el aviso va pegado a lo visible, no al centro de toda la zona.
   */
  tall?: boolean;
}) {
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
        ? `Solo imágenes, PDF y archivos de texto (${ATTACHMENT_TEXT_EXTENSIONS.join(", ")})`
        : `Imágenes, PDF y archivos de texto · hasta ${formatSize(ATTACHMENT_MAX_BYTES)}`;

  // El velo cubre la columna completa y el borde punteado va adentro, con su
  // margen: si el velo tuviera el margen del borde, la conversación se
  // asomaría sin velo por esa franja (QA de Jose, 2026-10-20).
  return (
    <div
      className="pointer-events-none absolute inset-0 z-30 bg-app/95"
      role="status"
      aria-live="polite"
    >
      <div
        className={`absolute inset-2 rounded-[20px] border-2 border-dashed p-6 text-center sm:inset-3.5 ${
          reject ? "border-error" : "border-line-focus"
        }`}
      >
        <div
          className={`flex flex-col items-center justify-center gap-3 ${
            tall ? "sticky top-[30vh]" : "h-full"
          }`}
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
      </div>
    </div>
  );
}
