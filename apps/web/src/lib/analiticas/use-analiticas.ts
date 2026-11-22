import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AnaliticasPublicacionesDto,
  AnaliticasRedesDto,
  AnaliticasResumenDto,
  PeriodoAnaliticas,
  SocialNetwork,
} from "@presencia/shared";
import { ApiError } from "../api.js";
import { fetchPublicaciones, fetchRedes, fetchResumen } from "./analiticas-api.js";

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
  reintentar: () => void;
}

function useRecurso<T>(llave: string, cargar: (signal: AbortSignal) => Promise<T>): Recurso<T> {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  // La respuesta de un periodo que el usuario ya dejó no puede pisar la del
  // actual (misma guarda que cards-store y useHorarios).
  const pedido = useRef(0);
  const cargarRef = useRef(cargar);
  cargarRef.current = cargar;

  useEffect(() => {
    const token = ++pedido.current;
    const abort = new AbortController();
    setError(null);
    // Sin limpiar, mientras viaja la petición nueva seguirían en pantalla los
    // números del periodo anterior bajo el selector nuevo.
    setDatos(null);
    cargarRef
      .current(abort.signal)
      .then((resultado) => {
        if (token === pedido.current) setDatos(resultado);
      })
      .catch((e: unknown) => {
        if (token === pedido.current && !abort.signal.aborted) setError(mensajeDe(e));
      });
    return () => abort.abort();
  }, [llave, intento]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  return { datos, error, reintentar };
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
