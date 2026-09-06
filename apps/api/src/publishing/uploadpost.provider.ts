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

// Adapter real contra Upload-Post (ADR-009, F7.5). Segundo proveedor detrás
// del mismo puerto — existe porque PostFast dejó de tener suscripción activa
// y porque el plan gratis de Upload-Post alcanza para probar el ciclo
// completo contra una API de verdad.
//
// Contrato verificado contra `docs.upload-post.com/openapi.json` LEÍDO
// ENTERO (2026-09-06). No alcanza con sus páginas de documentación humana:
// no mencionan ni PATCH ni DELETE de programados. Tampoco alcanza con un
// resumen del openapi: `components.schemas` está al final del archivo y es
// lo primero que se pierde al truncar — y ahí viven justo los campos que
// deciden el diseño de abajo.
//
// Dos diferencias de fondo con PostFast, y las dos importan:
//
//  1. PERFILES. Upload-Post tiene un perfil por usuario final
//     (`POST /uploadposts/users`), no un workspace global. `ensureWorkspace`
//     lo crea si falta; el nombre se DERIVA del users.id de Presencia en vez
//     de persistirse, así que no hay columna nueva ni migración: el mismo
//     usuario siempre resuelve al mismo perfil.
//
//  2. EL ESTADO NO TRAE LA URL DEL POST. `GET /uploadposts/status` devuelve
//     `{status, results:[{platform, success, message, upload_timestamp}]}`
//     — sin `post_url` ni id de post, al revés de lo que decía el ticket de
//     Notion. La URL vive en `GET /uploadposts/history`, cuyo `HistoryItem`
//     sí trae `job_id`, `post_url`, `platform_post_id` y `error_message`.
//     Por eso `getPostStates` no usa /status: resuelve con dos llamadas
//     (`/schedule` para los pendientes, `/history` para los que ya
//     corrieron) en vez de una por ref, y de paso deja `post_url` a mano
//     para PR4.
//
// Auth: header `Authorization: Apikey <KEY>` (no Bearer). Base URL con `/api`
// incluido — todas las rutas del openapi cuelgan de ahí.

const BASE_URL_DEFAULT = "https://api.upload-post.com/api";

// El perfil se deriva del users.id, no se guarda. `ensureWorkspace` es
// idempotente contra el 409 del proveedor, así que no hace falta recordar
// cuáles ya existen más allá de la memoización de proceso de abajo.
const PROFILE_PREFIX = "presencia-";

// Separa perfil de plataforma dentro de social_accounts.provider_ref. Ni los
// uuid del prefijo ni los nombres de plataforma contienen ":".
const ACCOUNT_REF_SEPARATOR = ":";

// El JWT de conexión dura 48 h y no es configurable (a diferencia del
// expiryDays de PostFast). La respuesta trae `duration:"48h"` como string
// libre; no se parsea, se usa esta constante.
const CONNECT_LINK_TTL_MS = 48 * 60 * 60 * 1000;

// `limit` solo acepta 10|20|50|100 (LimitParam del openapi) y `page` empieza
// en 1. El tope acota el peor caso de getPostStates: 500 subidas hacia
// atrás, ordenadas de más reciente a más vieja.
//
// Suele alcanzar porque la reconciliación solo pregunta por cards cuya hora
// ACABA de pasar (CardsService.listDueScheduled). Pero el orden es por
// recencia GLOBAL — el historial está scopeado por API key, no por perfil —,
// así que con varios usuarios activos un item puede caer más allá del tope.
// Ese caso NO se resuelve mirando más páginas, se detecta: ver el uso de
// `total` al final de getPostStates.
const HISTORY_PAGE_SIZE = 100;
const MAX_HISTORY_PAGES = 5;

