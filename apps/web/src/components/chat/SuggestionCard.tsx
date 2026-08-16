// Tarjeta de sugerencia (Chat Module.html, ChatEmptyState). Solo las 4
// genéricas del mockup — las 2 de "Tendencia" con métrica (+24%, +18%) no
// se pintan: no hay datos reales de Ritmo, y un porcentaje inventado es
// justo lo que este proyecto decidió nunca hacer (ver WeekStrip/TimeChips,
// F6 PR4).
export function SuggestionCard({
  emoji,
  title,
  description,
  onClick,
}: {
  emoji: string;
  title: string;
  description: string;
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
        <div>
          <p className="text-[13px] leading-tight font-semibold text-fg">{title}</p>
          <p className="mt-0.5 text-xs leading-snug text-fg-secondary">{description}</p>
        </div>
      </div>
    </button>
  );
}
