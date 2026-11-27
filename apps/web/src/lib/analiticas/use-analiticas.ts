import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AnaliticasHallazgosDto,
  AnaliticasPublicacionDetalleDto,
  AnaliticasPublicacionesDto,
  AnaliticasRedesDto,
  AnaliticasResumenDto,
  PeriodoAnaliticas,
  SocialNetwork,
} from "@presencia/shared";
import { ApiError } from "../api.js";
import {
  fetchDetalle,
  fetchHallazgos,
  fetchPublicaciones,
  fetchRedes,
  fetchResumen,
} from "./analiticas-api.js";

// Los recursos de Analíticas, cada uno con su propio ciclo de vida (el patrón
// de `useHorarios` en lib/use-ritmo.ts).
//
// Separados porque fallan por su cuenta: si la tabla no carga, el resumen de
// arriba sigue en pie. Estado local y no un store: nada fuera de esta pantalla
// lee estos datos.
//
// Sin bandera de "cargando": el resultado se limpia al cambiar el periodo o la
// red, así que `!datos && !error` ya dice exactamente eso.

const ERROR_GENERICO = "No pudimos cargar tus analíticas. Inténtalo de nuevo.";

function mensajeDe(error: unknown): string {
  return error instanceof ApiError ? error.message : ERROR_GENERICO;
}

export interface Recurso<T> {
  datos: T | null;
  error: string | null;
  /**
   * La API dijo 404. El detalle lo distingue del error genérico: una
   * publicación que no existe (o ya no es tuya) no se arregla con
   * "Reintentar".
   */
  noExiste: boolean;
  reintentar: () => void;
}

/** `llave` en null = no hay nada que pedir (el detalle cerrado). */
function useRecurso<T>(
  llave: string | null,
  cargar: (signal: AbortSignal) => Promise<T>,
): Recurso<T> {
  // Los datos y el error guardan la llave con la que llegaron. Limpiarlos en
  // el efecto no alcanzaba: el efecto corre DESPUÉS del render, y en ese
  // primer render tras cambiar de periodo se pintaban los números viejos
  // bajo el selector nuevo (5 barras de 30 días rotuladas con los tramos de
  // 90). Comparando la llave, lo de otra llave simplemente no se devuelve.
  const [datos, setDatos] = useState<{ llave: string; valor: T } | null>(null);
  const [error, setError] = useState<{
    llave: string;
    mensaje: string;
    status: number | null;
  } | null>(null);
  const [intento, setIntento] = useState(0);
  // La respuesta de un periodo que el usuario ya dejó no puede pisar la del
  // actual (misma guarda que cards-store y useHorarios).
  const pedido = useRef(0);
  const cargarRef = useRef(cargar);
  cargarRef.current = cargar;

  useEffect(() => {
    const token = ++pedido.current;
    setError(null);
    setDatos(null);
    if (llave === null) return;
    const abort = new AbortController();
    cargarRef
      .current(abort.signal)
      .then((valor) => {
        if (token === pedido.current) setDatos({ llave, valor });
      })
      .catch((e: unknown) => {
        if (token === pedido.current && !abort.signal.aborted) {
          setError({
            llave,
            mensaje: mensajeDe(e),
            status: e instanceof ApiError ? e.status : null,
          });
        }
      });
    return () => abort.abort();
  }, [llave, intento]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  const errorVigente = llave !== null && error?.llave === llave ? error : null;
  return {
    datos: llave !== null && datos?.llave === llave ? datos.valor : null,
    error: errorVigente?.mensaje ?? null,
    noExiste: errorVigente?.status === 404,
    reintentar,
  };
}

export function useAnaliticasResumen(
  periodo: PeriodoAnaliticas,
  red: SocialNetwork | null,
): Recurso<AnaliticasResumenDto> {
  return useRecurso(`${String(periodo)}:${red ?? ""}`, (signal) =>
    fetchResumen(periodo, red, signal),
  );
}

export function useAnaliticasRedes(periodo: PeriodoAnaliticas): Recurso<AnaliticasRedesDto> {
  return useRecurso(String(periodo), (signal) => fetchRedes(periodo, signal));
}

export function useAnaliticasPublicaciones(
  periodo: PeriodoAnaliticas,
  red: SocialNetwork | null,
): Recurso<AnaliticasPublicacionesDto> {
  return useRecurso(`${String(periodo)}:${red ?? ""}`, (signal) =>
    fetchPublicaciones(periodo, red, signal),
  );
}

/** Siempre 90 días (lore doc §5): el periodo no entra en la llave. */
export function useAnaliticasHallazgos(red: SocialNetwork | null): Recurso<AnaliticasHallazgosDto> {
  return useRecurso(red ?? "", (signal) => fetchHallazgos(red, signal));
}

/**
 * El detalle de `?post=`. El periodo entra en la llave porque viaja en la
 * consulta: cambiarlo con el panel abierto lo vuelve a pedir, en vez de
 * quedarse con lo del periodo anterior. Con `cardId` en null no pide nada.
 */
export function useAnaliticasDetalle(
  cardId: string | null,
  periodo: PeriodoAnaliticas,
): Recurso<AnaliticasPublicacionDetalleDto> {
  return useRecurso(cardId === null ? null : `${cardId}:${String(periodo)}`, (signal) =>
    fetchDetalle(cardId ?? "", periodo, signal),
  );
}
