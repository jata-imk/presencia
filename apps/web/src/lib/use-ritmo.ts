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
  guardando: boolean;
  recargar: () => void;
  cambiarMeta: (network: SocialNetwork, meta: number) => Promise<void>;
}

export function useRitmoResumen(): EstadoResumen {
  const [resumen, setResumen] = useState<RitmoResumenDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

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
      try {
        // El PATCH devuelve el resumen completo: la meta cambia el "vas 8/14"
        // de la cabecera, y recalcularlo acá sería una segunda aritmética del
        // mismo número.
        setResumen(await saveMetaSemanal(network, meta));
      } catch {
        // El servidor tiene el estado bueno. Recargar deja la fila como quedó
        // de verdad, en vez de dejar la UI afirmando un número que no se
        // guardó.
        recargar();
      } finally {
        setGuardando(false);
      }
    },
    [recargar],
  );

  return { resumen, error, guardando, recargar, cambiarMeta };
}

export function useHorarios(network: SocialNetwork | null) {
  const [horarios, setHorarios] = useState<RitmoHorariosDto | null>(null);
  const [cargando, setCargando] = useState(false);
  // Guarda de carrera del mismo tipo que cards-store: la respuesta de una red
  // que el usuario ya abandonó no puede pisar la de la pestaña actual.
  const pedido = useRef(0);

  useEffect(() => {
    if (!network) return;
    const token = ++pedido.current;
    const abort = new AbortController();
    setCargando(true);
    fetchHorarios(network, abort.signal)
      .then((datos) => {
        if (token === pedido.current) setHorarios(datos);
      })
      .catch(() => {
        if (token === pedido.current) setHorarios(null);
      })
      .finally(() => {
        if (token === pedido.current) setCargando(false);
      });
    return () => {
      abort.abort();
    };
  }, [network]);

  return { horarios, cargando };
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
