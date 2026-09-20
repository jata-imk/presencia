import { useMemo, useState } from "react";
import type { RitmoDiaDto } from "@presencia/shared";
import { Tooltip } from "../ui/Tooltip.js";

// El heatmap de cadencia: una celda por día, 16 semanas en columnas.
//
// Construido a mano con grid de CSS y sin librería de gráficas, igual que el
// Calendario (ADR-018). Son 112 divs de color: una dependencia de charting
// pesaría más que todo esto y habría que pelearle el tema y los tokens.

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/**
 * De cuántas publicaciones en un día a qué tono le toca.
 *
 * `0` es su propio paso y no el primero de la rampa: un día sin publicar y
 * uno con una publicación floja son cosas distintas, y el heatmap no puede
 * confundirlas. El tope en 4 es de la escala, no del usuario — publicar seis
 * veces un día se ve igual que cuatro, y está bien: lo que el mapa cuenta es
 * constancia, no volumen.
 */
function tono(total: number): string {
  if (total <= 0) return "bg-ritmo-heat-0";
  if (total === 1) return "bg-ritmo-heat-1";
  if (total === 2) return "bg-ritmo-heat-2";
  if (total === 3) return "bg-ritmo-heat-3";
  return "bg-ritmo-heat-4";
}

function etiquetaDe(dia: string): string {
  const [, mes, numero] = dia.split("-");
  return `${Number(numero)} ${MESES[Number(mes) - 1]?.toLowerCase() ?? ""}`;
}

interface Props {
  dias: RitmoDiaDto[];
  /** En `cold` el mapa se pinta apagado y sin tooltips: no hay qué inspeccionar. */
  apagado?: boolean;
}

export function CadenciaHeatmap({ dias, apagado = false }: Props) {
  const [foco, setFoco] = useState<string | null>(null);

  // Las semanas son columnas de 7. La rejilla llega completa desde el
  // servidor —incluidos los días en cero— justo para no tener que reconstruir
  // acá la aritmética de zona horaria.
  const semanas = useMemo(() => {
    const columnas: RitmoDiaDto[][] = [];
    for (let i = 0; i < dias.length; i += 7) columnas.push(dias.slice(i, i + 7));
    return columnas;
  }, [dias]);

  // Una etiqueta de mes por columna donde el mes cambia.
  const meses = useMemo(
    () =>
      semanas.map((semana, indice) => {
        const primero = semana[0];
        if (!primero) return null;
        const mes = Number(primero.dia.split("-")[1]);
        const anterior = semanas[indice - 1]?.[0];
        const mesAnterior = anterior ? Number(anterior.dia.split("-")[1]) : -1;
        return mes !== mesAnterior ? (MESES[mes - 1] ?? null) : null;
      }),
    [semanas],
  );

  return (
    <div className="overflow-x-auto pb-1">
      <div className="inline-flex flex-col gap-1">
        <div className="flex gap-[3px] pl-8">
          {meses.map((mes, indice) => (
            <span
              key={semanas[indice]?.[0]?.dia ?? indice}
              className="w-[14px] shrink-0 text-[9px] font-semibold text-fg-muted"
            >
              {mes}
            </span>
          ))}
        </div>
        <div className="flex gap-[3px]">
          <div className="flex w-8 shrink-0 flex-col gap-[3px] pr-1">
            {DIAS.map((dia, indice) => (
              <span
                key={dia}
                className="flex h-[14px] items-center justify-end text-[9px] text-fg-muted"
              >
                {/* Una de cada dos, como el mock: con las siete el eje compite
                    con las celdas y el mapa se lee peor. */}
                {indice % 2 === 0 ? dia : ""}
              </span>
            ))}
          </div>
          {semanas.map((semana, indice) => (
            <div key={semana[0]?.dia ?? indice} className="flex flex-col gap-[3px]">
              {semana.map((dia) => (
                // `label` vacío apaga el tooltip, así que un día sin publicar
                // no ofrece nada que inspeccionar sin necesitar dos ramas.
                <Tooltip
                  key={dia.dia}
                  label={
                    apagado || dia.total === 0
                      ? undefined
                      : `${String(dia.total)} ${dia.total === 1 ? "publicación" : "publicaciones"} · ${etiquetaDe(dia.dia)}`
                  }
                >
                  <div
                    onMouseEnter={() => setFoco(dia.dia)}
                    onMouseLeave={() => setFoco(null)}
                    className={`h-[14px] w-[14px] rounded-[3px] border border-line-subtle ${tono(dia.total)} ${
                      foco === dia.dia ? "ring-interactive-primary ring-1" : ""
                    }`}
                  />
                </Tooltip>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LeyendaHeatmap() {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-fg-muted">
      <span>menos</span>
      <span className="h-3 w-3 rounded-[3px] border border-line-subtle bg-ritmo-heat-0" />
      <span className="h-3 w-3 rounded-[3px] bg-ritmo-heat-1" />
      <span className="h-3 w-3 rounded-[3px] bg-ritmo-heat-2" />
      <span className="h-3 w-3 rounded-[3px] bg-ritmo-heat-3" />
      <span className="h-3 w-3 rounded-[3px] bg-ritmo-heat-4" />
      <span>más</span>
    </div>
  );
}
