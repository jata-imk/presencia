import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { safeFetch, type SafeFetchOptions } from "./safe-fetch.js";

// F10.10: la guardia SSRF y los topes del lector. Un servidor de verdad en
// 127.0.0.1: con la política real, el propio servidor de prueba es lo primero
// que se bloquea; para los casos que sí descargan, la prueba abre solo esa
// dirección y ese puerto.

type Handler = (req: IncomingMessage, res: ServerResponse) => void;
const routes = new Map<string, Handler>();
let server: Server;
let port: number;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    const handler = routes.get(req.url ?? "");
    if (handler) handler(req, res);
    else res.writeHead(404).end("no");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${String(port)}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
});

/** Solo el servidor de prueba: 127.0.0.1 en su puerto. */
const local = (): SafeFetchOptions["policy"] => ({
  isAllowedAddress: (ip) => ip === "127.0.0.1",
  allowedPorts: new Set([port]),
});

const html =
  (body: string): Handler =>
  (_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(body);
  };

describe("safeFetch — direcciones", () => {
  it("con la política real, el servidor local (loopback) está bloqueado", async () => {
    routes.set("/hola", html("<p>hola</p>"));
    const out = await safeFetch(`${base}/hola`, { policy: { allowedPorts: new Set([port]) } });
    expect(out).toMatchObject({ ok: false, status: "bloqueada" });
  });

  it.each([
    "http://169.254.169.254/latest/meta-data/",
    "http://2130706433/",
    "http://0177.0.0.1/",
    "http://0x7f.1/",
    "http://[::1]/",
    "http://[::ffff:10.0.0.1]/",
    "http://10.0.0.8/",
  ])("bloquea %s sin conectarse", async (url) => {
    expect(await safeFetch(url)).toMatchObject({ ok: false, status: "bloqueada" });
  });

  it.each([
    ["http://ejemplo.mx:8080/", "puerto 8080"],
    ["ftp://ejemplo.mx/archivo", "protocolo ftp:"],
    ["file:///etc/passwd", "protocolo file:"],
    ["http://usuario:clave@ejemplo.mx/", "credenciales en la URL"],
  ])("bloquea %s (%s)", async (url, detail) => {
    expect(await safeFetch(url)).toEqual({ ok: false, status: "bloqueada", detail });
  });

  it("bloquea un dominio que resuelve a una IP privada", async () => {
    const out = await safeFetch("http://interno.ejemplo.mx/", {
      policy: { resolve: () => Promise.resolve([{ address: "10.0.0.5", family: 4 }]) },
    });
    expect(out).toMatchObject({ ok: false, status: "bloqueada" });
  });

  it("bloquea un dominio que mezcla una IP pública con una privada", async () => {
    const out = await safeFetch("http://mixto.ejemplo.mx/", {
      policy: {
        resolve: () =>
          Promise.resolve([
            { address: "8.8.8.8", family: 4 },
            { address: "192.168.0.10", family: 4 },
          ]),
      },
    });
    expect(out).toMatchObject({ ok: false, status: "bloqueada" });
  });

  it("un dominio que no existe es no_encontrada", async () => {
    const out = await safeFetch("http://no-existe.ejemplo.mx/", {
      policy: {
        resolve: () => Promise.reject(Object.assign(new Error("x"), { code: "ENOTFOUND" })),
      },
    });
    expect(out).toMatchObject({ ok: false, status: "no_encontrada" });
  });

  it("un DNS que falla por un rato no es 'no existe'", async () => {
    const out = await safeFetch("http://lento.ejemplo.mx/", {
      policy: {
        resolve: () => Promise.reject(Object.assign(new Error("x"), { code: "EAI_AGAIN" })),
      },
    });
    expect(out).toMatchObject({ ok: false, status: "no_disponible" });
  });

  it("un DNS que no contesta corta con el tiempo total", async () => {
    const out = await safeFetch("http://mudo.ejemplo.mx/", {
      timeoutMs: 200,
      policy: { resolve: () => new Promise(() => undefined) },
    });
    expect(out).toMatchObject({ ok: false, status: "tiempo" });
  });

  it("prueba la IPv4 primero (el VPS no tiene ruta IPv6)", async () => {
    routes.set("/dual", html("<p>dual</p>"));
    const out = await safeFetch(`http://dual.invalid:${String(port)}/dual`, {
      policy: {
        isAllowedAddress: (ip) => ip === "127.0.0.1" || ip === "2001:db8::1",
        allowedPorts: new Set([port]),
        // AAAA primero, como lo devuelve un dual-stack con verbatim.
        resolve: () =>
          Promise.resolve([
            { address: "2001:db8::1", family: 6 },
            { address: "127.0.0.1", family: 4 },
          ]),
      },
    });
    expect(out).toMatchObject({ ok: true });
  });

  it("se conecta a la dirección ya validada, no a un lookup nuevo", async () => {
    routes.set("/fijada", html("<p>llegó</p>"));
    // "pagina.invalid" no existe en ningún DNS: si llega, es porque la
    // conexión usó la dirección que validamos.
    const out = await safeFetch(`http://pagina.invalid:${String(port)}/fijada`, {
      policy: {
        ...local(),
        resolve: () => Promise.resolve([{ address: "127.0.0.1", family: 4 }]),
      },
    });
    expect(out).toMatchObject({ ok: true, kind: "html" });
  });
});

