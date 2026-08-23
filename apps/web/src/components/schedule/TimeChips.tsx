import { Clock } from "lucide-react";

// Portado de TimeChip (Chat Part 3.html). El mockup traía badges de
// "mejores horarios" con % de engagement (datos de Ritmo) — F6 ya decidió
// no fabricar esos porcentajes sin datos reales; estos son solo atajos de
// hora comunes, sin pretender ser una recomendación personalizada.
const SUGGESTED_TIMES = ["10:00", "12:00", "18:00", "20:00"];

// El mockup (DrawerSection "¿A qué hora?") también traía un campo de hora
// editable arriba de los chips — se había portado solo la fila de atajos
// en PR4/PR5, dejando sin forma de poner una hora libre. `type="time"`
// nativo: sin parseo a mano, funciona con teclado/picker del SO, y ya
// entrega el mismo formato "HH:MM" que ScheduleDrawer/NetworkScheduleRow
// esperan — cero cambios en los callers.
export function TimeChips({
  selectedTime,
  onSelectTime,
}: {
  selectedTime: string;
  onSelectTime: (time: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 rounded-lg border-[1.5px] border-line-focus bg-card px-3 py-2 shadow-xs">
        <Clock size={14} strokeWidth={2} className="text-brand" />
        <input
          type="time"
          value={selectedTime}
          onChange={(e) => e.target.value && onSelectTime(e.target.value)}
          className="flex-1 bg-transparent text-sm font-semibold text-fg outline-none"
        />
        <span className="text-xs text-fg-muted">24h</span>
      </div>
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
    </div>
  );
}
