import { existsSync } from "node:fs";
import path from "node:path";
import express from "express";

// El SPA de apps/web lo sirve ESTE proceso, no un nginx aparte ni un
// contenedor de estáticos (ADR-020). La razón no es comodidad: apps/web no
// tiene ninguna variable de entorno y llama a la API con rutas relativas
// (`/api/...`), así que web y API tienen que responder bajo el mismo origen o
// no hay app. Servirlos desde el mismo proceso lo garantiza sin configurar
// nada.
//
// La imagen copia el build a apps/web/dist, al lado del dist de la API
// (ver Dockerfile). Desde apps/api/dist esa ruta es ../../web/dist.
const WEB_DIST = path.resolve(__dirname, "../../web/dist");
const INDEX_HTML = path.join(WEB_DIST, "index.html");
const ASSETS_DIR = `${path.sep}assets${path.sep}`;

/**
 * Deja el SPA servido en todo lo que no cuelgue de `/api`. Solo en producción:
 * en dev el SPA lo sirve Vite en su propio puerto (5173) con proxy hacia la
 * API, y este proceso solo responde `/api`.
 */
export function serveSpa(app: express.Express): void {
  // Condicionado a NODE_ENV y no a "¿existe el build?": en dev la ruta resuelve
  // al MISMO apps/web/dist, así que a cualquiera que haya corrido `pnpm build`
  // una vez le quedaría un SPA congelado servido en el 3000, semanas viejo y
  // sin ninguna señal. El Dockerfile fija NODE_ENV=production.
  if (process.env.NODE_ENV !== "production") {
    console.info(
      "[spa] NODE_ENV != production: este proceso solo sirve /api (en dev el SPA lo sirve Vite).",
    );
    return;
  }
  if (!existsSync(INDEX_HTML)) {
    console.warn(`[spa] NO hay build en ${WEB_DIST}: la app va a responder 404 en /.`);
    return;
  }

  app.use(
    express.static(WEB_DIST, {
      // El index lo entrega el fallback de abajo, para que tenga las mismas
      // cabeceras venga de "/" o de una ruta profunda.
      index: false,
      setHeaders: (res, filePath) => {
        // Vite le pone hash al nombre de cada asset, así que su contenido
        // nunca cambia: se pueden cachear para siempre. Lo demás (favicon,
        // manifest) conserva su nombre entre deploys y se revalida.
        res.setHeader(
          "Cache-Control",
          filePath.includes(ASSETS_DIR) ? "public, max-age=31536000, immutable" : "no-cache",
        );
      },
    }),
  );

  // Fallback de historial: `react-router` maneja las rutas del lado del
  // cliente, así que recargar /calendario tiene que devolver el index y no un
  // 404. Se hace con middleware y no con una ruta comodín porque en Express 5
  // (path-to-regexp v8) los patrones cambiaron y un comodín mal escrito es un
  // error de arranque.
  app.use((req, res, next) => {
    // Un POST a una ruta inexistente no es una navegación: que siga su curso
    // y termine en 404, en vez de recibir un HTML con status 200.
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    // `/api` es de la API aunque no exista el endpoint: su 404 tiene que
    // llegar como 404 al cliente, no como el index.
    if (req.path === "/api" || req.path.startsWith("/api/")) return next();
    // Un asset que no existe tampoco es una navegación, y devolverle el index
    // es peor que un 404. Pasa de verdad: una pestaña abierta durante un
    // deploy pide el chunk con hash viejo de una ruta diferida, y si recibe
    // HTML con status 200 el import falla con "Unexpected token '<'" en vez de
    // fallar como fetch — que es la señal con la que el navegador recarga.
    if (req.path.startsWith("/assets/")) return next();

    // El index apunta a los assets con hash del deploy actual: si el navegador
    // lo cachea, tras un deploy pide assets que ya no existen.
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(INDEX_HTML, (error) => {
      if (error) next(error);
    });
  });

  console.info(`[spa] sirviendo ${WEB_DIST}`);
}
