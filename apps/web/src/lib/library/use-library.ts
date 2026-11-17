import { useCallback, useEffect, useRef, useState } from "react";
import type { LibraryAssetDto, LibrarySummaryDto } from "@presencia/shared";
import { ApiError } from "../api.js";
import { UploadError } from "../attachments/upload.js";
import { fetchLibraryPage, fetchLibrarySummary, uploadToLibrary } from "./library-api.js";
import { libraryFileProblem, type LibraryUpload } from "./library.js";

// Los recursos de Biblioteca (F12), cada uno con su ciclo de vida (patrón de
// use-ritmo.ts): el resumen del bento, el listado paginado y las subidas.
//
// Estado local y no un store: hoy nada fuera de esta pantalla lo lee. El
// modal "Elegir de Biblioteca" (PR 5) monta su propio listado con sus propios
// filtros, así que tampoco lo compartiría.

const ERROR_GENERICO = "No pudimos cargar tu Biblioteca.";

function mensajeDe(error: unknown): string {
  return error instanceof ApiError ? error.message : ERROR_GENERICO;
}

/** El valor, pero solo cuando lleva `ms` sin cambiar: la búsqueda mientras se escribe. */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

export function useLibrarySummary() {
  const [summary, setSummary] = useState<LibrarySummaryDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  const reload = useCallback(() => {
    const token = ++request.current;
    setError(null);
    fetchLibrarySummary()
      .then((data) => {
        if (token === request.current) setSummary(data);
      })
      .catch((e: unknown) => {
        if (token === request.current) setError(mensajeDe(e));
      });
  }, []);

  useEffect(reload, [reload]);

  return { summary, error, reload };
}

interface Loaded {
  /** La consulta de la que salieron estas imágenes. */
  search: string;
  items: LibraryAssetDto[];
  nextCursor: string | null;
  /** Cuándo llegó la primera página: el "ahora" de sus grupos de fecha. */
  loadedAt: Date;
}

/**
 * El listado de una consulta, página por página.
 *
 * Al cambiar la consulta se conserva lo que había en pantalla hasta que
 * llega lo nuevo (`stale`): cada tecla de la búsqueda no puede dejar la
 * cuadrícula en esqueletos. `items` es `null` solo antes de la primera
 * respuesta.
 */
export function useLibraryItems(search: string) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Guarda de carrera: la respuesta de una consulta que ya se abandonó (o de
  // su página siguiente) no puede pisar la de la consulta actual.
  const request = useRef(0);
  const latest = useRef(loaded);
  latest.current = loaded;
  const moreInFlight = useRef(false);

  useEffect(() => {
    const token = ++request.current;
    const abort = new AbortController();
    setError(null);
    setMoreFailed(false);
    moreInFlight.current = false;
    setLoadingMore(false);
    fetchLibraryPage(search, undefined, abort.signal)
      .then((page) => {
        if (token === request.current) setLoaded({ search, ...page, loadedAt: new Date() });
      })
      .catch((e: unknown) => {
        if (token === request.current && !abort.signal.aborted) setError(mensajeDe(e));
      });
    return () => abort.abort();
  }, [search, attempt]);

  const loadMore = useCallback(() => {
    const current = latest.current;
    if (!current?.nextCursor || current.search !== search || moreInFlight.current) return;
    const token = request.current;
    moreInFlight.current = true;
    setLoadingMore(true);
    setMoreFailed(false);
    fetchLibraryPage(search, current.nextCursor)
      .then((page) => {
        if (token !== request.current) return;
        setLoaded((prev) => {
          if (!prev) return prev;
          // Una imagen subida entre dos páginas no repite ninguna (el cursor
          // es por fecha e id), pero una llave duplicada rompería la lista.
          const seen = new Set(prev.items.map((item) => item.id));
          return {
            ...prev,
            items: [...prev.items, ...page.items.filter((item) => !seen.has(item.id))],
            nextCursor: page.nextCursor,
          };
        });
      })
      .catch(() => {
        if (token === request.current) setMoreFailed(true);
      })
      .finally(() => {
        if (token !== request.current) return;
        moreInFlight.current = false;
        setLoadingMore(false);
      });
  }, [search]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    items: loaded?.items ?? null,
    loadedAt: loaded?.loadedAt ?? null,
    hasMore: Boolean(loaded?.nextCursor),
    /** Lo que se ve es de la consulta anterior; la nueva viene en camino. */
    stale: loaded !== null && loaded.search !== search,
    error,
    loadingMore,
    moreFailed,
    loadMore,
    reload,
  };
}

/** Cuántas subidas van a la vez: más no acelera y sí satura una conexión lenta. */
const UPLOADS_AT_ONCE = 3;

/**
 * Las subidas de la pantalla: una fila por archivo, con su avance y su error.
 * Lo que no pasa la revisión local (tipo, peso) entra ya como error, sin
 * viajar. `onUploaded` avisa cuando el lote terminó y algo sí subió.
 */
export function useLibraryUploads(onUploaded: () => void) {
  const [uploads, setUploads] = useState<LibraryUpload[]>([]);
  const queue = useRef<{ id: string; file: File }[]>([]);
  const active = useRef(0);
  const landed = useRef(false);
  const nextId = useRef(0);
  const notify = useRef(onUploaded);
  notify.current = onUploaded;

  const patch = useCallback((id: string, change: Partial<LibraryUpload>) => {
    setUploads((list) => list.map((u) => (u.id === id ? { ...u, ...change } : u)));
  }, []);

  const pump = useCallback(() => {
    while (active.current < UPLOADS_AT_ONCE) {
      const next = queue.current.shift();
      if (!next) break;
      active.current += 1;
      patch(next.id, { status: "uploading" });
      uploadToLibrary(next.file, (percent) => patch(next.id, { percent }))
        .promise.then(() => {
          landed.current = true;
          patch(next.id, { status: "done", percent: 100 });
        })
        .catch((e: unknown) => {
          patch(next.id, {
            status: "error",
            error:
              e instanceof UploadError && !e.retryable
                ? e.message
                : "No se pudo subir. Revisa tu conexión e inténtalo de nuevo.",
          });
        })
        .finally(() => {
          active.current -= 1;
          if (active.current === 0 && queue.current.length === 0) {
            if (landed.current) notify.current();
            landed.current = false;
          } else {
            pump();
          }
        });
    }
  }, [patch]);

  const add = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      const rows: LibraryUpload[] = files.map((file) => {
        const id = `subida-${String(nextId.current++)}`;
        const problem = libraryFileProblem(file);
        if (!problem) queue.current.push({ id, file });
        return {
          id,
          name: file.name,
          sizeBytes: file.size,
          status: problem ? "error" : "queued",
          percent: 0,
          error: problem,
        };
      });
      // Lo más nuevo arriba, como en el diseño.
      setUploads((list) => [...rows, ...list]);
      pump();
    },
    [pump],
  );

  const busy = uploads.some((u) => u.status === "queued" || u.status === "uploading");

  /** Cierra el panel. Con subidas en curso no hace nada: no hay cómo cancelarlas. */
  const clear = useCallback(() => {
    if (active.current === 0 && queue.current.length === 0) setUploads([]);
  }, []);

  return { uploads, busy, add, clear };
}
