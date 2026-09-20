import type { SocialNetwork } from "@presencia/shared";
import { PublishingRejectedError, PublishingUnavailableError } from "./errors.js";
import { isStatus, ProviderHttpClient } from "./http-client.js";
import { parseMetricNumber } from "./metric-values.js";
import { parsePlatformPostId } from "./platform-post-id.js";
import { buildPostText } from "./post-text.js";
import type {
  PostMetricsQuery,
  PostMetricsSnapshot,
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

const MILISEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;

// Tope de la ventana que se le pide a `/social-posts/analytics`. Coincide con
// lo que el job considera "todavía vale la pena medir", pero se aplica acá
// porque la consecuencia de pasarse es de este endpoint: no pagina.
const METRICS_VENTANA_MAXIMA_DIAS = 35;

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

/**
 * Fila de `GET /social-posts/analytics`. Documentada en
 * postfa.st/docs/posts/analytics — y NO corroborada contra la API real: la
 * cuenta de Jose no tiene suscripción desde F7 y ese endpoint pide plan
 * Growth. Todo lo de abajo puede estar mal en los detalles.
 */
interface PostfastAnalyticsRow {
  platformPostId?: unknown;
  socialMediaId?: unknown;
  publishedAt?: string | null;
  latestMetric?: {
    likes?: unknown;
    comments?: unknown;
    shares?: unknown;
    impressions?: unknown;
    reach?: unknown;
    totalInteractions?: unknown;
    fetchedAt?: string | null;
  } | null;
}

interface PostfastPostSummary {
  id: string;
  status: "DRAFT" | "SCHEDULED" | "PUBLISHED" | "FAILED";
  publishedAt?: string | null;
  /**
   * Id nativo en la red; null mientras el post no se publicó. `unknown` por
   * el mismo motivo que `post_url` en Upload-Post: la respuesta es un cast.
   */
  platformPostId?: unknown;
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

  /**
   * PostFast no tiene endpoint de update de post, así que reprogramar se
   * emula con cancel + create y devuelve un providerRef NUEVO.
   *
   * Esta emulación vivía en `CardsService.schedule()` hasta F7.5. Se movió
   * acá cuando el puerto ganó `reschedule`: el hueco es un rasgo de este
   * proveedor, no del dominio — con Upload-Post no existe, porque su PATCH
   * mueve el post en su lugar.
   *
   * Se crea el post nuevo ANTES de cancelar el viejo, y ese orden importa:
   * es lo que hace cumplir el contrato del puerto de que un rechazo deja
   * todo como estaba. Al revés (cancelar primero, como se hacía en
   * CardsService hasta F7.5), un create rechazado dejaba a la card
   * apuntando a un post que ya se había borrado — "sigue programada" pero
   * no iba a publicar nunca.
   *
   * El cancel queda best-effort, igual que antes: si falla, se sigue con el
   * horario nuevo porque el objetivo del usuario es reprogramar, no
   * bloquearse. Hueco conocido y aceptado, el mismo de siempre: PostFast
   * puede terminar con dos posts (el viejo y el nuevo).
   */
  async reschedule(
    previousProviderRef: string,
    req: SchedulePostRequest,
  ): Promise<{ providerRef: string }> {
    const created = await this.schedule(req);
    try {
      await this.cancel(previousProviderRef);
    } catch (error) {
      console.error(
        `[postfast] Se reprogramó a ${created.providerRef} pero no se pudo cancelar el post ` +
          `viejo ${previousProviderRef} — puede quedar duplicado, revisión manual:`,
        error,
      );
    }
    return created;
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
          // PostFast no devuelve la URL del post en ninguna de sus
          // respuestas (verificado contra postfa.st/docs/posts/list): los
          // botones "Ver en la red" se quedan apagados con este proveedor.
          postUrl: null,
          // El id nativo sí lo trae esta misma respuesta (mismo doc), y es
          // con lo que después se le piden métricas. Pasa por el mismo
          // parser que el de Upload-Post: esta respuesta tampoco se valida
          // en runtime, y acá NADA lo corroboró contra la API real.
          platformPostId: parsePlatformPostId(post.platformPostId),
        });
      }
      if (!body.pageInfo?.hasNextPage) break;
      page += 1;
    }
    return result;
  }
  /**
   * Métricas por rango de fechas, no por post: `GET /social-posts/analytics`
   * toma `startDate`/`endDate` y devuelve TODO lo publicado en esa ventana,
   * así que un pase entero cuesta UNA request (su límite es 350 por hora).
   *
   * **Nada de este método se ejercitó contra la API real.** La cuenta de
   * PostFast no tiene suscripción desde F7 y su API pide plan Growth; lo de
   * acá sale de postfa.st/docs/posts/analytics (leído el 2026-09-17) y está
   * cubierto solo por tests con `fetch` stubeado. Es el mismo trato que tuvo
   * `reschedule` en F7.5, donde un fallo real apareció solo cuando se lo
   * miró con cuidado — al recuperar la cuenta, esto se revisa antes de
   * confiar en sus números. Ver ADR-009.
   *
   * Dos cosas de su contrato que el código de abajo respeta y conviene tener
   * presentes al revisarlo:
   *
   *  - **No pagina.** La doc lo dice y recomienda ventanas cortas. La ventana
   *    se calcula del post más viejo del lote, que el job acota a 30 días.
   *  - **Los contadores son bigint SERIALIZADOS COMO STRING** ("1234"), salvo
   *    los de video y las tasas de Instagram, que son number. Por eso pasan
   *    todos por `parseMetricNumber`.
   *
   * LinkedIn personal queda fuera acá también ("LinkedIn personal accounts
   * excluded" en su doc): la limitación es de la API de LinkedIn, no del
   * proveedor, y los tres coinciden.
   */
  async getPostMetrics(
    posts: readonly PostMetricsQuery[],
  ): Promise<Map<string, PostMetricsSnapshot>> {
    const result = new Map<string, PostMetricsSnapshot>();
    if (posts.length === 0) return result;

    const pedidos = new Map(posts.map((post) => [post.platformPostId, post]));
    // La ventana del lote, con un día de margen a cada lado: `publishedAt`
    // nuestro y el del proveedor pueden no coincidir al segundo, y un post
    // justo en el borde no debería caerse del rango por eso.
    // `reduce` y no `Math.min(...)`: el spread pone un argumento por post en
    // el stack, y un lote grande (un backfill) tumbaría la llamada con
    // RangeError en vez de devolver algo.
    const masViejo = posts.reduce(
      (min, post) => Math.min(min, post.publishedAt.getTime()),
      Number.POSITIVE_INFINITY,
    );
    // La ventana se acota ACÁ, no por contrato con el caller: este endpoint
    // NO pagina (su doc pide "keep date ranges reasonable"), así que un solo
    // post viejo en el lote traería meses de publicaciones y las filas que sí
    // se pidieron podrían caerse del final en silencio, sin ninguna señal de
    // truncamiento.
    const tope = Date.now() - METRICS_VENTANA_MAXIMA_DIAS * MILISEGUNDOS_POR_DIA;
    const desde = new Date(Math.max(masViejo, tope) - MILISEGUNDOS_POR_DIA);
    const hasta = new Date(Date.now() + MILISEGUNDOS_POR_DIA);
    const cuentas = [...new Set(posts.map((post) => post.accountProviderRef))];
    const query = new URLSearchParams({
      startDate: desde.toISOString(),
      endDate: hasta.toISOString(),
      socialMediaIds: cuentas.join(","),
    });

    const body = await this.http.request<{ data?: PostfastAnalyticsRow[] }>(
      "GET",
      `/social-posts/analytics?${query.toString()}`,
    );

    for (const fila of body.data ?? []) {
      const platformPostId = typeof fila.platformPostId === "string" ? fila.platformPostId : null;
      // La ventana trae todo lo publicado en el rango, también posts por los
      // que nadie preguntó. Se ignoran: el caller mapea por el id que pidió.
      if (!platformPostId || !pedidos.has(platformPostId)) continue;
      const metric = fila.latestMetric;
      if (!metric) {
        // La fila VINO en la respuesta, o sea que preguntamos y el proveedor
        // contestó que de ese post no tiene números — es la forma
        // documentada para LinkedIn personal. Mismo trato que en Upload-Post:
        // snapshot con los cinco en null y el motivo en `raw`. Omitirlo
        // dejaría esos posts pendientes para siempre, re-preguntados en cada
        // pase y sin que nunca se registre nada sobre ellos.
        result.set(platformPostId, {
          capturedAt: new Date(),
          impressions: null,
          reach: null,
          likes: null,
          comments: null,
          shares: null,
          raw: fila,
        });
        continue;
      }
      result.set(platformPostId, {
        // Cuándo lo leímos NOSOTROS, que es lo que significa la columna —y de
        // donde el job saca el día del snapshot. Usar el `fetchedAt` del
        // proveedor (puede ser de hace 6 h) haría que un pase de las 02:00
        // escribiera en la fila de AYER, pisando sus números finales, y que
        // otro pase del mismo día creara la de hoy: dos filas el mismo día,
        // que es justo lo que el índice único existe para impedir. La edad
        // real del número no se pierde: `fetchedAt` viaja entero en `raw`.
        capturedAt: new Date(),
        impressions: parseMetricNumber(metric.impressions),
        reach: parseMetricNumber(metric.reach),
        likes: parseMetricNumber(metric.likes),
        comments: parseMetricNumber(metric.comments),
        shares: parseMetricNumber(metric.shares),
        raw: fila,
      });
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
