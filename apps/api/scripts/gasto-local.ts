import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";

// El gasto de los scripts que llaman a modelos de verdad fuera de la app
// (bake-off de imágenes, ejemplos de estilos, suite cultural). No pasan por
// `ai_usage_events` (no son de ningún usuario ni de ningún chat), y sin esto
// eran gasto invisible: el prepago de Gemini se acababa sin que la base lo
// explicara.
//
// Un JSONL por máquina, fuera de git (`scripts/.gasto-local.jsonl`). El
// reporte (`pnpm --filter @presencia/api gasto`) lo suma junto a la base.

export interface GastoLocal {
  /** ISO. */
  at: string;
  /** Qué script: "estilos", "bakeoff", "suite-cultural"… */
  script: string;
  provider: string;
  model: string;
  task: "image_generate" | "image_edit" | "chat";
  inputTokens: number;
  outputTokens: number;
  imagesCount?: number;
}

// Relativo al cwd: los scripts corren con `pnpm --filter @presencia/api`, que
// los arranca desde apps/api (la API compila a CommonJS: sin import.meta).
export const GASTO_LOCAL_FILE = path.resolve("scripts/.gasto-local.jsonl");

/**
 * "google:gemini-3.1-flash-image" → { provider, model }. Ignora el
 * `@esfuerzo` de una entrada del `.env` (F10.7): el precio es del modelo, no
 * del esfuerzo, y `costOf` lo busca sin él.
 */
export function splitModelId(modelEntry: string): { provider: string; model: string } {
  const at = modelEntry.lastIndexOf("@");
  const modelId = at === -1 ? modelEntry : modelEntry.slice(0, at);
  const i = modelId.indexOf(":");
  return i === -1
    ? { provider: "desconocido", model: modelId }
    : { provider: modelId.slice(0, i), model: modelId.slice(i + 1) };
}

/** Anota un uso. Nunca tumba al script: si no se puede escribir, lo avisa y sigue. */
export async function registrarGasto(entry: Omit<GastoLocal, "at">): Promise<void> {
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry });
  try {
    await appendFile(GASTO_LOCAL_FILE, `${line}\n`, "utf8");
  } catch (error) {
    console.warn("[gasto] no se pudo registrar el uso:", error);
  }
}

export async function leerGastoLocal(): Promise<GastoLocal[]> {
  let raw: string;
  try {
    raw = await readFile(GASTO_LOCAL_FILE, "utf8");
  } catch {
    return [];
  }
  return raw
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as GastoLocal];
      } catch {
        return [];
      }
    });
}
