import { useCallback, useEffect, useRef, useState } from "react";
import type {
  LibraryAssetDetailDto,
  LibraryAssetDto,
  LibrarySummaryDto,
  LibraryVersionDto,
} from "@presencia/shared";
import { ApiError } from "../api.js";
import { UploadError } from "../attachments/upload.js";
import {
  fetchLibraryAsset,
  fetchLibraryPage,
  fetchLibrarySummary,
  uploadToLibrary,
} from "./library-api.js";
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
  /**
   * El "ahora" de sus grupos de fecha: cuándo llegó la primera página, o
   * cuándo se volvió a esta pestaña (una pantalla abierta desde ayer no puede
   * seguir diciendo "Hoy").
   */
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
  // La primera página viene en camino. Mientras tanto no se pide "la
  // siguiente": al recargar la misma consulta, lo que hay en pantalla todavía
  // trae el cursor de la lista vieja, y su página caería detrás de la primera
  // página nueva, saltándose las de en medio.
  const refreshing = useRef(false);

  useEffect(() => {
    const token = ++request.current;
    const abort = new AbortController();
    setError(null);
    setMoreFailed(false);
    moreInFlight.current = false;
    refreshing.current = true;
    setLoadingMore(false);
    fetchLibraryPage(search, undefined, abort.signal)
      .then((page) => {
        if (token !== request.current) return;
        refreshing.current = false;
        setLoaded({ search, ...page, loadedAt: new Date() });
      })
      .catch((e: unknown) => {
        if (token !== request.current || abort.signal.aborted) return;
        refreshing.current = false;
        setError(mensajeDe(e));
      });
    return () => abort.abort();
  }, [search, attempt]);

  // Al volver a la pestaña se refresca el "ahora" de los grupos de fecha.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      setLoaded((prev) => prev && { ...prev, loadedAt: new Date() });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const loadMore = useCallback(() => {
    const current = latest.current;
    if (!current?.nextCursor || current.search !== search) return;
    if (moreInFlight.current || refreshing.current) return;
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

  /**
   * Pone imágenes nuevas al principio de lo cargado, sin volver a pedir nada:
   * lo recién subido, cuando no hay filtros que pudiera no cumplir. Recargar
   * tiraría las páginas ya cargadas y el lugar donde iba la lectura.
   */
  const prepend = useCallback((assets: LibraryAssetDto[]) => {
    setLoaded((prev) => {
      if (!prev) return prev;
      const fresh = new Set(assets.map((asset) => asset.id));
      return { ...prev, items: [...assets, ...prev.items.filter((item) => !fresh.has(item.id))] };
    });
  }, []);

  /**
   * Quita de lo cargado las imágenes que se acaban de eliminar, sin volver a
   * pedir nada (por lo mismo que `prepend`). El cursor sigue sirviendo: es por
   * fecha e id, no por posición.
   */
  const remove = useCallback((ids: readonly string[]) => {
    const gone = new Set(ids);
    setLoaded(
      (prev) => prev && { ...prev, items: prev.items.filter((item) => !gone.has(item.id)) },
    );
  }, []);

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
    prepend,
    remove,
  };
}

/**
 * El detalle de una imagen (con su historial de versiones). Mientras llega,
 * `detail` es `null` y el panel pinta lo que ya trae el listado; `failed` si
 * no se pudo (la imagen se eliminó en otra pestaña, o sin red).
 *
 * `versions` sobrevive al salto entre versiones de la misma imagen: el
 * historial de la anterior es también el de la nueva, y sin esto la sección
 * desaparecía y volvía con cada clic. `reload` lo vuelve a pedir (después de
 * eliminar una de sus versiones).
 */
export function useLibraryAsset(id: string | null) {
  const [state, setState] = useState<{
    id: string;
    detail: LibraryAssetDetailDto | null;
    failed: boolean;
  } | null>(null);
  const [lastVersions, setLastVersions] = useState<LibraryVersionDto[] | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!id) return;
    const abort = new AbortController();
    setState({ id, detail: null, failed: false });
    fetchLibraryAsset(id, abort.signal)
      .then((detail) => {
        setState({ id, detail, failed: false });
        setLastVersions(detail.versions);
      })
      .catch(() => {
        if (!abort.signal.aborted) setState({ id, detail: null, failed: true });
      });
    return () => abort.abort();
  }, [id, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  // Lo de otra imagen (la anterior, mientras llega la nueva) no se muestra.
  const current = state && state.id === id ? state : null;
  const detail = current?.detail ?? null;
  const versions =
    detail?.versions ??
    (id && lastVersions?.some((version) => version.assetId === id) ? lastVersions : null);
  return { detail, versions, failed: current?.failed ?? false, reload };
}

/** Cuántas subidas van a la vez: más no acelera y sí satura una conexión lenta. */
const UPLOADS_AT_ONCE = 3;

/**
 * Las subidas de la pantalla: una fila por archivo, con su avance y su error.
 * Lo que no pasa la revisión local (tipo, peso) entra ya como error, sin
 * viajar. `onUploaded` avisa cuando el lote terminó, con lo que sí subió (lo
 * más nuevo primero).
 *
 * Salir de la pantalla no cancela lo que va en camino, a propósito: el
 * archivo ya se eligió y llega a Biblioteca igual. Lo que se apaga es el
 * aviso a una pantalla que ya no está.
 */
export function useLibraryUploads(onUploaded: (assets: LibraryAssetDto[]) => void) {
  const [uploads, setUploads] = useState<LibraryUpload[]>([]);
  const queue = useRef<{ id: string; file: File }[]>([]);
  const active = useRef(0);
  const landed = useRef<LibraryAssetDto[]>([]);
  const nextId = useRef(0);
  const notify = useRef(onUploaded);
  notify.current = onUploaded;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const patch = useCallback((id: string, change: Partial<LibraryUpload>) => {
    if (!mounted.current) return;
    setUploads((list) => list.map((u) => (u.id === id ? { ...u, ...change } : u)));
  }, []);

  const pump = useCallback(() => {
    while (active.current < UPLOADS_AT_ONCE) {
      const next = queue.current.shift();
      if (!next) break;
      active.current += 1;
      patch(next.id, { status: "uploading" });
      uploadToLibrary(next.file, (percent) => patch(next.id, { percent }))
        .promise.then((asset) => {
          landed.current.unshift(asset);
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
            const assets = landed.current;
            landed.current = [];
            if (assets.length > 0 && mounted.current) notify.current(assets);
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
