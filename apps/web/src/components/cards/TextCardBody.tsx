import type { CardContent, SocialNetwork } from "@presencia/shared";
import { Hashtags } from "./Hashtags.js";

type TextFirstContent = Extract<CardContent, { archetype: "text_first" }>;

// Portado de CardText (arquetipos.jsx) — el mockup envuelve el texto en un
// mockup de post de LinkedIn con avatar/nombre/título de ejemplo ("Jose
// Tejero · Diseñador & Creador de contenido IA"). Se omite esa identidad
// falsa (no es el perfil real conectado) y el tiempo de lectura estimado
// (dato inventado); se conserva el conteo de caracteres — ese sí es
// real, calculado del contenido tal cual.
const MAX_CHARS: Partial<Record<SocialNetwork, number>> = {
  linkedin: 3000,
  x: 280,
  threads: 500,
};

export function TextCardBody({
  content,
  network,
}: {
  content: TextFirstContent;
  network: SocialNetwork;
}) {
  const max = MAX_CHARS[network];
  const over = max !== undefined && content.body.length > max;

  return (
    <div className="px-4 py-3.5">
      <div className="rounded-lg border border-line bg-app px-3.5 py-3">
        <p className="text-sm leading-relaxed whitespace-pre-wrap text-fg">{content.body}</p>
      </div>
      {max !== undefined && (
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-line">
            <div
              className={`h-full rounded-full ${over ? "bg-error" : "bg-success"}`}
              style={{ width: `${Math.min((content.body.length / max) * 100, 100)}%` }}
            />
          </div>
          <span className={`text-[11px] font-semibold ${over ? "text-error" : "text-fg-muted"}`}>
            {content.body.length} / {max}
          </span>
        </div>
      )}
      <Hashtags tags={content.hashtags} />
    </div>
  );
}
