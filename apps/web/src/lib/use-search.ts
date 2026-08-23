import { useEffect, useRef, useState } from "react";
import { SEARCH_MIN_LENGTH, type SearchResultsDto } from "@presencia/shared";

const DEBOUNCE_MS = 200;

const EMPTY: SearchResultsDto = { chats: [], messages: [], folders: [], cards: [] };

export interface SearchState {
  results: SearchResultsDto;
  loading: boolean;
  error: boolean;
  /** La query es más corta que el mínimo: no se buscó nada todavía. */
  tooShort: boolean;
}

/**
 * Busca en el servidor con debounce y cancelación (ADR-017).
 *
 * El AbortController no es un lujo: sin él las respuestas de un tecleo
 * rápido vuelven desordenadas y la lista parpadea mostrando resultados de
 * una query vieja que llegó tarde.
 */
export function useSearch(query: string, enabled: boolean): SearchState {
  const [state, setState] = useState<SearchState>({
    results: EMPTY,
    loading: false,
    error: false,
    tooShort: true,
  });
  // El fetch más reciente gana, sin importar en qué orden respondan.
  const latest = useRef(0);

  useEffect(() => {
    const q = query.trim();

    if (!enabled || q.length < SEARCH_MIN_LENGTH) {
      setState({ results: EMPTY, loading: false, error: false, tooShort: q.length > 0 });
      return;
    }

    const seq = ++latest.current;
    const controller = new AbortController();
    setState((prev) => ({ ...prev, loading: true, error: false, tooShort: false }));

    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error(String(res.status));
          return res.json() as Promise<SearchResultsDto>;
        })
        .then((results) => {
          if (seq !== latest.current) return;
          setState({ results, loading: false, error: false, tooShort: false });
        })
        .catch(() => {
          // Abortar es lo normal en cada tecleo, no un error que mostrar.
          if (controller.signal.aborted || seq !== latest.current) return;
          setState({ results: EMPTY, loading: false, error: true, tooShort: false });
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, enabled]);

  return state;
}
