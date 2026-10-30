import { lookup as dnsLookup } from "node:dns/promises";
import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { pipeline, type Readable } from "node:stream";
import type { WebReadStatus } from "@presencia/shared";
import { ALLOWED_PORTS, isPublicAddress } from "./ip-policy.js";

// F10.10 (ADR-028): la única puerta por la que el servidor pide una página de
// afuera. Todo lo que hace es por seguridad (SSRF) o por topes:
//
// - Solo http(s), solo los puertos 80 y 443, sin usuario:contraseña en la URL.
// - El DNS se resuelve AQUÍ, se rechaza si alguna dirección no es unicast
//   pública (ip-policy.ts), y la conexión va a esa misma dirección: el
//   `lookup` del request la devuelve ya validada. Sin eso, un segundo lookup
//   del propio http podría contestar otra cosa (DNS rebinding). El certificado
//   TLS se sigue validando contra el nombre, no contra la IP.
// - Los redirects se siguen a mano y cada salto pasa por todo lo anterior: un
//   link público puede redirigir a `http://169.254.169.254/`.
// - Sin cookies ni credenciales; un User-Agent que dice quién es.
// - Tiempo total (no por salto), bytes contados DESPUÉS de descomprimir (un
//   gzip chico puede inflar a gigas) y una allowlist de tipos.
//
// No interpreta el contenido: eso es extract.ts.

/** Lo que se descarga como máximo, ya descomprimido. */
export const WEB_FETCH_MAX_BYTES = 2 * 1024 * 1024;
export const WEB_FETCH_TIMEOUT_MS = 10_000;
export const WEB_FETCH_MAX_REDIRECTS = 5;

const USER_AGENT =
  "Mozilla/5.0 (compatible; PresenciaBot/1.0; +https://github.com/jata-imk/presencia)";

/** Los tipos que se leen. Lo demás (imágenes, video, zip) ni se descarga. */
const ALLOWED_TYPES: Record<string, FetchedKind> = {
  "text/html": "html",
  "application/xhtml+xml": "html",
  "text/plain": "text",
  "text/markdown": "text",
  "application/pdf": "pdf",
};

export type FetchedKind = "html" | "text" | "pdf";

export type SafeFetchResult =
  | {
      ok: true;
      /** Después de los redirects: es la que se guarda y la que se cita. */
      finalUrl: string;
      kind: FetchedKind;
      /** Del header Content-Type; el HTML puede traer el suyo en un <meta>. */
      charset: string | null;
      body: Uint8Array;
      /** Se cortó en WEB_FETCH_MAX_BYTES (solo HTML y texto: un PDF a medias no se lee). */
      truncated: boolean;
      /** Cuántos redirects siguió para llegar. */
      redirects: number;
    }
  | { ok: false; status: Exclude<WebReadStatus, "ok" | "no_legible">; detail: string };

type Failure = Extract<SafeFetchResult, { ok: false }>;

export interface SafeFetchOptions {
  signal?: AbortSignal;
  /**
   * Se consulta antes de cada petición, también en cada redirect: lo que
   * devuelva corta ahí sin conectarse. Así un acortador que lleva a Instagram
   * no descarga la página de login.
   */
  refuse?: (url: URL) => Pick<Failure, "status" | "detail"> | null;
  timeoutMs?: number;
  maxBytes?: number;
  /** Para quien encadena saltos propios (los <meta refresh> de read-page): los que quedan. */
  maxRedirects?: number;
  /**
   * Solo para tests: el servidor de prueba vive en 127.0.0.1 y en un puerto
   * alto. Producción nunca los pasa, y los defaults son la política real.
   */
  policy?: {
    isAllowedAddress?: (ip: string) => boolean;
    allowedPorts?: ReadonlySet<number>;
    resolve?: (hostname: string) => Promise<{ address: string; family: number }[]>;
  };
}

const fail = (status: Failure["status"], detail: string): Failure => ({
  ok: false,
  status,
  detail,
});

