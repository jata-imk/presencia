// "Hace cuánto" en español mexicano, para fechas del pasado reciente.
//
// Nació en las tendencias de Ritmo; Analíticas lo usa para "Actualizado
// hace…" y "Medido hace…", así que vive aquí y no dentro de un módulo.

const MS_POR_MINUTO = 60 * 1000;
const MS_POR_HORA = 60 * MS_POR_MINUTO;
const MS_POR_DIA = 24 * MS_POR_HORA;

const relativo = new Intl.RelativeTimeFormat("es-MX", { numeric: "auto" });

/** "hace 3 días", "ayer", "hace 5 horas", "hace un momento". */
export function haceCuanto(iso: string, ahora: Date = new Date()): string {
  const ms = ahora.getTime() - new Date(iso).getTime();
  if (ms < MS_POR_MINUTO) return "hace un momento";
  if (ms < MS_POR_HORA) return relativo.format(-Math.floor(ms / MS_POR_MINUTO), "minute");
  if (ms < MS_POR_DIA) return relativo.format(-Math.floor(ms / MS_POR_HORA), "hour");
  return relativo.format(-Math.floor(ms / MS_POR_DIA), "day");
}
