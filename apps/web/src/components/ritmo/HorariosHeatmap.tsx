import { DIAS_SEMANA, FRANJAS, type RitmoCeldaDto, type RitmoHorariosDto } from "@presencia/shared";
import { Tooltip } from "../ui/Tooltip.js";

// El heatmap de mejores horarios: franjas en filas, días en columnas.
//
// Dos capas que responden a preguntas distintas y por eso se pintan distinto:
//
//   - El TONO dice cuánto engagement hubo ahí. `intensidad: 0` es "acá no hay
//     historia", nunca "rindió mal": una celda con publicaciones flojas va en
//     el paso 1.
//   - El MARCO con relleno morado dice "esta es una de tus mejores ventanas".
//     Una franja puede tener poco volumen y aun así ser la mejor, así que no
//     puede ser simplemente el paso 4 de la misma rampa.
//
// El número aparece donde el lift es positivo, venga de la celda o de su
// franja, y el tooltip dice cuál de las dos. Mostrarlo solo en las celdas que
// se lo ganan dejaba la pantalla sin un solo número con datos reales: ninguna
// celda día×franja junta en 30 días las publicaciones que el umbral pide, así
// que el "+%" que el motor calcula bien vivía nada más en los tooltips.

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

function tooltipDe(celda: RitmoCeldaDto, franja: string): string | undefined {
  if (celda.n === 0 && celda.lift === null) return undefined;
  const cuantas = `${String(celda.n)} ${celda.n === 1 ? "publicación" : "publicaciones"}`;
  if (celda.lift === null) return cuantas;
  if (celda.heredado) {
    // De dónde salió el número es la mitad del trato: sin esto, el promedio de
    // toda la franja se leería como una medición de esta celda.
    return `${cuantas} acá · ${textoDeLift(celda.lift)} es el promedio de la franja ${franja}`;
  }
  return `${cuantas} · ${textoDeLift(celda.lift)} frente a tu promedio en esta red`;
}

function Celda({
  celda,
  etiquetaFranja,
}: {
  celda: RitmoCeldaDto | undefined;
  etiquetaFranja: string;
}) {
  const intensidad = celda?.intensidad ?? 0;
  const lift = celda?.lift ?? null;
  // "Mejor ventana": rinde por encima del promedio del usuario en esa red.
  const esMejor = lift !== null && lift > 0 && (celda?.n ?? 0) > 0;
  const fondo = esMejor
    ? "border-ritmo-mejor-border bg-ritmo-mejor"
    : `${FONDO_POR_INTENSIDAD[intensidad] ?? FONDO_POR_INTENSIDAD[0]} ${
        intensidad === 0 ? "border-line-subtle" : "border-transparent"
      }`;

  return (
    <Tooltip label={celda ? tooltipDe(celda, etiquetaFranja) : undefined}>
      <div
        className={`flex h-9 w-[78px] shrink-0 items-center justify-center rounded-lg border ${fondo}`}
      >
        {esMejor && (
          <span className="text-xs font-bold text-ritmo-cell-fg">{textoDeLift(lift)}</span>
        )}
      </div>
    </Tooltip>
  );
}

export function HorariosHeatmap({ datos }: { datos: RitmoHorariosDto }) {
  const porCelda = new Map(datos.celdas.map((c) => [`${c.diaSemana}:${c.franja}`, c]));

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex flex-col gap-1">
        <div className="flex gap-1">
          <div className="w-[76px] shrink-0" />
          {DIAS_SEMANA.map((dia, indice) => (
            <span
              key={dia}
              className={`w-[78px] shrink-0 text-center text-xs font-semibold ${
                indice >= 5 ? "text-fg" : "text-fg-secondary"
              }`}
            >
              {dia}
            </span>
          ))}
        </div>
        {FRANJAS.map((franja, indiceFranja) => (
          <div key={franja.id} className="flex gap-1">
            <div className="flex w-[76px] shrink-0 flex-col items-end justify-center pr-2">
              <span className="text-xs font-semibold text-fg-secondary">{franja.etiqueta}</span>
              <span className="text-[10px] leading-tight text-fg-muted">{franja.nombre}</span>
            </div>
            {DIAS_SEMANA.map((dia, indiceDia) => (
              <Celda
                key={`${franja.id}-${dia}`}
                celda={porCelda.get(`${String(indiceDia)}:${String(indiceFranja)}`)}
                etiquetaFranja={franja.etiqueta}
              />
            ))}
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-fg-muted">
        Porcentaje calculado sobre tu propio histórico de los últimos {datos.ventanaDias} días
        {datos.base === "tasa"
          ? ", comparando interacciones contra el alcance de cada publicación."
          : ". Esta red no reporta alcance, así que se comparan interacciones."}
      </p>
    </div>
  );
}
