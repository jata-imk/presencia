import path from "node:path";
import { Worker } from "node:worker_threads";
import type { ExtractedPage } from "./extract-text.js";

// F10.10: la extracción del HTML corre fuera del hilo principal. linkedom +
// Readability son síncronos, y el hilo principal es el que sirve los streams
// de todos los chats: una página real tarda 100-350 ms (El Universal, 2 MB:
// 180 ms), pero una con mucho markup anidado tardó 16 s medida (revisión de
// cierre de F10.10), con todos los chats congelados mientras.
//
// - Un worker por lectura, y como mucho MAX_WORKERS a la vez en todo el
//   proceso: las demás esperan turno. Sin tope, diez creators leyendo tres
//   páginas cada uno eran treinta workers de hasta 256 MB.
// - El tope de tiempo cuenta desde que el worker avisa que está listo (ya
//   cargó el parser), no desde que arranca: con la CPU ocupada, arrancar ya
//   tarda, y una página normal no debe salir como "demasiado pesada".
// - Detener el turno mata el worker en ese momento.

/** Más que cualquier página real medida; lo que pase de esto se corta. */
export const EXTRACT_TIMEOUT_MS = 8_000;
/** Para arrancar y cargar el parser; si no, el worker está atorado. */
const STARTUP_TIMEOUT_MS = 20_000;
/** Workers a la vez en el proceso. */
const MAX_WORKERS = 2;

const TOO_HEAVY: ExtractedPage = { ok: false, detail: "la página es demasiado pesada para leerla" };

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

let running = 0;
const waiting: (() => void)[] = [];

async function slot(): Promise<() => void> {
  if (running >= MAX_WORKERS) await new Promise<void>((resolve) => waiting.push(resolve));
  running += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    running -= 1;
    waiting.shift()?.();
  };
}

export async function extractHtmlOffThread(
  html: string,
  url: string,
  truncated: boolean,
  { timeoutMs = EXTRACT_TIMEOUT_MS, signal }: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<ExtractedPage> {
  const release = await slot();
  try {
    signal?.throwIfAborted();
    return await new Promise<ExtractedPage>((resolve, reject) => {
      const worker = spawn();
      let timer = setTimeout(() => {
        finish();
        reject(new Error("el lector de la página no arrancó a tiempo"));
      }, STARTUP_TIMEOUT_MS);
      const onAbort = () => {
        finish();
        const reason: unknown = signal?.reason;
        reject(reason instanceof Error ? reason : new Error("lectura detenida"));
      };
      function finish() {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        void worker.terminate();
      }
      signal?.addEventListener("abort", onAbort, { once: true });
      worker.on("message", (message: { ready?: true; page?: ExtractedPage }) => {
        if (message.ready) {
          clearTimeout(timer);
          timer = setTimeout(() => {
            finish();
            resolve(TOO_HEAVY);
          }, timeoutMs);
          worker.postMessage({ html, url, truncated });
          return;
        }
        finish();
        resolve(message.page!);
      });
      worker.once("error", (error) => {
        finish();
        reject(error);
      });
      // Sin respuesta ni error (se quedó sin memoria, por ejemplo): también es
      // un fallo. Si ya se resolvió, esto no cambia nada.
      worker.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`el lector de la página terminó sin respuesta (código ${String(code)})`));
      });
    });
  } finally {
    release();
  }
}
