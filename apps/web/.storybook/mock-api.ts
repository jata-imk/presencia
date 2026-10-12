import { IMAGES_CONFIG } from "../src/stories/fixtures/cards.js";

// La red de las historias (F10.8.3, ADR-027). Los componentes conectados piden
// unas pocas rutas de la API al montar: se responden con datos de ejemplo. Lo
// demás de /api/* falla con un aviso en consola, para que nunca se cuele una
// llamada real ni pase en silencio. Sin MSW: son dos rutas.

const RESPUESTAS: Record<string, unknown> = {
  "/api/images/config": IMAGES_CONFIG,
  // La sesión de Better Auth: CompactCard la lee para la zona horaria.
  "/api/auth/get-session": {
    session: { id: "sesion-demo", userId: "usuario-demo", expiresAt: "2099-01-01T00:00:00.000Z" },
    user: {
      id: "usuario-demo",
      email: "dev@presencia.local",
      name: "Dev Presencia",
      displayName: "Dev Presencia",
      timezone: "America/Merida",
      emailVerified: true,
    },
  },
};

/**
 * Lo que una historia responde distinto (F10.8.4): el login con credenciales
 * malas (401) o con demasiados intentos (429 y su X-Retry-After). Se declara
 * en `parameters.api` y el preview la instala antes de cada historia.
 */
export interface RespuestaDeHistoria {
  status?: number;
  body: unknown;
  headers?: Record<string, string>;
}

let deLaHistoria: Record<string, RespuestaDeHistoria> = {};

export function usarRespuestas(respuestas: Record<string, RespuestaDeHistoria>): void {
  deLaHistoria = respuestas;
}

/** El fetch del navegador, guardado una sola vez: el HMR re-evalúa el preview. */
const globalConFetch = window as Window & { __fetchReal?: typeof window.fetch };

export function installMockApi(): void {
  globalConFetch.__fetchReal ??= window.fetch.bind(window);
  const real = globalConFetch.__fetchReal;
  window.fetch = (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      window.location.origin,
    );
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) {
      return real(input, init);
    }
    const propia = deLaHistoria[url.pathname];
    if (propia) {
      return Promise.resolve(
        Response.json(propia.body, { status: propia.status ?? 200, headers: propia.headers }),
      );
    }
    const body = RESPUESTAS[url.pathname];
    if (body !== undefined) {
      return Promise.resolve(Response.json(body));
    }
    console.warn(`[storybook] Sin backend: ${url.pathname} no tiene respuesta de ejemplo.`);
    return Promise.resolve(
      Response.json(
        { statusCode: 503, message: `Sin backend en Storybook: ${url.pathname}` },
        { status: 503 },
      ),
    );
  };
}
