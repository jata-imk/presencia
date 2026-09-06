import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardContent } from "@presencia/shared";
import {
  PublishingRateLimitError,
  PublishingRejectedError,
  PublishingUnavailableError,
} from "./errors.js";
import type { PublishingProvider } from "./publishing.provider.js";
import { UploadPostProvider } from "./uploadpost.provider.js";

const TEXT_CONTENT: CardContent = {
  archetype: "text_first",
  body: "Cinco hábitos que cambiaron mi productividad.",
  hashtags: ["productividad", "ia"],
  assetIds: [],
};

const USER_ID = "11111111-2222-3333-4444-555555555555";
const PROFILE = `presencia-${USER_ID}`;
const WS = { ref: PROFILE };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeProvider(): PublishingProvider {
  return new UploadPostProvider("test-key");
}

describe("UploadPostProvider", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("ensureWorkspace", () => {
    it("crea el perfil derivado del userId y manda la API key como Apikey", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(201, { success: true }));
      const provider = makeProvider();

      const ws = await provider.ensureWorkspace(USER_ID);

      expect(ws).toEqual({ ref: PROFILE });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.upload-post.com/api/uploadposts/users");
      expect(init.method).toBe("POST");
      expect(init.headers).toMatchObject({ Authorization: "Apikey test-key" });
      expect(JSON.parse(init.body as string)).toEqual({ username: PROFILE });
    });

    // El 409 es el camino normal en cuanto el proceso se reinicia: el perfil
    // se deriva del users.id y no se persiste de nuestro lado.
    it("un 409 (el perfil ya existe) no es un error", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(409, { success: false, message: "Profile already exists" }),
      );
      const provider = makeProvider();

      await expect(provider.ensureWorkspace(USER_ID)).resolves.toEqual({ ref: PROFILE });
    });

    // Verificado contra la cuenta real (2026-09-06): con los perfiles del
    // plan agotados, el POST responde 403 con el body VACÍO. Sin traducirlo,
    // el usuario vería un "rechazó la solicitud (403)" que no explica nada.
    it("un 403 (tope de perfiles del plan) se traduce a un mensaje que se entiende", async () => {
      fetchMock.mockResolvedValueOnce(new Response("", { status: 403 }));
      const provider = makeProvider();

      await expect(provider.ensureWorkspace(USER_ID)).rejects.toThrow(/límite de perfiles/);
    });

    it("cualquier otro rechazo sí propaga", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(400, { message: "username inválido" }));
      const provider = makeProvider();

      await expect(provider.ensureWorkspace(USER_ID)).rejects.toBeInstanceOf(
        PublishingRejectedError,
      );
    });

    it("memoiza: el segundo ensureWorkspace del mismo usuario no vuelve a llamar", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(201, { success: true }));
      const provider = makeProvider();

      await provider.ensureWorkspace(USER_ID);
      await provider.ensureWorkspace(USER_ID);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("listAccounts", () => {
    // Responde la pregunta que el ticket daba por abierta: `reauth_required`
    // es cómo se sabe que el token ya no sirve. Y, como en PostFast, esas
    // cuentas NO se omiten — se marcan (ver ProviderAccount.connected).
    it("mapea social_accounts por plataforma y marca reauth_required como desconectada", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, {
          success: true,
          profile: {
            username: PROFILE,
            social_accounts: {
              linkedin: { display_name: "Jose en LinkedIn", handle: "jose" },
              x: { handle: "jose_mx", reauth_required: true },
            },
          },
        }),
      );
      const provider = makeProvider();

      const accounts = await provider.listAccounts(WS);

      expect(accounts).toEqual([
        {
          providerRef: `${PROFILE}:linkedin`,
          network: "linkedin",
          displayName: "Jose en LinkedIn",
          connected: true,
        },
        {
          providerRef: `${PROFILE}:x`,
          network: "x",
          displayName: "jose_mx",
          connected: false,
        },
      ]);
      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toBe(`https://api.upload-post.com/api/uploadposts/users/${PROFILE}`);
    });

    // El openapi declara el valor como oneOf objeto | string | null, y las
    // tres formas aparecen: un string vacío es "la conexión quedó a medias".
    it("un string vacío o un null cuentan como desconectada, y el string no vacío como nombre", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, {
          profile: {
            social_accounts: { facebook: "", threads: null, linkedin: "Jose" },
          },
        }),
      );
      const provider = makeProvider();

      const accounts = await provider.listAccounts(WS);

      expect(accounts).toEqual([
        {
          providerRef: `${PROFILE}:facebook`,
          network: "facebook",
          displayName: null,
          connected: false,
        },
        {
          providerRef: `${PROFILE}:threads`,
          network: "threads",
          displayName: null,
          connected: false,
        },
        {
          providerRef: `${PROFILE}:linkedin`,
          network: "linkedin",
          displayName: "Jose",
          connected: true,
        },
      ]);
    });

    // El openapi admite como tercera forma un objeto sin ninguno de los
    // campos documentados. Tratar "no dice reauth_required" como sano haría
    // que claimConnectIntent insertara una fila para una red no vinculada.
    it("un objeto sin señal de identidad no cuenta como conectada", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, { profile: { social_accounts: { linkedin: {} } } }),
      );
      const provider = makeProvider();

      const accounts = await provider.listAccounts(WS);

      expect(accounts).toEqual([
        {
          providerRef: `${PROFILE}:linkedin`,
          network: "linkedin",
          displayName: null,
          connected: false,
        },
      ]);
    });

    it("ignora plataformas que no están en nuestro enum de redes", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, {
          profile: { social_accounts: { reddit: { handle: "x" }, bluesky: { handle: "y" } } },
        }),
      );
      const provider = makeProvider();

      await expect(provider.listAccounts(WS)).resolves.toEqual([]);
    });
  });

  describe("createConnectLink", () => {
    it("pide la página en español y devuelve access_url con 48 h de vigencia", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, {
          success: true,
          access_url: "https://upload-post.com/connect/abc",
          duration: "48h",
        }),
      );
      const provider = makeProvider();
      const before = Date.now();

      const link = await provider.createConnectLink({ ws: WS });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const sent = JSON.parse(init.body as string) as {
        username: string;
        language: string;
        platforms: string[];
      };
      expect(sent.username).toBe(PROFILE);
      expect(sent.language).toBe("es");
      expect(sent.platforms).toContain("linkedin");
      expect(link.connectUrl).toBe("https://upload-post.com/connect/abc");
      const fortyEightHours = 48 * 60 * 60 * 1000;
      expect(link.expiresAt.getTime()).toBeGreaterThanOrEqual(before + fortyEightHours);
      expect(link.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + fortyEightHours);
    });

    it("un 2xx sin access_url es ambiguo, no un éxito vacío", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true }));
      const provider = makeProvider();

      await expect(provider.createConnectLink({ ws: WS })).rejects.toBeInstanceOf(
        PublishingUnavailableError,
      );
    });
  });

  describe("schedule", () => {
    it("manda multipart con user, platform[], scheduled_date y timezone UTC", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(202, {
          success: true,
          job_id: "job_123",
          scheduled_date: "2026-09-10T18:00:00.000Z",
        }),
      );
      const provider = makeProvider();

      const result = await provider.schedule({
        network: "linkedin",
        content: TEXT_CONTENT,
        scheduledAt: new Date("2026-09-10T18:00:00.000Z"),
        accountProviderRef: `${PROFILE}:linkedin`,
      });

      expect(result).toEqual({ providerRef: "job_123" });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.upload-post.com/api/upload_text");
      const form = init.body as FormData;
      expect(form).toBeInstanceOf(FormData);
      expect(form.get("user")).toBe(PROFILE);
      expect(form.getAll("platform[]")).toEqual(["linkedin"]);
      expect(form.get("scheduled_date")).toBe("2026-09-10T18:00:00.000Z");
      expect(form.get("timezone")).toBe("UTC");
      expect(form.get("title")).toContain("Cinco hábitos");
      expect(form.get("title")).toContain("#productividad #ia");
      // Con FormData el Content-Type lo pone fetch, con su boundary: si lo
      // fijáramos a mano el multipart quedaría ilegible del otro lado.
      expect(init.headers).not.toHaveProperty("Content-Type");
    });

    // Misma lección que el incidente 2026-08-18 de PostFast: un 2xx cuyo
    // shape no entendemos NO puede tratarse como "no pasó nada" — el post
    // pudo haberse programado igual.
    it("un 2xx sin job_id lanza PublishingUnavailableError y conserva el body crudo", async () => {
      const unexpected = { success: true, scheduled: "ok" };
      fetchMock.mockResolvedValueOnce(jsonResponse(202, unexpected));
      const provider = makeProvider();

      let caught: unknown;
      try {
        await provider.schedule({
          network: "linkedin",
          content: TEXT_CONTENT,
          scheduledAt: new Date("2026-09-10T18:00:00.000Z"),
          accountProviderRef: `${PROFILE}:linkedin`,
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(PublishingUnavailableError);
      expect((caught as PublishingUnavailableError).detail).toEqual({
        reason: "no_job_id_in_response",
        body: unexpected,
      });
    });

    it("una red que exige media se rechaza sin llamar a la API", async () => {
      const provider = makeProvider();

      await expect(
        provider.schedule({
          network: "instagram",
          content: TEXT_CONTENT,
          scheduledAt: new Date("2026-09-10T18:00:00.000Z"),
          accountProviderRef: `${PROFILE}:instagram`,
        }),
      ).rejects.toBeInstanceOf(PublishingRejectedError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("un accountProviderRef sin plataforma se rechaza sin llamar a la API", async () => {
      const provider = makeProvider();

      await expect(
        provider.schedule({
          network: "linkedin",
          content: TEXT_CONTENT,
          scheduledAt: new Date("2026-09-10T18:00:00.000Z"),
          accountProviderRef: "solo-el-perfil",
        }),
      ).rejects.toBeInstanceOf(PublishingRejectedError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("un 429 se traduce a PublishingRateLimitError", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(429, { message: "slow down" }));
      const provider = makeProvider();

      await expect(
        provider.schedule({
          network: "linkedin",
          content: TEXT_CONTENT,
          scheduledAt: new Date("2026-09-10T18:00:00.000Z"),
          accountProviderRef: `${PROFILE}:linkedin`,
        }),
      ).rejects.toBeInstanceOf(PublishingRateLimitError);
    });
  });

  describe("cancel", () => {
    it("cancelar un job inexistente (404) no lanza — es idempotente", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(404, { error: "job not found" }));
      const provider = makeProvider();

      await expect(provider.cancel("job_gone")).resolves.toBeUndefined();
    });

    it("un 500 al cancelar sí propaga", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: "boom" }));
      const provider = makeProvider();

      await expect(provider.cancel("job_1")).rejects.toBeInstanceOf(PublishingUnavailableError);
    });
  });

  describe("getPostStates", () => {
    it("lista vacía no llama a fetch", async () => {
      const provider = makeProvider();

      const states = await provider.getPostStates([]);

      expect(states.size).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("si todos siguen en cola, resuelve con una sola llamada a /schedule", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, { scheduled_posts: [{ job_id: "job_1" }, { job_id: "job_2" }] }),
      );
      const provider = makeProvider();

      const states = await provider.getPostStates(["job_1", "job_2"]);

      expect(states.get("job_1")).toEqual({ status: "scheduled", publishedAt: null });
      expect(states.get("job_2")).toEqual({ status: "scheduled", publishedAt: null });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    // /status no sirve acá: no devuelve post_url ni id de post. El estado
    // final de un job vive en /history, que sí trae job_id + success.
    it("combina /schedule con /history y omite los que no aparecen en ninguno", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { scheduled_posts: [{ job_id: "job_pend" }] }))
        .mockResolvedValueOnce(
          jsonResponse(200, {
            history: [
              {
                job_id: "job_ok",
                success: true,
                post_url: "https://linkedin.com/posts/abc",
                upload_timestamp: "2026-09-10T18:00:05.000Z",
              },
              { job_id: "job_bad", success: false, error_message: "token revocado" },
            ],
          }),
        );
      const provider = makeProvider();

      const states = await provider.getPostStates([
        "job_pend",
        "job_ok",
        "job_bad",
        "job_desconocido",
      ]);

      expect(states.get("job_pend")).toEqual({ status: "scheduled", publishedAt: null });
      expect(states.get("job_ok")).toEqual({
        status: "published",
        publishedAt: new Date("2026-09-10T18:00:05.000Z"),
      });
      expect(states.get("job_bad")).toEqual({ status: "failed", publishedAt: null });
      // Ausente del Map, no "failed" explícito: el caller ya trata la
      // ausencia como fallo, igual que con PostFast.
      expect(states.has("job_desconocido")).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [historyUrl] = fetchMock.mock.calls[1] as [string];
      expect(historyUrl).toBe(
        "https://api.upload-post.com/api/uploadposts/history?page=1&limit=100",
      );
    });

    // Un job que ya disparó pero sigue subiendo no está en /schedule (salió
    // de la cola) ni en history (no terminó): vive en el `in_progress` que
    // la respuesta real trae y el openapi no documenta. Sin esto, la card
    // se marcaría como fallida estando viva.
    it("un job en in_progress cuenta como scheduled, no como ausente", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { scheduled_posts: [] }))
        .mockResolvedValueOnce(
          jsonResponse(200, { history: [], in_progress: [{ job_id: "job_subiendo" }] }),
        );
      const provider = makeProvider();

      const states = await provider.getPostStates(["job_subiendo"]);

      expect(states.get("job_subiendo")).toEqual({ status: "scheduled", publishedAt: null });
    });

    it("in_progress también se acepta como array de job_ids sueltos", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { scheduled_posts: [] }))
        .mockResolvedValueOnce(jsonResponse(200, { history: [], in_progress: ["job_subiendo"] }));
      const provider = makeProvider();

      const states = await provider.getPostStates(["job_subiendo"]);

      expect(states.get("job_subiendo")).toEqual({ status: "scheduled", publishedAt: null });
    });

    it("deja de paginar history en cuanto una página viene incompleta", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { scheduled_posts: [] }))
        .mockResolvedValueOnce(jsonResponse(200, { history: [{ job_id: "otro", success: true }] }));
      const provider = makeProvider();

      const states = await provider.getPostStates(["job_lejano"]);

      expect(states.size).toBe(0);
      // Una página de 1 item con limit=100 es la última: no hay más historia
      // hacia atrás, así que no se gastan las 4 páginas restantes.
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    // El historial está ordenado por recencia GLOBAL (scopeado por API key,
    // no por perfil), así que con varios usuarios activos el item de una
    // card puede quedar más allá del tope. Reportarlo como ausente haría que
    // reconcileDueCards marcara como fallida una publicación real.
    it("si el historial se cortó antes del final, los refs sin resolver quedan scheduled", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { scheduled_posts: [] }));
      const fullPage = {
        history: Array.from({ length: 100 }, () => ({ job_id: "ajeno" })),
        total: 5_000,
      };
      for (let i = 0; i < 6; i += 1) fetchMock.mockResolvedValueOnce(jsonResponse(200, fullPage));
      const provider = makeProvider();

      const states = await provider.getPostStates(["job_viejo"]);

      expect(states.get("job_viejo")).toEqual({ status: "scheduled", publishedAt: null });
      // 1 de /schedule + 5 páginas de /history (MAX_HISTORY_PAGES).
      expect(fetchMock).toHaveBeenCalledTimes(6);
    });

    it("si el historial se recorrió entero, un ref que no aparece sí queda ausente", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { scheduled_posts: [] }))
        .mockResolvedValueOnce(
          jsonResponse(200, { history: [{ job_id: "ajeno", success: true }], total: 1 }),
        );
      const provider = makeProvider();

      const states = await provider.getPostStates(["job_viejo"]);

      // Ausente = fallida para el caller, y acá sí es la respuesta correcta:
      // se vio todo el historial y el job no está.
      expect(states.has("job_viejo")).toBe(false);
    });

    it("un upload_timestamp corrupto no se convierte en Invalid Date", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { scheduled_posts: [] }))
        .mockResolvedValueOnce(
          jsonResponse(200, {
            history: [{ job_id: "job_ok", success: true, upload_timestamp: "no-es-una-fecha" }],
            total: 1,
          }),
        );
      const provider = makeProvider();

      const states = await provider.getPostStates(["job_ok"]);

      // null y no Invalid Date: el caller cae a "ahora" en vez de mandar una
      // fecha inválida al UPDATE y abortar el batch entero.
      expect(states.get("job_ok")).toEqual({ status: "published", publishedAt: null });
    });
  });

  it("un error de red se traduce a PublishingUnavailableError y conserva el original en detail", async () => {
    const networkError = new TypeError("fetch failed");
    fetchMock.mockRejectedValueOnce(networkError);
    const provider = makeProvider();

    let caught: unknown;
    try {
      await provider.listAccounts(WS);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(PublishingUnavailableError);
    expect((caught as PublishingUnavailableError).message).toBe(
      "No se pudo contactar a Upload-Post (error de red).",
    );
    expect((caught as PublishingUnavailableError).detail).toBe(networkError);
  });
});