// SocialNetwork (nuestro enum) → platform de Upload-Post. Minúsculas, 1:1.
const PLATFORM_BY_NETWORK: Record<SocialNetwork, string> = {
  instagram: "instagram",
  facebook: "facebook",
  tiktok: "tiktok",
  linkedin: "linkedin",
  youtube: "youtube",
  threads: "threads",
  x: "x",
};

// Redes nuestras que `POST /upload_text` acepta (TextPlatformEnum del
// openapi). Instagram, TikTok y YouTube quedan fuera porque exigen foto o
// video.
//
// OJO: este corte NO es el mismo que el de CardsService.assertHasMedia.
// Aquel rechaza esas tres redes solo cuando la card viene SIN assets; una
// card de Instagram CON imagen lo pasa y llega hasta acá. Y acá se rechaza
// igual, porque subir media real (mandar el archivo en el multipart) es
// trabajo de F10/F11 y todavía no existe — por eso el mensaje habla de eso
// y no de "te falta una imagen", que sería mentirle al usuario justo cuando
// sí la tiene.
const TEXT_PLATFORMS: ReadonlySet<string> = new Set(["linkedin", "x", "facebook", "threads"]);

// Plataformas que se le ofrecen al usuario en la página de conexión. Es el
// cruce de nuestro enum con el que acepta generate-jwt.
const CONNECTABLE_PLATFORMS = Object.values(PLATFORM_BY_NETWORK);

/**
 * Valor de `social_accounts[plataforma]`. El openapi lo declara como un
 * oneOf de tres formas, y las tres aparecen en la práctica: el objeto
 * completo cuando la cuenta está conectada, un string (vacío cuando la
 * conexión quedó a medias) y null.
 */
type UploadPostSocialAccount =
  | {
      username?: string;
      handle?: string;
      display_name?: string;
      reauth_required?: boolean;
    }
  | string
  | null;

interface UploadPostProfile {
  username?: string;
  social_accounts?: Record<string, UploadPostSocialAccount>;
}

interface UploadPostHistoryItem {
  job_id?: string | null;
  success?: boolean;
  post_url?: string | null;
  upload_timestamp?: string | null;
}

interface UploadPostHistoryPage {
  history?: UploadPostHistoryItem[];
  /** Total de subidas en el historial completo, para detectar truncamiento. */
  total?: number;
  /**
   * NO está en el openapi — apareció al llamar al endpoint de verdad
   * (2026-09-06). Son los jobs que ya dispararon pero siguen subiendo: no
   * están en `/uploadposts/schedule` (ya salieron de la cola) ni todavía en
   * `history` (no terminaron). Sin mirarlo, `getPostStates` los omitiría y
   * `reconcileDueCards` marcaría como FALLIDA una publicación que está
   * viva — el peor error posible de esta capa.
   *
   * Como no está documentado, tampoco lo está su forma: se acepta tanto un
   * array de job_ids sueltos como uno de objetos con `job_id`.
   */
  in_progress?: Array<string | { job_id?: string | null } | null>;
}

export class UploadPostProvider implements PublishingProvider {
  // Memoización por proceso: sin esto, cada listAccounts/createConnectLink
  // pagaría un POST de creación de perfil que casi siempre responde 409.
  private readonly ensuredProfiles = new Set<string>();
  private readonly http: ProviderHttpClient;

  constructor(apiKey: string, baseUrl: string = BASE_URL_DEFAULT) {
    this.http = new ProviderHttpClient("Upload-Post", baseUrl, {
      Authorization: `Apikey ${apiKey}`,
    });
  }

