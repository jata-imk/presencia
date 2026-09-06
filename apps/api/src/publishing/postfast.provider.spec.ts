import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardContent } from "@presencia/shared";
import {
  PublishingRateLimitError,
  PublishingRejectedError,
  PublishingUnavailableError,
} from "./errors.js";
import { PostFastProvider } from "./postfast.provider.js";
import type { PublishingProvider } from "./publishing.provider.js";

const TEXT_CONTENT: CardContent = {
  archetype: "text_first",
  body: "Cinco hábitos que cambiaron mi productividad.",
  hashtags: ["productividad", "ia"],
  assetIds: [],
};

// PostFast tiene un solo workspace y lo ignora en cada llamada — el valor
// concreto no importa para estos tests, solo que el puerto lo exija.
const WS = { ref: "postfast:workspace" };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("PostFastProvider", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Shape real confirmado contra postfa.st/docs/posts/create (2026-08-19):
  // la respuesta 201 es { postIds: string[] }, no el envelope { data: [...] }
  // que se había inferido (y que causó el incidente 2026-08-18 — ver
  // postfast.provider.ts, cabecera).
  it("programa un post y traduce el body a formato PostFast", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { postIds: ["pf_123"] }));
    const provider: PublishingProvider = new PostFastProvider("test-key");

    const result = await provider.schedule({
      network: "linkedin",
      content: TEXT_CONTENT,
      scheduledAt: new Date("2026-09-01T18:00:00.000Z"),
      accountProviderRef: "acc_1",
    });

    expect(result).toEqual({ providerRef: "pf_123" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.postfa.st/social-posts");
    expect(init.headers).toMatchObject({ "pf-api-key": "test-key" });
    const body = JSON.parse(init.body as string) as {
      posts: Array<{
        content: string;
        socialMediaId: string;
        scheduledAt: string;
        status: string;
        mediaItems: unknown[];
      }>;
    };
    expect(body.posts).toHaveLength(1);
    const [post] = body.posts;
    if (!post) throw new Error("Debió enviar un post");
    expect(post).toMatchObject({
      socialMediaId: "acc_1",
      scheduledAt: "2026-09-01T18:00:00.000Z",
      status: "SCHEDULED",
      mediaItems: [],
    });
    expect(post.content).toContain("Cinco hábitos");
    expect(post.content).toContain("#productividad #ia");
  });

  // Regresión del incidente 2026-08-18: PostFast creó y programó el post
  // real (2xx), pero el shape de la respuesta no tenía el `id` donde lo
  // esperábamos entonces (envelope {data:[...]}) — CardsService.schedule()
  // necesita el body crudo en `.detail` para no perder el rastro (ver
  // errorDetailFrom/markFailed). El shape real ya se confirmó y se
  // corrigió (postIds), pero el fallo se prueba igual con un shape
  // arbitrario, por si el proveedor cambia su respuesta de nuevo.
  it("un 2xx sin postIds lanza PublishingUnavailableError y conserva el body crudo en detail", async () => {
    const unexpectedBody = { ok: true, postId: "pf_9" };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, unexpectedBody));
    const provider: PublishingProvider = new PostFastProvider("test-key");

    let caught: unknown;
    try {
      await provider.schedule({
        network: "linkedin",
        content: TEXT_CONTENT,
        scheduledAt: new Date("2026-09-01T18:00:00.000Z"),
        accountProviderRef: "acc_1",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(PublishingUnavailableError);
    expect((caught as PublishingUnavailableError).detail).toEqual({
      reason: "no_id_in_response",
      body: unexpectedBody,
    });
  });

  it("un postIds vacío (PostFast no creó nada) también lanza PublishingUnavailableError", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { postIds: [] }));
    const provider: PublishingProvider = new PostFastProvider("test-key");

    await expect(
      provider.schedule({
        network: "linkedin",
        content: TEXT_CONTENT,
        scheduledAt: new Date("2026-09-01T18:00:00.000Z"),
        accountProviderRef: "acc_1",
      }),
    ).rejects.toBeInstanceOf(PublishingUnavailableError);
  });

  // Shape real confirmado contra postfa.st/docs/accounts/list (2026-08-19):
  // array plano (no envelope), y connectionStatus puede ser "DISABLED" sin
  // que la cuenta desaparezca de la lista — el caller (ChannelsService)
  // necesita saber cuáles siguen usables de verdad, ver ProviderAccount.connected.
  it("listAccounts mapea connectionStatus a connected y no omite cuentas deshabilitadas", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, [
        { id: "acc_1", platform: "LINKEDIN", displayName: "Activa", connectionStatus: "CONNECTED" },
        {
          id: "acc_2",
          platform: "FACEBOOK",
          displayName: "Token revocado",
          connectionStatus: "DISABLED",
          disabledReason: "TOKEN_REVOKED",
        },
      ]),
    );
    const provider: PublishingProvider = new PostFastProvider("test-key");

    const accounts = await provider.listAccounts(WS);

    expect(accounts).toEqual([
      { providerRef: "acc_1", network: "linkedin", displayName: "Activa", connected: true },
      {
        providerRef: "acc_2",
        network: "facebook",
        displayName: "Token revocado",
        connected: false,
      },
    ]);
  });

  // F7.5: el puerto ahora pide un workspace por usuario. En PostFast eso es
  // una constante — no hay red, y dos usuarios distintos resuelven al mismo
  // workspace, que es justamente el motivo de que ChannelsService tenga que
  // hacer el diff antes/después para saber de quién es cada cuenta.
  it("ensureWorkspace devuelve el mismo workspace para cualquier usuario y no llama a fetch", async () => {
    const provider: PublishingProvider = new PostFastProvider("test-key");

    const a = await provider.ensureWorkspace("user-a");
    const b = await provider.ensureWorkspace("user-b");

    expect(a).toEqual(b);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("createConnectLink manda expiryDays y devuelve un expiresAt concreto", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { connectUrl: "https://postfa.st/c/abc" }));
    const provider: PublishingProvider = new PostFastProvider("test-key");
    const before = Date.now();

    const link = await provider.createConnectLink({ ws: WS });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ expiryDays: 7 });
    expect(link.connectUrl).toBe("https://postfa.st/c/abc");
    // PostFast no devuelve la fecha: el adapter la reconstruye desde los
    // días que él mismo mandó, así que cae 7 días después de ahora.
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(link.expiresAt.getTime()).toBeGreaterThanOrEqual(before + sevenDays);
    expect(link.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + sevenDays);
  });

  // PostFast no tiene update de post: la emulación cancel+create vivía en
  // CardsService hasta F7.5 y ahora es del adapter, que es donde de verdad
  // pertenece — el hueco es un rasgo de este proveedor, no del dominio.
  it("reschedule crea el post nuevo PRIMERO y después cancela el viejo", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(201, { postIds: ["pf_nuevo"] }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const provider: PublishingProvider = new PostFastProvider("test-key");

    const result = await provider.reschedule("pf_viejo", {
      network: "linkedin",
      content: TEXT_CONTENT,
      scheduledAt: new Date("2026-09-12T18:00:00.000Z"),
      accountProviderRef: "acc_1",
    });

    expect(result).toEqual({ providerRef: "pf_nuevo" });
    const [createUrl] = fetchMock.mock.calls[0] as [string];
    expect(createUrl).toBe("https://api.postfa.st/social-posts");
    const [cancelUrl, cancelInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(cancelInit.method).toBe("DELETE");
    expect(cancelUrl).toBe("https://api.postfa.st/social-posts/pf_viejo");
  });

  // El orden no es cosmético: es lo que hace cumplir el contrato del puerto
  // de que un rechazo deja todo como estaba. Cancelando primero, un create
  // rechazado dejaba a la card apuntando a un post ya borrado — "sigue
  // programada" y sin nada que publicar.
  it("si el create es rechazado, el post viejo NO se toca", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { message: "scheduledAt inválido" }));
    const provider: PublishingProvider = new PostFastProvider("test-key");

    await expect(
      provider.reschedule("pf_viejo", {
        network: "linkedin",
        content: TEXT_CONTENT,
        scheduledAt: new Date("2026-09-12T18:00:00.000Z"),
        accountProviderRef: "acc_1",
      }),
    ).rejects.toBeInstanceOf(PublishingRejectedError);
    // Una sola llamada: la de crear. Nunca se intentó el DELETE.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // Best-effort a propósito: el objetivo del usuario es reprogramar, no
  // bloquearse. Hueco conocido y aceptado — puede quedar un post duplicado.
  it("si el cancel del post viejo falla, reschedule igual devuelve la ref nueva", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(201, { postIds: ["pf_nuevo"] }))
      .mockResolvedValueOnce(jsonResponse(500, { message: "boom" }));
    const provider: PublishingProvider = new PostFastProvider("test-key");

    const result = await provider.reschedule("pf_viejo", {
      network: "linkedin",
      content: TEXT_CONTENT,
      scheduledAt: new Date("2026-09-12T18:00:00.000Z"),
      accountProviderRef: "acc_1",
    });

    expect(result).toEqual({ providerRef: "pf_nuevo" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("cancelar una ref inexistente (404) no lanza — es idempotente", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { statusCode: 404, message: "not found" }));
    const provider: PublishingProvider = new PostFastProvider("test-key");

    await expect(provider.cancel("pf_gone")).resolves.toBeUndefined();
  });

  it("cancelar con un error real (500) sí propaga", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { statusCode: 500, message: "boom" }));
    const provider: PublishingProvider = new PostFastProvider("test-key");

    await expect(provider.cancel("pf_1")).rejects.toThrow();
  });

  it("mapea 429 a PublishingRateLimitError", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(429, { statusCode: 429, message: "rate limited" }),
    );
    const provider: PublishingProvider = new PostFastProvider("test-key");

    await expect(
      provider.schedule({
        network: "x",
        content: TEXT_CONTENT,
        scheduledAt: new Date(),
        accountProviderRef: "acc_1",
      }),
    ).rejects.toBeInstanceOf(PublishingRateLimitError);
  });

  it("mapea un 4xx con message a PublishingRejectedError con ese mensaje", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { statusCode: 400, message: "socialMediaId inválido" }),
    );
    const provider: PublishingProvider = new PostFastProvider("test-key");

    await expect(
      provider.schedule({
        network: "x",
        content: TEXT_CONTENT,
        scheduledAt: new Date(),
        accountProviderRef: "acc_bad",
      }),
    ).rejects.toThrow("socialMediaId inválido");
  });

  it("getPostStates pagina dentro de un batch y mapea status a nuestro vocabulario", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: [{ id: "pf_1", status: "PUBLISHED", publishedAt: "2026-09-01T18:02:00.000Z" }],
          pageInfo: { hasNextPage: true },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: [{ id: "pf_2", status: "FAILED" }],
          pageInfo: { hasNextPage: false },
        }),
      );
    const provider: PublishingProvider = new PostFastProvider("test-key");

    const states = await provider.getPostStates(["pf_1", "pf_2"]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(states.get("pf_1")).toEqual({
      status: "published",
      publishedAt: new Date("2026-09-01T18:02:00.000Z"),
      // PostFast no devuelve la URL del post en ninguna de sus respuestas:
      // acá siempre es null, y el frontend deja "Ver en la red" apagado.
      postUrl: null,
    });
    expect(states.get("pf_2")).toEqual({ status: "failed", publishedAt: null, postUrl: null });
  });

  it("getPostStates con lista vacía no llama a fetch", async () => {
    const provider: PublishingProvider = new PostFastProvider("test-key");
    const states = await provider.getPostStates([]);
    expect(states.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("un error de red se traduce a PublishingUnavailableError y conserva el error original en detail", async () => {
    const networkError = new TypeError("fetch failed");
    fetchMock.mockRejectedValueOnce(networkError);
    const provider: PublishingProvider = new PostFastProvider("test-key");

    let caught: unknown;
    try {
      await provider.listAccounts(WS);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(PublishingUnavailableError);
    expect((caught as PublishingUnavailableError).message).toBe(
      "No se pudo contactar a PostFast (error de red).",
    );
    expect((caught as PublishingUnavailableError).detail).toBe(networkError);
  });

  it("no rechaza directamente — PublishingRejectedError es una instancia real", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { statusCode: 400, message: "x" }));
    const provider: PublishingProvider = new PostFastProvider("test-key");

    await expect(
      provider.schedule({
        network: "x",
        content: TEXT_CONTENT,
        scheduledAt: new Date(),
        accountProviderRef: "acc_1",
      }),
    ).rejects.toBeInstanceOf(PublishingRejectedError);
  });
});
