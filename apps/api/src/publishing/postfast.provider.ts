import type { SocialNetwork } from "@presencia/shared";
import { PublishingRejectedError, PublishingUnavailableError } from "./errors.js";
import { isStatus, ProviderHttpClient } from "./http-client.js";
import { buildPostText } from "./post-text.js";
import type {
  ProviderAccount,
  ProviderPostState,
  PublishingProvider,
  SchedulePostRequest,
  WorkspaceRef,
} from "./publishing.provider.js";

// Adapter real contra postfa.st (ADR-009). Verificado contra la referencia
// pública en postfa.st/docs.md (2026-08-15) — la API key es por WORKSPACE,
// no por usuario final (decisión de tenant: un solo workspace global de
// Presencia, ver ADR-009 addendum), y no expone webhooks: confirmar
// "publicado" es responsabilidad nuestra vía polling (CardsService,
// reconciliación perezosa hasta que F8 traiga el job).
//
// Ese workspace único es un rasgo de PostFast, no del dominio (F7.5): por
// eso ensureWorkspace() acá devuelve siempre la misma constante y
// listAccounts() ignora el WorkspaceRef que recibe. Upload-Post, en cambio,
// sí tiene un perfil por usuario. La consecuencia de vivir en un workspace
// compartido es el diff antes/después de ChannelsService — ver el
// comentario de cabecera de channels.service.ts.
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

// Un solo workspace global para todos los usuarios de Presencia — el valor
// es opaco para el resto del backend, solo este adapter lo interpreta.
const POSTFAST_WORKSPACE: WorkspaceRef = { ref: "postfast:workspace" };

// Vigencia del link de conexión. Vive acá y no en el puerto porque es un
// parámetro que solo PostFast deja elegir (F7.5): el puerto expone el
// `expiresAt` resultante, no la política para calcularlo.
const CONNECT_LINK_EXPIRY_DAYS = 7;

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
  private readonly http: ProviderHttpClient;

  constructor(apiKey: string, baseUrl: string = BASE_URL_DEFAULT) {
    this.http = new ProviderHttpClient("PostFast", baseUrl, { "pf-api-key": apiKey });
  }

  // No hace red: el workspace de PostFast no se crea ni se resuelve por
  // usuario, ya existe y es uno solo (ver cabecera).
  ensureWorkspace(): Promise<WorkspaceRef> {
    return Promise.resolve(POSTFAST_WORKSPACE);
  }

  // Array plano, no un envelope {data:[...]} — verificado contra
  // postfa.st/docs/accounts/list (2026-08-19). connectionStatus puede ser
  // "DISABLED" (token revocado, etc) mientras la cuenta SIGUE apareciendo
  // acá — no se omite, solo se marca (ver ProviderAccount.connected).
  //
  // Ignora el WorkspaceRef a propósito: la API key ya determina el único
  // workspace que existe, así que este endpoint devuelve las cuentas de
  // TODOS los usuarios de Presencia. Quién es dueño de cuál lo resuelve
  // ChannelsService por diff, no este adapter.
  async listAccounts(): Promise<ProviderAccount[]> {
    const accounts = await this.http.request<
      Array<{ id: string; platform: string; displayName: string | null; connectionStatus: string }>
    >("GET", "/social-media/my-social-accounts");
    return accounts
      .map((a) => ({
        providerRef: a.id,
        network: networkFromPlatform(a.platform),
        displayName: a.displayName ?? null,
        connected: a.connectionStatus === "CONNECTED",
      }))
      .filter((a): a is ProviderAccount => a.network !== null);
  }

  async createConnectLink(): Promise<{
    connectUrl: string;
    expiresAt: Date;
  }> {
    const body = await this.http.request<{ connectUrl: string }>(
      "POST",
      "/social-media/connect-link",
      {
        expiryDays: CONNECT_LINK_EXPIRY_DAYS,
      },
    );
    // PostFast no devuelve la fecha de expiración, solo respeta la que le
    // mandamos — se reconstruye acá para que el puerto siempre entregue un
    // `expiresAt` concreto y el caller no tenga que saber de días.
    return {
      connectUrl: body.connectUrl,
      expiresAt: new Date(Date.now() + CONNECT_LINK_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
    };
  }

  async schedule(req: SchedulePostRequest): Promise<{ providerRef: string }> {
    const body = await this.http.request<{ postIds?: string[] }>("POST", "/social-posts", {
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
      await this.http.request("DELETE", `/social-posts/${encodeURIComponent(providerRef)}`);
    } catch (error) {
      // Idempotente por contrato de PublishingProvider: si PostFast ya no
      // tiene el post (404 — se publicó, o alguien más lo borró), cancelar
      // no debe tronar. Cualquier otro código sí es un fallo real.
      if (error instanceof PublishingRejectedError && isStatus(error.detail, 404)) return;
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
      const body = await this.http.request<{
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
