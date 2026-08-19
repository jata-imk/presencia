import type { CardContent, SocialNetwork } from "@presencia/shared";
import {
  PublishingRateLimitError,
  PublishingRejectedError,
  PublishingUnavailableError,
} from "./errors.js";
import type {
  ProviderAccount,
  ProviderPostState,
  PublishingProvider,
  SchedulePostRequest,
} from "./publishing.provider.js";

// Adapter real contra postfa.st (ADR-009). Verificado contra la referencia
// pública en postfa.st/docs.md (2026-08-15) — la API key es por WORKSPACE,
// no por usuario final (decisión de tenant: un solo workspace global de
// Presencia, ver ADR-009 addendum), y no expone webhooks: confirmar
// "publicado" es responsabilidad nuestra vía polling (CardsService,
// reconciliación perezosa hasta que F8 traiga el job).
//
// El shape de respuesta de POST /social-posts se había inferido consistente
// con el resto de la API (envelope { data: [...] } con `id` por post, igual
// que GET /social-posts) — esa inferencia se desmintió en producción el
// 2026-08-18: PostFast sí creó y programó el post real (confirmado en su
// dashboard), pero la extracción no encontró el id esperado —
// CardsService.schedule() trató eso como "no pasó nada" y la card volvió a
// draft, dejando un post real sin ningún providerRef que lo referencie (ver
// CardsService, clasificación rejected/ambiguous). Shape real confirmado
// después contra postfa.st/docs/posts/create (2026-08-19): la respuesta 201
// es { postIds: string[] } — un array de UUIDs, NO un array de objetos con
// `id`/`status` como GET /social-posts. Como siempre enviamos exactamente un
// post por llamada (ver el body de abajo), tomamos postIds[0].

const BASE_URL_DEFAULT = "https://api.postfa.st";

// SocialNetwork (nuestro enum) → platform de PostFast. 1:1, siempre
// mayúsculas. No mapeamos youtube/threads porque nunca se llama a este
// adapter para ellas todavía (video_script no publica video generado por
// Presencia; threads sí está en el enum de PostFast pero fuera de alcance
// de F6 — se agrega el día que un test lo ejercite).
const PLATFORM_BY_NETWORK: Record<SocialNetwork, string> = {
  instagram: "INSTAGRAM",
  facebook: "FACEBOOK",
  tiktok: "TIKTOK",
  linkedin: "LINKEDIN",
  youtube: "YOUTUBE",
  threads: "THREADS",
  x: "X",
};

interface PostfastPostSummary {
  id: string;
  status: "DRAFT" | "SCHEDULED" | "PUBLISHED" | "FAILED";
  publishedAt?: string | null;
}