export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const isAllowedAddress = options.policy?.isAllowedAddress ?? isPublicAddress;
  const allowedPorts = options.policy?.allowedPorts ?? ALLOWED_PORTS;
  const resolve =
    options.policy?.resolve ?? ((host) => dnsLookup(host, { all: true, verbatim: true }));
  const maxBytes = options.maxBytes ?? WEB_FETCH_MAX_BYTES;
  const signal = AbortSignal.any(
    [AbortSignal.timeout(options.timeoutMs ?? WEB_FETCH_TIMEOUT_MS), options.signal].filter(
      (s): s is AbortSignal => s !== undefined,
    ),
  );

  const maxRedirects = options.maxRedirects ?? WEB_FETCH_MAX_REDIRECTS;
  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = checkUrl(current, allowedPorts, options.refuse);
    if (!(url instanceof URL)) return url;

    const addresses = await resolveAllowed(url.hostname, resolve, isAllowedAddress, signal);
    if (!Array.isArray(addresses)) return addresses;

    let res: IncomingMessage;
    try {
      res = await request(url, addresses, signal);
    } catch (error) {
      return networkFailure(error, signal);
    }

    const status = res.statusCode ?? 0;
    if (status >= 300 && status < 400 && res.headers.location) {
      res.destroy();
      try {
        current = new URL(res.headers.location, url).href;
      } catch {
        return fail("no_disponible", `redirect inválido: ${res.headers.location}`);
      }
      continue;
    }
    if (status < 200 || status >= 300) {
      res.destroy();
      return httpFailure(status);
    }

    const { type, charset } = parseContentType(res.headers["content-type"]);
    const kind = ALLOWED_TYPES[type];
    if (!kind) {
      res.destroy();
      return fail("tipo_no_soportado", type || "sin content-type");
    }
    const declared = Number(res.headers["content-length"]);
    if (kind === "pdf" && Number.isFinite(declared) && declared > maxBytes) {
      res.destroy();
      return fail("muy_grande", `${String(declared)} bytes`);
    }

    try {
      const { body, truncated } = await readCapped(decoded(res), maxBytes, signal);
      if (kind === "pdf" && truncated)
        return fail("muy_grande", `más de ${String(maxBytes)} bytes`);
      return { ok: true, finalUrl: url.href, kind, charset, body, truncated, redirects: hop };
    } catch (error) {
      return networkFailure(error, signal);
    } finally {
      res.destroy();
    }
  }
  // Un ciclo o una cadena larga de redirects es un sitio que falla, no un
  // bloqueo de seguridad: decirle "bloqueada" al creator lo confundía.
  return fail("no_disponible", `más de ${String(WEB_FETCH_MAX_REDIRECTS)} redirects`);
}

type Address = { address: string; family: number };

function checkUrl(
  raw: string,
  allowedPorts: ReadonlySet<number>,
  refuse: SafeFetchOptions["refuse"],
): URL | Failure {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return fail("no_encontrada", "no es una URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return fail("bloqueada", `protocolo ${url.protocol}`);
  }
  if (url.username || url.password) return fail("bloqueada", "credenciales en la URL");
  // Antes que el puerto: "pide sesión" le dice más al creator que "bloqueada".
  const refused = refuse?.(url);
  if (refused) return fail(refused.status, refused.detail);
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (!allowedPorts.has(port)) return fail("bloqueada", `puerto ${String(port)}`);
  return url;
}

/** Hostname de un URL sin los corchetes de una IPv6 literal. */
function bareHost(hostname: string): string {
  return hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
}

/**
 * Las direcciones del host, todas validadas, con las IPv4 primero: el VPS de
 * OVH no tiene ruta IPv6, y un sitio dual-stack que contesta AAAA primero
 * fallaría con ENETUNREACH aunque su IPv4 sirva.
 */
async function resolveAllowed(
  hostname: string,
  resolve: NonNullable<NonNullable<SafeFetchOptions["policy"]>["resolve"]>,
  isAllowedAddress: (ip: string) => boolean,
  signal: AbortSignal,
): Promise<Address[] | Failure> {
  const host = bareHost(hostname);
  // `new URL` ya normalizó 2130706433, 0177.0.0.1 y 0x7f.1 a 127.0.0.1.
  const literal = isIP(host);
  if (literal) {
    return isAllowedAddress(host)
      ? [{ address: host, family: literal }]
      : fail("bloqueada", `dirección ${host}`);
  }
  let addresses: Address[];
  try {
    // getaddrinfo no se puede cancelar, pero no hay por qué esperarlo: un
    // nameserver que no contesta tarda ~30 s en rendirse.
    addresses = await raceAbort(resolve(host), signal);
  } catch (error) {
    if (signal.aborted) return networkFailure(error, signal);
    const code = (error as { code?: string }).code;
    return code === "ENOTFOUND" || code === "ENODATA"
      ? fail("no_encontrada", `el dominio ${host} no existe`)
      : fail("no_disponible", `DNS de ${host}: ${code ?? "sin respuesta"}`);
  }
  if (addresses.length === 0) return fail("no_encontrada", `el dominio ${host} no resuelve`);
  // Si UNA de las direcciones es interna, no se usa ninguna: un dominio que
  // mezcla una pública y una privada está apuntando adonde no debe.
  const bad = addresses.find((a) => !isAllowedAddress(a.address));
  if (bad) return fail("bloqueada", `${host} resuelve a ${bad.address}`);
  return [...addresses].sort((a, b) => a.family - b.family);
}

