import { Clock, TrendingUp } from "lucide-react";
import {
  etiquetaDeFranja,
  mejoresVentanas,
  type RitmoHorariosDto,
  type VentanaRecomendada,
} from "@presencia/shared";

// Portado de TimeChip (Chat Part 3.html). El mockup traía badges de "mejores
// horarios" con % de engagement y F6 decidió no fabricar esos porcentajes sin
// datos reales.
//
// F9 los llena de verdad: cuando Ritmo tiene historial suficiente en esa red,
// los chips pasan a ser las ventanas donde al usuario le va mejor, con su
// número. Cuando no, siguen siendo estos atajos comunes — que no pretenden ser
// una recomendación y por eso no llevan porcentaje.
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
  horarios,
  diaSemana,
}: {
  selectedTime: string;
  onSelectTime: (time: string) => void;
  /** Los horarios de la red destino, o `null` si no hay/no cargaron. */
  horarios?: RitmoHorariosDto | null;
  /** 0 = lunes. El día que se está programando: las ventanas son por día. */
  diaSemana?: number;
}) {
  const ventanas: VentanaRecomendada[] =
    horarios && diaSemana !== undefined ? mejoresVentanas(horarios, diaSemana) : [];
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
      {ventanas.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-xs text-fg-secondary">
            <TrendingUp size={13} className="text-accent" />
            Tus mejores horarios para este día
          </span>
          <div className="flex flex-wrap gap-1.5">
            {ventanas.map((ventana) => {
              const active = ventana.hora === selectedTime;
              return (
                <button
                  key={ventana.franja}
                  type="button"
                  onClick={() => onSelectTime(ventana.hora)}
                  // El rango y no la hora exacta: el motor agrupa en bloques de
                  // tres horas, así que un "18:00" a secas fingiría una
                  // precisión que no existe. El click sí prellena el inicio.
                  title={
                    ventana.heredado
                      ? `Promedio de la franja ${etiquetaDeFranja(ventana.franja)}, no solo de este día`
                      : `Tus publicaciones de esta franja rinden ${String(ventana.lift)}% más`
                  }
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold ${
                    active ? "bg-primary text-primary-fg" : "border border-line bg-card text-fg"
                  }`}
                >
                  {etiquetaDeFranja(ventana.franja)}
                  <span
                    className={`text-xs font-semibold ${active ? "opacity-90" : "text-accent"}`}
                  >
                    +{ventana.lift}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
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
      )}
    </div>
  );
}