export class PostFastProvider implements PublishingProvider {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = BASE_URL_DEFAULT,
  ) {}

  async listAccounts(): Promise<ProviderAccount[]> {
    const body = await this.request<{
      id: string;
      platform: string;
      displayName: string | null;
    }>("GET", "/social-media/my-social-accounts");
    const accounts = Array.isArray(body) ? body : ((body as { data?: unknown[] }).data ?? []);
    return (accounts as Array<{ id: string; platform: string; displayName: string | null }>)
      .map((a) => ({
        providerRef: a.id,
        network: networkFromPlatform(a.platform),
        displayName: a.displayName ?? null,
      }))
      .filter((a): a is ProviderAccount => a.network !== null);
  }

  async createConnectLink(input: { expiryDays: number }): Promise<{ connectUrl: string }> {
    const body = await this.request<{ connectUrl: string }>("POST", "/social-media/connect-link", {
      expiryDays: input.expiryDays,
    });
    return { connectUrl: body.connectUrl };
  }

  async schedule(req: SchedulePostRequest): Promise<{ providerRef: string }> {
    const body = await this.request<{ postIds?: string[] }>("POST", "/social-posts", {
      posts: [
        {
          content: buildPostText(req.content),
          // Media real (subir el asset a PostFast y referenciarlo aquí) es
          // trabajo de F10/F11 — hasta entonces, CardsService rechaza antes
          // de llegar aquí cualquier red que exija media (instagram, tiktok,
          // youtube). Enviar [] es seguro para las redes que sí llegan.
          mediaItems: [],
          scheduledAt: req.scheduledAt.toISOString(),
          socialMediaId: req.accountProviderRef,
          status: "SCHEDULED",
        },
      ],
    });
    const providerRef = body.postIds?.[0];
    if (!providerRef) {
      throw new PublishingUnavailableError("PostFast no devolvió el id del post programado.", {
        reason: "no_id_in_response",
        body,
      });
    }
    return { providerRef };
  }

  async cancel(providerRef: string): Promise<void> {
    try {
      await this.request("DELETE", `/social-posts/${encodeURIComponent(providerRef)}`);
    } catch (error) {
      // Idempotente por contrato de PublishingProvider: si PostFast ya no
      // tiene el post (404 — se publicó, o alguien más lo borró), cancelar
      // no debe tronar. Cualquier otro código sí es un fallo real.
      if (error instanceof PublishingRejectedError && isNotFound(error.detail)) return;
      throw error;
    }
  }

  async getPostStates(providerRefs: string[]): Promise<Map<string, ProviderPostState>> {
    const result = new Map<string, ProviderPostState>();
    if (providerRefs.length === 0) return result;
    // Límite documentado: hasta 100 ids por request, hasta 50 filas por
    // página. El caller (CardsService.reconcileDueCards) ya trocea en
    // batches de 100 — aquí solo paginamos dentro de un batch.
    let page = 0;
    const ids = providerRefs.join(",");
    for (;;) {
      const body = await this.request<{
        data: PostfastPostSummary[];
        pageInfo: { hasNextPage: boolean };
      }>("GET", `/social-posts?ids=${encodeURIComponent(ids)}&limit=50&page=${page}`);
      for (const post of body.data) {
        result.set(post.id, {
          status: statusFromPostfast(post.status),
          publishedAt: post.publishedAt ? new Date(post.publishedAt) : null,
        });
      }
      if (!body.pageInfo?.hasNextPage) break;
      page += 1;
    }
    return result;
  }

  private async request<T>(method: string, path: string, jsonBody?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          "pf-api-key": this.apiKey,
          ...(jsonBody !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: jsonBody !== undefined ? JSON.stringify(jsonBody) : undefined,
      });
    } catch (error) {
      throw new PublishingUnavailableError(
        "No se pudo contactar a PostFast (error de red).",
        error,
      );
    }

    if (res.status === 429) throw new PublishingRateLimitError();
    if (res.status >= 500) {
      throw new PublishingUnavailableError(
        `PostFast respondió ${res.status}.`,
        await safeJson(res),
      );
    }
    if (!res.ok) {
      const detail = await safeJson(res);
      throw new PublishingRejectedError(
        errorMessageFromBody(detail) ?? `PostFast rechazó la solicitud (${res.status}).`,
        { status: res.status, body: detail },
      );
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}

function statusFromPostfast(status: PostfastPostSummary["status"]): ProviderPostState["status"] {
  switch (status) {
    case "PUBLISHED":
      return "published";
    case "FAILED":
      return "failed";
    case "SCHEDULED":
      return "scheduled";
    case "DRAFT":
      // Nunca deberíamos programar un post que quede en DRAFT del lado de
      // PostFast (siempre mandamos status:"SCHEDULED") — si ocurre, es una
      // señal de que algo se rechazó silenciosamente del otro lado.
      return "failed";
  }
}

function networkFromPlatform(platform: string): SocialNetwork | null {
  const entry = Object.entries(PLATFORM_BY_NETWORK).find(([, p]) => p === platform);
  return (entry?.[0] as SocialNetwork) ?? null;
}

function buildPostText(content: CardContent): string {
  const hashtags = content.hashtags.map((tag) => `#${tag}`).join(" ");
  const body =
    content.archetype === "visual_first"
      ? content.caption
      : content.archetype === "video_script"
        ? `${content.hook}\n\n${content.script}\n\n${content.caption}`
        : content.body;
  return hashtags ? `${body}\n\n${hashtags}` : body;
}

function isNotFound(detail: unknown): boolean {
  return (
    typeof detail === "object" && detail !== null && (detail as { status?: number }).status === 404
  );
}

function errorMessageFromBody(body: unknown): string | undefined {
  if (typeof body === "object" && body !== null && "message" in body) {
    const message = (body as { message?: unknown }).message;
    return typeof message === "string" ? message : undefined;
  }
  return undefined;
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
