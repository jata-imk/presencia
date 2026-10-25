import type { WebReadStatus } from "@presencia/shared";
import { extractPage, metaRefreshTarget } from "./extract.js";
import {
  safeFetch,
  WEB_FETCH_MAX_REDIRECTS,
  WEB_FETCH_TIMEOUT_MS,
  type SafeFetchOptions,
} from "./safe-fetch.js";

// F10.10 (ADR-028): leer una página = descargarla con la guardia SSRF y sacar
// su texto. Una función pura de red: no guarda nada ni sabe de chats; el caché
// y la tabla `web_reads` son del PR que la conecta a la tool.

/**
 * Redes que no muestran contenido sin sesión. Pedirlas devuelve la página de
 * login (o un muro), y su texto haría creer al modelo que leyó algo: se
 * contestan sin hacer la petición. Es una lista corta a propósito: un sitio
 * con login a medias (LinkedIn, Medium) sí se intenta, y si no hay texto sale
 * `no_legible`.
 */
const SESSION_DOMAINS = [
  "instagram.com",
  "tiktok.com",
  "facebook.com",
  "fb.com",
  "fb.watch",
  "threads.net",
  "threads.com",
  "x.com",
  "twitter.com",
];

export function requiresSession(url: string): boolean {
  let host: string;
  try {
    // Sin el punto final: `www.instagram.com.` es el mismo host.
    host = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return false;
  }
  return SESSION_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

export type PageRead =
  | {
      status: "ok";
      url: string;
      finalUrl: string;
      title: string | null;
      siteName: string | null;
      text: string;
      truncated: boolean;
      onlyDescription: boolean;
    }
  | {
      status: Exclude<WebReadStatus, "ok">;
      url: string;
      /** Si se llegó a descargar algo: a dónde llevaron los redirects. */
      finalUrl: string | null;
      /** Para los logs y la traza, no para el creator. */
      detail: string;
    };

/** Redirects por `<meta refresh>` que se siguen, además de los 3xx de safeFetch. */
const MAX_META_REFRESH = 2;

export async function readPage(url: string, options: SafeFetchOptions = {}): Promise<PageRead> {
  // Un solo reloj y un solo presupuesto de redirects para toda la lectura,
  // con los <meta refresh> incluidos: si no, cada salto empezaría de cero.
  const signal = AbortSignal.any(
    [AbortSignal.timeout(options.timeoutMs ?? WEB_FETCH_TIMEOUT_MS), options.signal].filter(
      (s): s is AbortSignal => s !== undefined,
    ),
  );
  let redirectsLeft = WEB_FETCH_MAX_REDIRECTS;
  const fetchOnce = (target: string) =>
    safeFetch(target, {
      ...options,
      signal,
      maxRedirects: redirectsLeft,
      // En cada salto: un acortador (bit.ly) puede llevar a Instagram. Primero
      // lo que pida quien llama.
      refuse: (next) =>
        options.refuse?.(next) ??
        (requiresSession(next.href)
          ? { status: "requiere_sesion", detail: `${next.hostname} pide sesión` }
          : null),
    });
  let fetched = await fetchOnce(url);
  // Cada salto vuelve a pasar por safeFetch completo: la guardia SSRF no
  // distingue un 3xx de un <meta refresh>.
  for (let hop = 0; hop < MAX_META_REFRESH && fetched.ok && fetched.kind === "html"; hop++) {
    const next = metaRefreshTarget(fetched.body, fetched.finalUrl);
    if (!next || next === fetched.finalUrl) break;
    redirectsLeft -= fetched.redirects + 1;
    if (redirectsLeft < 0) {
      return { status: "bloqueada", url, finalUrl: null, detail: "demasiados redirects" };
    }
    fetched = await fetchOnce(next);
  }
  if (!fetched.ok) return { status: fetched.status, url, finalUrl: null, detail: fetched.detail };
  const page = await extractPage({ ...fetched, url: fetched.finalUrl });
  if (!page.ok)
    return { status: "no_legible", url, finalUrl: fetched.finalUrl, detail: page.detail };
  return {
    status: "ok",
    url,
    finalUrl: fetched.finalUrl,
    title: page.title,
    siteName: page.siteName,
    text: page.text,
    truncated: page.truncated,
    onlyDescription: page.onlyDescription,
  };
}
