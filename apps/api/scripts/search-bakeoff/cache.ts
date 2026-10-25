import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Busqueda } from "./candidatos.js";

// Caché del bake-off de búsqueda (F10.10), como el de imágenes: una consulta
// que ya corrió contra el mismo candidato no se vuelve a pagar. A diferencia
// de una imagen, una búsqueda envejece (las noticias de hoy no son las de
// mañana): para comparar candidatos, todos tienen que haber buscado el mismo
// día. Por eso la huella lleva la fecha, y una corrida de otro día busca de
// nuevo. Dentro del día, re-correr para agregar un candidato o calificar otra
// vez sale gratis.
//
// CACHE_VERSION sube cuando cambian los parámetros de un candidato
// (candidatos.ts): la huella no los ve.
//
// Vive en out/cache/ (gitignored). Para buscar todo de nuevo: SEARCH_BAKEOFF_FRESH=1.

const CACHE_VERSION = 1;

// pnpm --filter corre el script con apps/api como cwd.
export const OUT_ROOT = path.resolve("scripts/search-bakeoff/out");
const CACHE_DIR = path.join(OUT_ROOT, "cache");

export interface CachedBusqueda extends Busqueda {
  candidato: string;
  consultaId: string;
  /** ISO: cuándo se buscó y se pagó de verdad. */
  buscadaEn: string;
  segundos: number;
}

export function cacheKey(candidato: string, consulta: string, fecha: string): string {
  return createHash("sha256")
    .update(JSON.stringify({ v: CACHE_VERSION, candidato, consulta, fecha }))
    .digest("hex")
    .slice(0, 24);
}

export async function readCached(key: string): Promise<CachedBusqueda | null> {
  try {
    return JSON.parse(
      await readFile(path.join(CACHE_DIR, `${key}.json`), "utf8"),
    ) as CachedBusqueda;
  } catch {
    return null;
  }
}

export async function writeCached(key: string, entrada: CachedBusqueda): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(entrada, null, 1));
}
