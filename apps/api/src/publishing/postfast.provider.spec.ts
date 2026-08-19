import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardContent } from "@presencia/shared";
import {
  PublishingRateLimitError,
  PublishingRejectedError,
  PublishingUnavailableError,
} from "./errors.js";
import { PostFastProvider } from "./postfast.provider.js";

const TEXT_CONTENT: CardContent = {
  archetype: "text_first",
  body: "Cinco hábitos que cambiaron mi productividad.",
  hashtags: ["productividad", "ia"],
  assetIds: [],
};

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
    const provider = new PostFastProvider("test-key");

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
    const provider = new PostFastProvider("test-key");

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
    const provider = new PostFastProvider("test-key");

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
    const provider = new PostFastProvider("test-key");

    const accounts = await provider.listAccounts();

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

  it("cancelar una ref inexistente (404) no lanza — es idempotente", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { statusCode: 404, message: "not found" }));
    const provider = new PostFastProvider("test-key");

    await expect(provider.cancel("pf_gone")).resolves.toBeUndefined();
  });

  it("cancelar con un error real (500) sí propaga", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { statusCode: 500, message: "boom" }));
    const provider = new PostFastProvider("test-key");

    await expect(provider.cancel("pf_1")).rejects.toThrow();
  });

  it("mapea 429 a PublishingRateLimitError", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(429, { statusCode: 429, message: "rate limited" }),
    );
    const provider = new PostFastProvider("test-key");

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
    const provider = new PostFastProvider("test-key");

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
    const provider = new PostFastProvider("test-key");

    const states = await provider.getPostStates(["pf_1", "pf_2"]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(states.get("pf_1")).toEqual({
      status: "published",
      publishedAt: new Date("2026-09-01T18:02:00.000Z"),
    });
    expect(states.get("pf_2")).toEqual({ status: "failed", publishedAt: null });
  });

  it("getPostStates con lista vacía no llama a fetch", async () => {
    const provider = new PostFastProvider("test-key");
    const states = await provider.getPostStates([]);
    expect(states.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("un error de red se traduce a PublishingUnavailableError y conserva el error original en detail", async () => {
    const networkError = new TypeError("fetch failed");
    fetchMock.mockRejectedValueOnce(networkError);
    const provider = new PostFastProvider("test-key");

    let caught: unknown;
    try {
      await provider.listAccounts();
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
    const provider = new PostFastProvider("test-key");

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
