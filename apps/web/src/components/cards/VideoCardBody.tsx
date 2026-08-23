import { Clapperboard, Video } from "lucide-react";
import type { CardContent } from "@presencia/shared";
import { Hashtags } from "./Hashtags.js";

type VideoScriptContent = Extract<CardContent, { archetype: "video_script" }>;

// Portado de HookBlock/ScriptBlock/CaptionBlock (arquetipos.jsx). Se omiten
// VideoMeta (duración, canción en tendencia — no existen en nuestro
// content schema, son datos de muestra del mockup) y las "variantes" de
// hook (no generamos variantes hoy). script se muestra como un solo bloque
// de texto: nuestro schema lo guarda así (string), no como beats
// numerados — el mockup usaba una estructura más rica que la que tenemos.
export function VideoCardBody({
  content,
  showWaitingForMaterial,
}: {
  content: VideoScriptContent;
  /** true cuando la card sigue en draft: Presencia no genera video (F10/F11 pendiente), el creator sube el suyo. */
  showWaitingForMaterial: boolean;
}) {
  return (
    <div>
      {showWaitingForMaterial && (
        <div className="mx-4 mt-3.5 flex items-center gap-3 rounded-lg border border-dashed border-warning-border bg-warning-bg px-3.5 py-3">
          <Clapperboard size={20} className="shrink-0 text-warning" strokeWidth={1.75} />
          <div className="flex-1">
            <p className="text-xs font-semibold text-warning">
              Guion listo — esperando tu material
            </p>
            <p className="text-[11px] text-fg-secondary">
              Graba el video siguiendo el guion y súbelo para programar.
            </p>
          </div>
          <button
            type="button"
            disabled
            title="Próximamente"
            className="shrink-0 cursor-not-allowed rounded-md border border-warning-border bg-card px-2.5 py-1.5 text-xs font-semibold text-warning opacity-70"
          >
            Subir video
          </button>
        </div>
      )}

      <div className="px-4 py-3">
        <div className="mb-2 flex items-center gap-1.5">
          <span className="text-sm">🎣</span>
          <span className="text-xs font-bold text-fg">Hook</span>
          <span className="text-[10px] text-fg-muted">· primeros 3 segundos</span>
        </div>
        <div className="rounded-lg border border-ai-border bg-tint-pink px-3.5 py-3">
          <p className="text-base leading-snug font-semibold text-brand">{content.hook}</p>
        </div>

        <div className="mt-3.5 mb-1.5 flex items-center gap-1.5">
          <span className="text-sm">🎬</span>
          <span className="text-xs font-bold text-fg">Guion</span>
        </div>
        <p className="text-sm leading-relaxed whitespace-pre-wrap text-fg">{content.script}</p>

        <div className="mt-3.5 border-t border-line pt-3">
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="text-sm">📝</span>
            <span className="text-xs font-bold text-fg">Caption</span>
          </div>
          <p className="text-sm leading-relaxed text-fg">{content.caption}</p>
        </div>

        {content.recordingNotes && (
          <div className="mt-2.5 flex items-start gap-1.5 rounded-md border border-line bg-app px-2.5 py-2">
            <Video size={12} className="mt-0.5 shrink-0 text-fg-muted" strokeWidth={1.75} />
            <p className="text-xs text-fg-secondary italic">{content.recordingNotes}</p>
          </div>
        )}
        <Hashtags tags={content.hashtags} />
      </div>
    </div>
  );
}