function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason as Error);
  return new Promise<T>((resolvePromise, reject) => {
    const onAbort = () => reject(signal.reason as Error);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolvePromise(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        // Los de DNS son Error con `code`, que resolveAllowed lee.
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

function request(url: URL, addresses: Address[], signal: AbortSignal): Promise<IncomingMessage> {
  // La conexión va a las direcciones ya validadas, nunca a un lookup nuevo.
  // Con `all`, Node prueba una tras otra (autoSelectFamily).
  const pinned: LookupFunction = (_hostname, opts, callback) => {
    if (opts.all) callback(null, addresses);
    else callback(null, addresses[0]!.address, addresses[0]!.family);
  };
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolvePromise, reject) => {
    const req = client.request(
      url,
      {
        method: "GET",
        lookup: pinned,
        agent: false,
        signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,application/pdf;q=0.8",
          "Accept-Language": "es-MX,es;q=0.9,en;q=0.5",
          "Accept-Encoding": "gzip, deflate, br",
        },
      },
      resolvePromise,
    );
    req.on("error", reject);
    req.end();
  });
}

function decoded(res: IncomingMessage): Readable {
  const encoding = (res.headers["content-encoding"] ?? "").toLowerCase().trim();
  const decompressor =
    encoding === "gzip" || encoding === "x-gzip"
      ? createGunzip()
      : encoding === "deflate"
        ? createInflate()
        : encoding === "br"
          ? createBrotliDecompress()
          : null;
  if (!decompressor) return res;
  // pipeline y no pipe: si la conexión se cae a media respuesta, el error
  // llega al descompresor y el for-await de readCapped termina ya, en vez de
  // esperar al timeout. El callback solo evita un error sin manejar: quien
  // lee ve el mismo error en el stream.
  return pipeline(res, decompressor, () => undefined);
}

/** Lee hasta `maxBytes` (ya descomprimidos) y corta ahí. */
async function readCapped(
  stream: Readable,
  maxBytes: number,
  signal: AbortSignal,
): Promise<{ body: Uint8Array; truncated: boolean }> {
  const chunks: Buffer[] = [];
  let size = 0;
  let truncated = false;
  const onAbort = () =>
    stream.destroy(signal.reason instanceof Error ? signal.reason : new Error("abort"));
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    for await (const chunk of stream) {
      const buf = chunk as Buffer;
      if (size + buf.length > maxBytes) {
        chunks.push(buf.subarray(0, maxBytes - size));
        size = maxBytes;
        truncated = true;
        break;
      }
      chunks.push(buf);
      size += buf.length;
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    stream.destroy();
  }
  return { body: new Uint8Array(Buffer.concat(chunks, size)), truncated };
}

function parseContentType(header: string | undefined): { type: string; charset: string | null } {
  const [type = "", ...params] = (header ?? "").split(";");
  const charset = params
    .map((p) => p.trim())
    .find((p) => p.toLowerCase().startsWith("charset="))
    ?.slice("charset=".length)
    .replace(/"/g, "")
    .trim();
  return { type: type.trim().toLowerCase(), charset: charset || null };
}

function httpFailure(status: number): Failure {
  if (status === 401 || status === 402 || status === 403 || status === 407 || status === 451) {
    return fail("requiere_sesion", `HTTP ${String(status)}`);
  }
  if (status === 404 || status === 410) return fail("no_encontrada", `HTTP ${String(status)}`);
  return fail("no_disponible", `HTTP ${String(status)}`);
}

function networkFailure(error: unknown, signal: AbortSignal): Failure {
  if (signal.aborted) {
    const reason: unknown = signal.reason;
    // El abort de quien llama (el creator le dio Detener) no es un timeout.
    if (reason instanceof DOMException && reason.name === "TimeoutError") {
      return fail("tiempo", "no contestó a tiempo");
    }
    return fail("no_disponible", "se canceló");
  }
  const code = (error as { code?: string }).code ?? "";
  if (code === "ENOTFOUND") return fail("no_encontrada", "el dominio no existe");
  return fail("no_disponible", code || (error instanceof Error ? error.message : String(error)));
}
