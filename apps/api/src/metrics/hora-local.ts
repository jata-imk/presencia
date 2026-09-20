// Pasar un instante UTC al calendario del usuario.
//
// Es la primera vez que la API hace esto (hasta F8.7 todo lo temporal se
// resolvía en UTC o en el cliente), y es obligatorio acá: "mejores horarios"
// es literalmente una pregunta sobre la hora local. Un post publicado a las
// 19:00 en Mérida es `01:00Z` del día siguiente — agruparlo por la hora UTC lo
// pondría en la madrugada del martes en vez de la noche del lunes, y el
// heatmap recomendaría publicar a una hora a la que el usuario nunca publicó.
//
// Sin dependencia nueva: `Intl` resuelve la zona con la base de datos de zonas
// del runtime, así que el horario de verano y los cambios de offset vienen
// gratis y actualizados con Node.

/** 0 = lunes, 6 = domingo. El diseño arranca la semana en lunes. */
const DIAS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const formateadores = new Map<string, Intl.DateTimeFormat>();

function formateadorDe(timezone: string): Intl.DateTimeFormat {
  const guardado = formateadores.get(timezone);
  if (guardado) return guardado;
  // Construir un DateTimeFormat no es gratis y esto corre una vez por post.
  // El cache es por zona, y las zonas son un puñado.
  const formateador = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    weekday: "short",
    hour: "2-digit",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  formateadores.set(timezone, formateador);
  return formateador;
}

export interface FechaLocal {
  /** 0 = lunes. */
  diaSemana: number;
  /** 0–23. */
  hora: number;
  /** `YYYY-MM-DD` local, la llave del heatmap de cadencia. */
  dia: string;
}

/**
 * Descompone un instante en la zona del usuario.
 *
 * Lanza si la zona no existe en vez de caer a UTC en silencio: una zona
 * inválida guardada en `users.timezone` produciría un heatmap desplazado que
 * nadie notaría hasta que un usuario dijera "yo nunca publico a esa hora".
 */
export function fechaLocal(instante: Date, timezone: string): FechaLocal {
  const partes = formateadorDe(timezone).formatToParts(instante);
  const buscar = (tipo: Intl.DateTimeFormatPartTypes): string => {
    const parte = partes.find((p) => p.type === tipo);
    if (!parte) throw new Error(`Intl no devolvió "${tipo}" para la zona ${timezone}`);
    return parte.value;
  };
  const diaSemana = DIAS.indexOf(buscar("weekday"));
  if (diaSemana < 0) throw new Error(`Día de la semana inesperado para la zona ${timezone}`);
  // `hourCycle: "h23"` puede devolver "24" en el instante exacto de medianoche
  // en algunos runtimes; normalizarlo acá evita una franja fantasma.
  const hora = Number(buscar("hour")) % 24;
  return {
    diaSemana,
    hora,
    dia: `${buscar("year")}-${buscar("month")}-${buscar("day")}`,
  };
}
