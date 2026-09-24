import type { TrendRefreshStateDto } from "@presencia/shared";

// Lo que la sección de tendencias de Ritmo dice alrededor de sus tarjetas:
// cuándo se generaron y qué hace el botón. Puro para poder probarlo sin
// montar la pantalla.

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

const porcentaje = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

export interface BotonDeRefresco {
  etiqueta: string;
  /** El precio, o `null` si es gratis. Nunca "0%": eso sería mentir. */
  precio: string | null;
  deshabilitado: boolean;
  /** Por qué está apagado, cuando no es obvio. */
  motivo: string | null;
}

/**
 * El botón de "Actualizar ahora", leído del estado que manda la API.
 *
 * No calcula el precio: lo formatea. El número ya viene como porcentaje del
 * mes (la web nunca ve unidades del ledger) y `0` ya significa gratis, así que
 * aquí solo se decide cómo decirlo.
 */
export function botonDeRefresco(refresco: TrendRefreshStateDto): BotonDeRefresco {
  if (refresco.enCurso) {
    return { etiqueta: "Buscando…", precio: null, deshabilitado: true, motivo: null };
  }
  const gratis = refresco.costoPorcentaje === 0;
  return {
    etiqueta: gratis ? "Buscar tendencias" : "Actualizar ahora",
    precio: gratis ? null : `usa ~${porcentaje.format(refresco.costoPorcentaje)}% de tu mes`,
    deshabilitado: !refresco.disponible,
    // Sin uno en curso, el único motivo por el que la API lo apaga es el saldo.
    motivo: refresco.disponible ? null : "Tu saldo del mes no alcanza",
  };
}
