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

// Nombre con hash de contenido, como los que emite Vite: `index-DejkezC8.js`.
// NO alcanza con "está bajo /assets": ahí también aterriza todo lo de
// apps/web/public, que Vite copia tal cual y conserva su nombre entre deploys
// (hoy `assets/isotipo.png`). Cachear eso para siempre dejaría el logo viejo
// pegado en cada navegador que ya abrió la app, sin forma de invalidarlo.
const HASHED_ASSET = /-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/;

/**
 * Todo lo que cuelga de `/api` es de la API, exista el endpoint o no.
 *
 * En minúsculas porque Express enruta sin distinguir mayúsculas (`case
 * sensitive routing` viene apagado y Nest no lo cambia): `/API/health` llega a
 * su controller, pero este middleware va delante, y comparando tal cual lo
 * habría mandado al índice del SPA con un 200.
 */
function isApiPath(urlPath: string): boolean {
  const normalized = urlPath.toLowerCase();
  return normalized === "/api" || normalized.startsWith("/api/");
}

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

  const statics = express.static(WEB_DIST, {
    // El index lo entrega el fallback de abajo, para que tenga las mismas
    // cabeceras venga de "/" o de una ruta profunda.
    index: false,
    setHeaders: (res, filePath) => {
      // `index: false` apaga el índice de directorio, pero un GET /index.html
      // explícito sí pasa por acá, y ese documento apunta a los assets con
      // hash del deploy actual: nunca se cachea.
      if (filePath === INDEX_HTML) {
        res.setHeader("Cache-Control", "no-store");
        return;
      }
      // Un nombre con hash identifica su contenido: si el contenido cambia,
      // cambia la URL. Eso y solo eso se puede cachear para siempre.
      res.setHeader(
        "Cache-Control",
        HASHED_ASSET.test(path.basename(filePath))
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      );
    },
  });

  // Este middleware queda DELANTE del router de Nest (ver main.ts), así que el
  // filtro de /api tiene que aplicar también a los estáticos: sin él, un
  // archivo en apps/web/public/api/... taparía en silencio un endpoint real.
  app.use((req, res, next) => {
    if (isApiPath(req.path)) return next();
    statics(req, res, next);
  });

  // Fallback de historial: `react-router` maneja las rutas del lado del
  // cliente, así que recargar /calendario tiene que devolver el index y no un
  // 404. Se hace con middleware y no con una ruta comodín porque en Express 5
  // (path-to-regexp v8) los patrones cambiaron y un comodín mal escrito es un
  // error de arranque.
  app.use((req, res, next) => {
    // Un POST a una ruta inexistente no es una navegación: que siga su curso
    // y termine en 404, en vez de recibir un HTML con status 200.
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (isApiPath(req.path)) return next();

    // Un archivo que no existe tampoco es una navegación, y devolverle el
    // index es peor que un 404. Pasa de verdad: una pestaña abierta durante un
    // deploy pide el chunk con hash viejo de una ruta diferida, y si recibe
    // HTML con status 200 el import falla con "Unexpected token '<'" en vez de
    // fallar como fetch — que es la señal con la que el navegador recarga.
    //
    // El corte es "¿tiene extensión?" y no "¿empieza con /assets/?": las rutas
    // del SPA no la tienen (`/calendario`), y los archivos sí, vivan donde
    // vivan — `/favicon.ico` o cualquier cosa que alguien deje en public/.
    if (path.extname(req.path) !== "") return next();

    // El index apunta a los assets con hash del deploy actual: si el navegador
    // lo cachea, tras un deploy pide assets que ya no existen.
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(INDEX_HTML, (error) => {
      if (!error) return;
      // El cliente que se va a media transferencia (navegar fuera, una pestaña
      // que se suspende) llega acá como un error de conexión. No es un fallo
      // del servidor: pasarlo a next() haría que Express intente escribir un
      // 500 sobre un socket muerto, y deja un stack por cada navegación
      // abortada. Se filtra por código y no por headersSent, porque el aborto
      // puede ocurrir antes de que salga la primera cabecera.
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ECONNABORTED" || code === "ECONNRESET" || code === "EPIPE") return;
      next(error);
    });
  });

  console.info(`[spa] sirviendo ${WEB_DIST}`);
}