  async ensureWorkspace(userId: string): Promise<WorkspaceRef> {
    const username = `${PROFILE_PREFIX}${userId}`;
    if (this.ensuredProfiles.has(username)) return { ref: username };
    try {
      await this.http.request("POST", "/uploadposts/users", { username });
    } catch (error) {
      if (!(error instanceof PublishingRejectedError)) throw error;
      // 409 = el perfil ya existe. Es el caso normal en cuanto el proceso se
      // reinicia, no un fallo: por eso ensureWorkspace es idempotente y el
      // nombre del perfil se deriva en vez de guardarse.
      //
      // Este 409 viene del openapi y NO se pudo confirmar contra la cuenta
      // real: el plan tenía sus perfiles agotados, así que no había forma de
      // crear uno para después repetirlo. Si algún día resulta que el
      // proveedor responde otra cosa, esto falla ruidosamente (el error
      // propaga) en vez de seguir con un perfil que no existe.
      if (isStatus(error.detail, 409)) {
        this.ensuredProfiles.add(username);
        return { ref: username };
      }
      // 403 al crear = el plan llegó a su tope de perfiles. Verificado
      // contra la cuenta real (2026-09-06): responde 403 con el body VACÍO,
      // así que sin este caso el usuario vería un "Upload-Post rechazó la
      // solicitud (403)" que no explica nada. Se dice "puede que" porque un
      // 403 también podría ser una key sin permisos.
      if (isStatus(error.detail, 403)) {
        throw new PublishingRejectedError(
          "No se pudo crear tu perfil en Upload-Post. Puede que la cuenta haya llegado al límite de perfiles de su plan.",
          error.detail,
        );
      }
      throw error;
    }
    this.ensuredProfiles.add(username);
    return { ref: username };
  }

  // `social_accounts` viene KEYED POR PLATAFORMA, no como array: un perfil
  // tiene a lo sumo una cuenta por red (límite del proveedor, aceptado y
  // documentado en ADR-009 — PostFast sí admite varias de la misma red).
  //
  // Igual que en PostFast, una cuenta que ya no sirve NO se omite: se lista
  // con connected:false para que ChannelsService la trate como "no
  // disponible" y no como ausente (ver ProviderAccount.connected).
  async listAccounts(ws: WorkspaceRef): Promise<ProviderAccount[]> {
    const body = await this.http.request<{ profile?: UploadPostProfile }>(
      "GET",
      `/uploadposts/users/${encodeURIComponent(ws.ref)}`,
    );
    const accounts: ProviderAccount[] = [];
    for (const [platform, value] of Object.entries(body.profile?.social_accounts ?? {})) {
      const network = networkFromPlatform(platform);
      if (!network) continue;
      accounts.push({
        providerRef: `${ws.ref}${ACCOUNT_REF_SEPARATOR}${platform}`,
        network,
        displayName: displayNameFrom(value),
        connected: isConnected(value),
      });
    }
    return accounts;
  }

  async createConnectLink(input: { ws: WorkspaceRef }): Promise<{
    connectUrl: string;
    expiresAt: Date;
  }> {
    const body = await this.http.request<{ access_url?: string }>(
      "POST",
      "/uploadposts/users/generate-jwt",
      {
        username: input.ws.ref,
        // La página de conexión detecta el idioma del navegador y cae a
        // inglés; forzamos español (regla dura #1 del proyecto).
        language: "es",
        platforms: CONNECTABLE_PLATFORMS,
      },
    );
    if (!body.access_url) {
      throw new PublishingUnavailableError("Upload-Post no devolvió el link de conexión.", {
        reason: "no_access_url_in_response",
        body,
      });
    }
    return { connectUrl: body.access_url, expiresAt: new Date(Date.now() + CONNECT_LINK_TTL_MS) };
  }

