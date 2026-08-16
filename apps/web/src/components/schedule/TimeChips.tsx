// Portado de TimeChip (Chat Part 3.html). El mockup traía badges de
// "mejores horarios" con % de engagement (datos de Ritmo) — F6 ya decidió
// no fabricar esos porcentajes sin datos reales; estos son solo atajos de
// hora comunes, sin pretender ser una recomendación personalizada.
const SUGGESTED_TIMES = ["10:00", "12:00", "18:00", "20:00"];

export function TimeChips({
  selectedTime,
  onSelectTime,
}: {
  selectedTime: string;
  onSelectTime: (time: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {SUGGESTED_TIMES.map((time) => {
        const active = time === selectedTime;
        return (
          <button
            key={time}
            type="button"
            onClick={() => onSelectTime(time)}
            className={`rounded-lg px-3 py-1.5 text-sm font-bold ${
              active ? "bg-primary text-primary-fg" : "border border-line bg-card text-fg"
            }`}
          >
            {time}
          </button>
        );
      })}
    </div>
  );
}
