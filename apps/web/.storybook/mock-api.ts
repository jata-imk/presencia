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

export function installMockApi(): void {
  const real = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      window.location.origin,
    );
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) {
      return real(input, init);
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
