import { parentPort } from "node:worker_threads";
import { extractHtml } from "./extract-html.js";

// F10.10: un worker por página (extract-html-thread.ts). Avisa que está listo
// cuando ya cargó linkedom y Readability (el tope de tiempo cuenta desde ahí,
// no desde que arranca), recibe el HTML ya decodificado y devuelve lo que
// extrajo. Si el parser truena, el error sale por el evento `error`.

parentPort?.once("message", (input: { html: string; url: string; truncated: boolean }) => {
  parentPort?.postMessage({ page: extractHtml(input.html, input.url, input.truncated) });
});
parentPort?.postMessage({ ready: true });
