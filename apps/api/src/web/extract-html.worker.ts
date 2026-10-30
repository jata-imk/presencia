import { parentPort } from "node:worker_threads";
import { extractHtml } from "./extract-html.js";

// F10.10: un worker por página (extract-html-thread.ts). Recibe el HTML ya
// decodificado y devuelve lo que extrajo; si linkedom o Readability truenan,
// el error sale por el evento `error` del worker.

parentPort?.once("message", (input: { html: string; url: string; truncated: boolean }) => {
  parentPort?.postMessage(extractHtml(input.html, input.url, input.truncated));
});