  async schedule(req: SchedulePostRequest): Promise<{ providerRef: string }> {
    const { profile, platform } = parseAccountRef(req.accountProviderRef);
    if (!TEXT_PLATFORMS.has(platform)) {
      throw new PublishingRejectedError(
        `Todavía no podemos publicar en ${platform}: esa red exige imagen o video, y subir el archivo al proveedor llega en una fase próxima.`,
        { reason: "media_upload_not_implemented", platform },
      );
    }

    // multipart/form-data incluso sin archivo: los endpoints de upload no
    // aceptan JSON. `platform[]` va con corchetes en el nombre del campo,
    // como lo declara el openapi.
    const form = new FormData();
    form.set("user", profile);
    form.append("platform[]", platform);
    form.set("title", buildPostText(req.content));
    form.set("scheduled_date", req.scheduledAt.toISOString());
    // scheduledAt ya viene en UTC por contrato del puerto, así que la zona
    // que mandamos es UTC y no la del perfil del usuario. Programar en la
    // zona correcta es responsabilidad del caller — esto no toca la deuda
    // de zona horaria del ScheduleDrawer.
    form.set("timezone", "UTC");

    const body = await this.http.request<{ job_id?: string }>("POST", "/upload_text", form);
    const providerRef = body.job_id;
    if (!providerRef) {
      // Misma lección que el incidente 2026-08-18 de PostFast: un 2xx cuyo
      // shape no entendemos NO es "no pasó nada". El body crudo viaja en
      // .detail para que sobreviva hasta error_detail en la DB.
      throw new PublishingUnavailableError("Upload-Post no devolvió el job_id del programado.", {
        reason: "no_job_id_in_response",
        body,
      });
    }
    return { providerRef };
  }

  async cancel(providerRef: string): Promise<void> {
    try {
      await this.http.request("DELETE", `/uploadposts/schedule/${encodeURIComponent(providerRef)}`);
    } catch (error) {
      // Idempotente por contrato del puerto: si el job ya no existe (se
      // publicó, o lo borraron), cancelar no debe tronar.
      if (error instanceof PublishingRejectedError && isStatus(error.detail, 404)) return;
      throw error;
    }
  }

  /**
   * Dos llamadas para todo el batch, no una por ref — ver la cabecera del
   * archivo sobre por qué /status no sirve.
   *
   * Los dos endpoints están scopeados por API key, no por perfil, así que
   * devuelven jobs de todos los usuarios de Presencia. No hay fuga: solo se
   * mira lo que matchea con los `providerRefs` que el caller ya trae de SUS
   * propias cards.
   *
   * Un ref que no aparece en ninguno de los dos se omite del Map — el
   * caller (CardsService.reconcileDueCards) trata "ausente" como fallida,
   * exactamente igual que con PostFast. La única excepción es el historial
   * truncado, abajo: ahí "no lo vi" no es "no existe".
   */
  async getPostStates(providerRefs: string[]): Promise<Map<string, ProviderPostState>> {
    const result = new Map<string, ProviderPostState>();
    if (providerRefs.length === 0) return result;
    const pending = new Set(providerRefs);
    let scannedHistory = 0;
    let historyTotal: number | undefined;

    // 1) Los que siguen en cola del lado del proveedor.
    const scheduled = await this.http.request<{
      scheduled_posts?: Array<{ job_id?: string | null }>;
    }>("GET", "/uploadposts/schedule");
    for (const post of scheduled.scheduled_posts ?? []) {
      if (post.job_id && pending.delete(post.job_id)) {
        result.set(post.job_id, { status: "scheduled", publishedAt: null });
      }
    }
    if (pending.size === 0) return result;

    // 2) Los que ya corrieron. history no filtra por job_id: se pagina de
    // más reciente a más viejo hasta cubrirlos o agotar el tope.
    //
    // El primer HistoryItem que matchea gana: schedule() manda exactamente
    // UNA plataforma por job, así que un job_id trae un solo item. El día
    // que se mande más de una habría que preferir el success:true en vez de
    // quedarse con el primero.
    for (let page = 1; page <= MAX_HISTORY_PAGES && pending.size > 0; page += 1) {
      const body = await this.http.request<UploadPostHistoryPage>(
        "GET",
        `/uploadposts/history?page=${page}&limit=${HISTORY_PAGE_SIZE}`,
      );

      // Primero los que están subiendo AHORA: siguen vivos, así que se
      // reportan como "scheduled" y no se los deja caer en el "ausente =
      // fallida" del caller (ver UploadPostHistoryPage.in_progress).
      for (const entry of body.in_progress ?? []) {
        const jobId = typeof entry === "string" ? entry : entry?.job_id;
        if (jobId && pending.delete(jobId)) {
          result.set(jobId, { status: "scheduled", publishedAt: null });
        }
      }

      const items = body.history ?? [];
      scannedHistory += items.length;
      if (typeof body.total === "number") historyTotal = body.total;
      for (const item of items) {
        if (!item.job_id || !pending.delete(item.job_id)) continue;
        result.set(
          item.job_id,
          item.success
            ? { status: "published", publishedAt: parseTimestamp(item.upload_timestamp) }
            : { status: "failed", publishedAt: null },
        );
      }
      // Última página: no hay nada más viejo que traer.
      if (items.length < HISTORY_PAGE_SIZE) break;
    }

    // Si quedaron refs sin resolver Y el historial se cortó antes del final,
    // "no lo encontré" NO significa "falló": significa que no llegamos a
    // mirar tan atrás. El historial está scopeado por API key y ordenado por
    // recencia GLOBAL, así que con varios usuarios activos el item de una
    // card puede quedar más allá del tope de páginas.
    //
    // Dejarlos ausentes haría que reconcileDueCards marcara como fallida una
    // publicación real — el mismo error que motivó leer `in_progress`. Se
    // reportan como "scheduled": el caller no las toca y el siguiente pase
    // vuelve a preguntar.
    if (pending.size > 0 && historyTotal !== undefined && historyTotal > scannedHistory) {
      for (const ref of pending) result.set(ref, { status: "scheduled", publishedAt: null });
    }
    return result;
  }
}

