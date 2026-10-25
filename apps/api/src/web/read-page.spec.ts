import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readPage, requiresSession } from "./read-page.js";

// F10.10: las redes que piden sesión no se piden. Lo demás de readPage es
// safeFetch + extractPage, probados en sus propios specs.

describe("requiresSession", () => {
  it.each([
    "https://www.instagram.com/p/abc/",
    "https://instagram.com/reel/xyz",
    "https://vm.tiktok.com/ZMabc/",
    "https://www.facebook.com/negocio/posts/1",
    "https://m.facebook.com/story.php",
    "https://fb.watch/abc/",
    "https://www.threads.net/@cafe",
    "https://x.com/cafe/status/1",
    "https://twitter.com/cafe/status/1",
  ])("%s pide sesión", (url) => {
    expect(requiresSession(url)).toBe(true);
  });

  it.each([
    "https://www.yucatan.com.mx/merida/nota",
    "https://notinstagram.com/",
    "https://www.linkedin.com/pulse/articulo",
    "no es una url",
  ])("%s no", (url) => {
    expect(requiresSession(url)).toBe(false);
  });
});

describe("readPage — <meta refresh>", () => {
  let server: Server;
  let base: string;
  let port: number;
  const pages: Record<string, string> = {
    "/redirigiendo": `<html><head><meta http-equiv="refresh" content="0; url=/nota"></head><body>Redirigiendo…</body></html>`,
    "/nota": `<html><head><title>Nota</title></head><body><article><p>${"Texto de la nota en Mérida. ".repeat(20)}</p></article></body></html>`,
    "/trampa": `<html><head><meta http-equiv="refresh" content="0;URL='http://169.254.169.254/latest/'"></head></html>`,
  };

  beforeAll(async () => {
    server = createServer((req, res) => {
      const page = pages[req.url ?? ""];
      if (page) res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(page);
      else res.writeHead(404).end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
    base = `http://127.0.0.1:${String(port)}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  });

  const local = () => ({
    policy: { isAllowedAddress: (ip: string) => ip === "127.0.0.1", allowedPorts: new Set([port]) },
  });

  it("sigue un redirect por <meta refresh>", async () => {
    const out = await readPage(`${base}/redirigiendo`, local());
    expect(out).toMatchObject({ status: "ok", finalUrl: `${base}/nota` });
    expect(out.status === "ok" && out.text).toContain("Texto de la nota");
  });

  it("un <meta refresh> a los metadatos del VPS se bloquea igual que un 3xx", async () => {
    expect(await readPage(`${base}/trampa`, local())).toMatchObject({ status: "bloqueada" });
  });
});

describe("readPage", () => {
  it("Instagram contesta requiere_sesion sin hacer la petición", async () => {
    // Sin servidor ni DNS: si intentara conectarse, el resolve truena.
    const out = await readPage("https://www.instagram.com/p/abc/", {
      policy: { resolve: () => Promise.reject(new Error("no debió resolver")) },
    });
    expect(out).toMatchObject({
      status: "requiere_sesion",
      url: "https://www.instagram.com/p/abc/",
    });
  });
});