describe("safeFetch — redirects", () => {
  it("sigue un redirect y devuelve la URL final", async () => {
    routes.set("/corto", (_req, res) => res.writeHead(301, { Location: "/final" }).end());
    routes.set("/final", html("<p>final</p>"));
    const out = await safeFetch(`${base}/corto`, { policy: local() });
    expect(out).toMatchObject({ ok: true, finalUrl: `${base}/final` });
  });

  it("bloquea un redirect a los metadatos del VPS", async () => {
    routes.set("/trampa", (_req, res) =>
      res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data/" }).end(),
    );
    expect(await safeFetch(`${base}/trampa`, { policy: local() })).toMatchObject({
      ok: false,
      status: "bloqueada",
    });
  });

  it("corta un ciclo de redirects", async () => {
    routes.set("/ciclo", (_req, res) => res.writeHead(302, { Location: "/ciclo" }).end());
    expect(await safeFetch(`${base}/ciclo`, { policy: local() })).toMatchObject({
      ok: false,
      status: "no_disponible",
      detail: "más de 5 redirects",
    });
  });

  it("refuse corta antes de conectarse, también en un redirect", async () => {
    routes.set("/a-ig", (_req, res) =>
      res.writeHead(302, { Location: "https://www.instagram.com/p/abc/" }).end(),
    );
    const out = await safeFetch(`${base}/a-ig`, {
      policy: local(),
      refuse: (url) =>
        url.hostname.endsWith("instagram.com") ? { status: "requiere_sesion", detail: "ig" } : null,
    });
    expect(out).toEqual({ ok: false, status: "requiere_sesion", detail: "ig" });
  });
});

describe("safeFetch — respuestas", () => {
  it.each([
    [404, "no_encontrada"],
    [410, "no_encontrada"],
    [401, "requiere_sesion"],
    [403, "requiere_sesion"],
    [429, "no_disponible"],
    [503, "no_disponible"],
  ])("HTTP %i es %s", async (code, status) => {
    routes.set(`/estado-${String(code)}`, (_req, res) => res.writeHead(code).end());
    expect(await safeFetch(`${base}/estado-${String(code)}`, { policy: local() })).toMatchObject({
      ok: false,
      status,
    });
  });

  it("una imagen no se descarga", async () => {
    routes.set("/foto.png", (_req, res) =>
      res.writeHead(200, { "Content-Type": "image/png" }).end("x"),
    );
    expect(await safeFetch(`${base}/foto.png`, { policy: local() })).toMatchObject({
      ok: false,
      status: "tipo_no_soportado",
    });
  });

  it("descomprime gzip y respeta el charset del header", async () => {
    routes.set("/gz", (_req, res) =>
      res
        .writeHead(200, {
          "Content-Type": "text/html; charset=ISO-8859-1",
          "Content-Encoding": "gzip",
        })
        .end(gzipSync(Buffer.from("<p>Mérida</p>", "latin1"))),
    );
    const out = await safeFetch(`${base}/gz`, { policy: local() });
    expect(out).toMatchObject({ ok: true, charset: "ISO-8859-1", truncated: false });
    if (out.ok) expect(Buffer.from(out.body).toString("latin1")).toBe("<p>Mérida</p>");
  });

  it("un HTML de más se corta en el tope y avisa", async () => {
    routes.set("/grande", html("x".repeat(5_000)));
    const out = await safeFetch(`${base}/grande`, { policy: local(), maxBytes: 1_000 });
    expect(out).toMatchObject({ ok: true, truncated: true });
    if (out.ok) expect(out.body.length).toBe(1_000);
  });

  it("los bytes se cuentan descomprimidos (un gzip chico que infla)", async () => {
    routes.set("/bomba", (_req, res) =>
      res
        .writeHead(200, { "Content-Type": "text/html", "Content-Encoding": "gzip" })
        .end(gzipSync(Buffer.alloc(10_000_000))),
    );
    const out = await safeFetch(`${base}/bomba`, { policy: local(), maxBytes: 100_000 });
    expect(out).toMatchObject({ ok: true, truncated: true });
    if (out.ok) expect(out.body.length).toBe(100_000);
  });

  it("un PDF de más es muy_grande: a medias no se lee", async () => {
    routes.set("/doc.pdf", (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/pdf" });
      res.end(Buffer.alloc(5_000));
    });
    expect(await safeFetch(`${base}/doc.pdf`, { policy: local(), maxBytes: 1_000 })).toMatchObject({
      ok: false,
      status: "muy_grande",
    });
  });

  it("una página que no contesta es tiempo", async () => {
    routes.set("/lenta", () => {
      // Nunca contesta.
    });
    expect(await safeFetch(`${base}/lenta`, { policy: local(), timeoutMs: 200 })).toMatchObject({
      ok: false,
      status: "tiempo",
    });
  });

  it("una conexión que se cae a media respuesta comprimida no espera al timeout", async () => {
    routes.set("/cortada", (_req, res) => {
      const gz = gzipSync(Buffer.from("x".repeat(200_000)));
      res.writeHead(200, { "Content-Type": "text/html", "Content-Encoding": "gzip" });
      res.write(gz.subarray(0, 100));
      setTimeout(() => res.socket?.destroy(), 20);
    });
    const arranque = Date.now();
    const out = await safeFetch(`${base}/cortada`, { policy: local(), timeoutMs: 5_000 });
    expect(out).toMatchObject({ ok: false, status: "no_disponible" });
    expect(Date.now() - arranque).toBeLessThan(2_000);
  });

  it("si quien llama cancela, no es un timeout", async () => {
    routes.set("/cancelada", () => {
      // Nunca contesta.
    });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);
    expect(
      await safeFetch(`${base}/cancelada`, { policy: local(), signal: controller.signal }),
    ).toMatchObject({ ok: false, status: "no_disponible" });
  });
});
