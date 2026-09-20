import { useCallback, useEffect, useRef, useState } from "react";
import type {
  RitmoHorariosDto,
  RitmoResumenDto,
  SocialNetwork,
  TrendsDto,
} from "@presencia/shared";
import { ApiError } from "./api.js";
import { fetchHorarios, fetchResumen, fetchTendencias, saveMetaSemanal } from "./ritmo-api.js";

// Los tres recursos de Ritmo, cada uno con su propio ciclo de vida.
//
// Separados en hooks y no en un `useEffect` gigante dentro de la página porque
// fallan por su cuenta: que la fuente de tendencias se caiga no puede dejar al
// usuario sin su heatmap. Con un solo estado compartido, el primer `catch`
// apagaba la vista entera.
//
// Estado local con `useState` y no un store de zustand (como el Calendario):
// nada fuera de esta pantalla lee estos datos, y un store global sería una
// pieza que hay que invalidar y mantener sincronizada sin que nadie más la
// aproveche.

const ERROR_GENERICO = "No pudimos cargar tu ritmo. Inténtalo de nuevo.";

function mensajeDe(error: unknown): string {
  return error instanceof ApiError ? error.message : ERROR_GENERICO;
}

export interface EstadoResumen {
  resumen: RitmoResumenDto | null;
  error: string | null;
  /** Fallo al guardar una meta. Aparte de `error`: la vista sigue en pie. */
  errorGuardado: string | null;
  guardando: boolean;
  recargar: () => void;
  cambiarMeta: (network: SocialNetwork, meta: number) => Promise<void>;
}

export function useRitmoResumen(): EstadoResumen {
  const [resumen, setResumen] = useState<RitmoResumenDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);

  const recargar = useCallback(() => {
    setError(null);
    fetchResumen()
      .then(setResumen)
      .catch((e: unknown) => setError(mensajeDe(e)));
  }, []);

  useEffect(recargar, [recargar]);

  const cambiarMeta = useCallback(
    async (network: SocialNetwork, meta: number) => {
      setGuardando(true);
      setErrorGuardado(null);
      try {
        // El PATCH devuelve el resumen completo: la meta cambia el "vas 8/14"
        // de la cabecera, y recalcularlo acá sería una segunda aritmética del
        // mismo número.
        setResumen(await saveMetaSemanal(network, meta));
      } catch (e: unknown) {
        // El servidor tiene el estado bueno. Recargar deja la fila como quedó
        // de verdad, en vez de dejar la UI afirmando un número que no se
        // guardó. Y se DICE que falló: sin aviso, el usuario ve que el número
        // no se mueve y sigue picándole al botón.
        setErrorGuardado(mensajeDe(e));
        recargar();
      } finally {
        setGuardando(false);
      }
    },
    [recargar],
  );

  return { resumen, error, errorGuardado, guardando, recargar, cambiarMeta };
}

export function useHorarios(network: SocialNetwork | null) {
  const [horarios, setHorarios] = useState<RitmoHorariosDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  // Guarda de carrera del mismo tipo que cards-store: la respuesta de una red
  // que el usuario ya abandonó no puede pisar la de la pestaña actual.
  const pedido = useRef(0);

  useEffect(() => {
    if (!network) return;
    const token = ++pedido.current;
    const abort = new AbortController();
    setError(null);
    // Se limpia el resultado anterior al cambiar de red. Sin esto, mientras la
    // nueva petición viaja seguía en pantalla el heatmap de la red anterior
    // bajo la pestaña nueva — y si la nueva resulta `no_reporta`, el estado
    // vacío llegaba a nombrar la red equivocada.
    setHorarios(null);
    fetchHorarios(network, abort.signal)
      .then((datos) => {
        if (token === pedido.current) setHorarios(datos);
      })
      .catch((e: unknown) => {
        // Un fallo NO es "todavía no tienes datos": decirle eso a alguien con
        // meses de historial es el código mintiendo. Va a su propio estado,
        // con reintento.
        if (token === pedido.current && !abort.signal.aborted) setError(mensajeDe(e));
      });

    return () => {
      abort.abort();
    };
  }, [network, intento]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);

  // Sin bandera de "cargando": el resultado se limpia al cambiar de red, así
  // que `!horarios && !error` ya dice exactamente eso. Dos fuentes para el
  // mismo estado es una que se puede desincronizar.
  return { horarios, error, reintentar };
}

export function useTendencias() {
  const [tendencias, setTendencias] = useState<TrendsDto | null>(null);

  const recargar = useCallback(() => {
    // Silencioso a propósito: es información secundaria de la vista y su
    // fallo no puede tumbar el resto.
    fetchTendencias()
      .then(setTendencias)
      .catch(() => setTendencias(null));
  }, []);

  useEffect(recargar, [recargar]);

  return { tendencias, recargar };
}