/**
 * Una fecha inválida NO es null, así que sobreviviría al `publishedAt ?? new
 * Date()` de reconcileDueCards y llegaría hasta el UPDATE, que tronaría y
 * abortaría el batch entero — incluidas las cards que ya estaban listas para
 * escribirse. Ante un timestamp que no se entiende, mejor null: el caller
 * cae a "ahora".
 */
function parseTimestamp(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** `presencia-<uuid>:linkedin` → perfil y plataforma. */
function parseAccountRef(accountProviderRef: string): { profile: string; platform: string } {
  const at = accountProviderRef.lastIndexOf(ACCOUNT_REF_SEPARATOR);
  if (at <= 0 || at === accountProviderRef.length - 1) {
    throw new PublishingRejectedError(
      "Esa cuenta no tiene un identificador válido de Upload-Post.",
      {
        reason: "malformed_account_ref",
        accountProviderRef,
      },
    );
  }
  return {
    profile: accountProviderRef.slice(0, at),
    platform: accountProviderRef.slice(at + 1),
  };
}

function networkFromPlatform(platform: string): SocialNetwork | null {
  const entry = Object.entries(PLATFORM_BY_NETWORK).find(([, p]) => p === platform);
  return (entry?.[0] as SocialNetwork) ?? null;
}

/**
 * Responde la pregunta que el ticket daba por abierta ("no encontré forma
 * documentada de saber si el token expiró"): `reauth_required`. Un string
 * vacío o un null significan que la conexión quedó a medias.
 */
function isConnected(value: UploadPostSocialAccount): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (value.reauth_required === true) return false;
  // Se exige una señal POSITIVA de identidad, no solo la ausencia de
  // `reauth_required`: el openapi admite como tercera forma un objeto sin
  // ninguno de los campos documentados, y tratarlo como sano haría que
  // claimConnectIntent insertara una fila para una red que en realidad no
  // está vinculada.
  return Boolean(value.handle ?? value.username ?? value.display_name);
}

function displayNameFrom(value: UploadPostSocialAccount): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() || null;
  return value.display_name ?? value.handle ?? value.username ?? null;
}
