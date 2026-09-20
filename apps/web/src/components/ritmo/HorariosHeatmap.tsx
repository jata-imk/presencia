import { DIAS_SEMANA, FRANJAS, type RitmoHorariosDto } from "@presencia/shared";
import { Tooltip } from "../ui/Tooltip.js";

// El heatmap de mejores horarios: franjas en filas, días en columnas.
//
// Dos cosas del contrato que esta vista NO puede reinterpretar, porque son
// donde el módulo se juega la honestidad:
//
//   - `intensidad: 0` es "acá no hay historia", nunca "rindió mal". Una celda
//     con publicaciones flojas va en el paso 1.
//   - `heredado: true` significa que el "+%" es el de la franja completa, no
//     el de esa celda. El tooltip lo dice; pintar el número sin esa aclaración
//     sería presentar un promedio de 40 posts como si fuera de 2.

const FONDO_POR_INTENSIDAD = [
  "bg-ritmo-engage-0",
  "bg-ritmo-engage-1",
  "bg-ritmo-engage-2",
  "bg-ritmo-engage-3",
  "bg-ritmo-engage-4",
];

function textoDeLift(lift: number): string {
  return `${lift > 0 ? "+" : ""}${String(lift)}%`;
}

export function HorariosHeatmap({ datos }: { datos: RitmoHorariosDto }) {
  const porCelda = new Map(datos.celdas.map((c) => [`${c.diaSemana}:${c.franja}`, c]));

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex flex-col gap-1">
        <div className="flex gap-1">
          <div className="w-[72px] shrink-0" />
          {DIAS_SEMANA.map((dia, indice) => (
            <span
              key={dia}
              className={`w-[62px] shrink-0 text-center text-[11px] font-semibold ${
                indice >= 5 ? "text-fg" : "text-fg-secondary"
              }`}
            >
              {dia}
            </span>
          ))}
        </div>
        {FRANJAS.map((franja, indiceFranja) => (
          <div key={franja.id} className="flex gap-1">
            <div className="flex w-[72px] shrink-0 flex-col items-end justify-center pr-2">
              <span className="text-[11px] font-semibold text-fg-secondary">{franja.etiqueta}</span>
              <span className="text-[9px] text-fg-muted">{franja.nombre}</span>
            </div>
            {DIAS_SEMANA.map((dia, indiceDia) => {
              const celda = porCelda.get(`${String(indiceDia)}:${String(indiceFranja)}`);
              const intensidad = celda?.intensidad ?? 0;
              const lift = celda?.lift ?? null;
              return (
                <Tooltip
                  key={`${franja.id}-${dia}`}
                  label={
                    celda ? tooltipDe(celda.n, lift, celda.heredado, franja.etiqueta) : undefined
                  }
                >
                  <div
                    className={`flex h-[34px] w-[62px] shrink-0 items-center justify-center rounded-md border ${
                      FONDO_POR_INTENSIDAD[intensidad] ?? FONDO_POR_INTENSIDAD[0]
                    } ${intensidad === 0 ? "border-line-subtle" : "border-transparent"}`}
                  >
                    {/* El número solo aparece donde la celda se lo ganó. El
                        heredado vive en el tooltip: pintarlo en todas las
                        celdas de una franja fuerte se leería como si cada una
                        tuviera su propia muestra. */}
                    {lift !== null && !celda?.heredado && (
                      <span className="text-xs font-bold text-ritmo-cell-fg">
                        {textoDeLift(lift)}
                      </span>
                    )}
                  </div>
                </Tooltip>
              );
            })}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-fg-muted">
        Calculado sobre tus últimos {datos.ventanaDias} días
        {datos.base === "tasa"
          ? ", comparando interacciones contra el alcance de cada publicación."
          : ", comparando interacciones. Esta red no reporta alcance."}
      </p>
    </div>
  );
}

function tooltipDe(
  n: number,
  lift: number | null,
  heredado: boolean,
  franja: string,
): string | undefined {
  if (n === 0 && lift === null) return undefined;
  const cuantas = `${String(n)} ${n === 1 ? "publicación" : "publicaciones"}`;
  if (lift === null) return cuantas;
  if (heredado) {
    // Decir de dónde salió el número es la mitad del trato: sin esto, un
    // promedio de toda la franja se leería como medición de esta celda.
    return `${cuantas} acá · ${textoDeLift(lift)} es el promedio de la franja ${franja}`;
  }
  return `${cuantas} · ${textoDeLift(lift)} frente a tu promedio en esta red`;
}
