import type { BaseDeCalculoDto, PeriodoAnaliticas } from "@presencia/shared";
import { Tooltip } from "../ui/Tooltip.js";
import {
  fechaCorta,
  rangoDeTramo,
  textoEngagement,
  tramosDe,
} from "../../lib/analiticas/formato.js";

// La evolución del engagement de una red en el periodo: barras chicas
// dibujadas a mano, sin librería de gráficas (ADR-018, como los mapas de
// calor de Ritmo y el Calendario).
//
// Etiquetas solo en los extremos (la fecha del primer tramo y "Hoy"); cada
// barra dice su rango y su valor al pasar el mouse. Así cabe igual con 5, 7 o
// 9 tramos, también a 390 px.

/** Alto mínimo de una barra con valor, para que un tramo bajo no desaparezca. */
const MINIMO_PCT = 6;

export function Tendencia({
  valores,
  base,
  periodo,
  ahora,
  timeZone,
}: {
  valores: (number | null)[];
  base: BaseDeCalculoDto;
  periodo: PeriodoAnaliticas;
  ahora: Date;
  timeZone: string;
}) {
  const tramos = tramosDe(periodo, ahora);
  const maximo = Math.max(0, ...valores.filter((v): v is number => v !== null));
  const primero = tramos[0];

  return (
    <div className="flex flex-col gap-1.5" aria-label="Evolución del engagement en el periodo">
      <div className="flex h-14 items-end gap-1.5">
        {valores.map((valor, i) => {
          const tramo = tramos[i];
          const rango = tramo ? rangoDeTramo(tramo, timeZone) : "";
          const vacio = valor === null;
          const alto =
            vacio || maximo === 0 ? MINIMO_PCT : Math.max(MINIMO_PCT, (valor / maximo) * 100);
          const pico = !vacio && valor === maximo && maximo > 0;
          const etiqueta = vacio
            ? `${rango} · sin publicaciones medidas`
            : `${rango} · ${textoEngagement(base, valor).numero}`;
          return (
            <Tooltip key={i} label={etiqueta}>
              <span
                role="img"
                aria-label={etiqueta}
                style={{ height: `${String(alto)}%` }}
                className={`min-w-0 flex-1 rounded-t-[4px] rounded-b-[2px] ${
                  vacio ? "bg-ana-barra-vacia" : pico ? "bg-ana-barra-pico" : "bg-ana-barra"
                }`}
              />
            </Tooltip>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-fg-muted">
        <span>{primero ? fechaCorta(primero.inicio, timeZone) : ""}</span>
        <span>Hoy</span>
      </div>
    </div>
  );
}
