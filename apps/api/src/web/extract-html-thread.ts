import path from "node:path";
import { Worker } from "node:worker_threads";
import type { ExtractedPage } from "./extract-html.js";

// F10.10: la extracción del HTML corre fuera del hilo principal. linkedom +
// Readability son síncronos, y el hilo principal es el que sirve los streams
// de todos los chats: una página real tarda 100-350 ms (El Universal, 2 MB:
// 180 ms), pero una con mucho markup anidado tardó 16 s medida (revisión de
// cierre de F10.10), con todos los chats congelados mientras. Un worker por
// lectura (máximo 3 por turno), con tope de tiempo: si no termina, se mata y
// la página queda `no_legible`.

/** Más que cualquier página real medida; lo que pase de esto se corta. */
export const EXTRACT_TIMEOUT_MS = 8_000;

const EXT = path.extname(__filename);
const WORKER_FILE = path.join(__dirname, `extract-html.worker${EXT}`);

function spawn(): Worker {
  const options = { resourceLimits: { maxOldGenerationSizeMb: 256 } };
  // En dev (tsx) el worker no hereda el cargador de TypeScript: se registra a
  // mano. En producción es el .js compilado.
  return EXT === ".ts"
    ? new Worker(`require("tsx/cjs"); require(${JSON.stringify(WORKER_FILE)});`, {
        ...options,
        eval: true,
      })
    : new Worker(WORKER_FILE, options);
}

export function extractHtmlOffThread(
  html: string,
  url: string,
  truncated: boolean,
  timeoutMs = EXTRACT_TIMEOUT_MS,
): Promise<ExtractedPage> {
  return new Promise((resolve, reject) => {
    const worker = spawn();
    const finish = () => {
      clearTimeout(timer);
      void worker.terminate();
    };
    const timer = setTimeout(() => {
      finish();
      resolve({ ok: false, detail: "la página es demasiado pesada para leerla" });
    }, timeoutMs);
    worker.once("message", (page: ExtractedPage) => {
      finish();
      resolve(page);
    });
    worker.once("error", (error) => {
      finish();
      reject(error);
    });
    // Sin mensaje ni error (se quedó sin memoria, por ejemplo): también es un
    // fallo. Si ya se resolvió, esto no cambia nada.
    worker.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`el lector de la página terminó sin respuesta (código ${String(code)})`));
    });
    worker.postMessage({ html, url, truncated });
  });
}
