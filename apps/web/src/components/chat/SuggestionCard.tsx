import { TREND_SIGNAL_LABELS, type TrendSignal } from "@presencia/shared";

// Tarjeta de sugerencia (Chat Module.html, ChatEmptyState).
//
// El mockup traía dos tarjetas de "Tendencia" con métrica ("+24%", "+18%") y
// F6 no las pintó porque no había datos. F9 trae las tendencias de verdad,
// pero SIN el porcentaje: `presencia-ritmo.md` §8 lo prohíbe explícitamente
// para tendencias —no hay fuente real de la que saque el número— y deja en su
// lugar la señal cualitativa. El doc del Chat, que es anterior, pedía ese
// "+24%"; se corrigió en este mismo PR.
//
// Lo que sí llevan es la fuente citada, que es la otra mitad de la regla.
export function SuggestionCard({
  emoji,
  title,
  description,
  senal,
  fuente,
  onClick,
}: {
  emoji: string;
  title: string;
  description: string;
  /** Presente solo en las tarjetas de tendencia. */
  senal?: TrendSignal;
  /** El medio donde se vio. Obligatorio si hay señal: sin fuente no se pinta. */
  fuente?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-1.5 rounded-xl border border-line bg-card px-4 py-3.5 text-left shadow-xs transition-all hover:-translate-y-px hover:border-line-focus hover:shadow-md"
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0 text-lg">{emoji}</span>
        <div className="min-w-0">
          {senal && (
            <span className="mb-1 inline-block rounded-full bg-accent-cta px-2 py-0.5 text-[10px] font-bold text-accent-cta-fg">
              Tendencia · {TREND_SIGNAL_LABELS[senal]}
            </span>
          )}
          <p className="text-[13px] leading-tight font-semibold text-fg">{title}</p>
          <p className="mt-0.5 text-xs leading-snug text-fg-secondary">{description}</p>
          {fuente && <p className="mt-1.5 text-[10px] text-fg-muted">Visto en {fuente}</p>}
        </div>
      </div>
    </button>
  );
}
