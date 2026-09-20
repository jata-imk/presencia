import type { CardContent, SocialNetwork } from "@presencia/shared";

// Interfaz propia (ADR-009): el proveedor de publicación es plomería detrás
// de este puerto. Vocabulario 100% nuestro — ni un pf-api-key, ni un
// socialMediaId, ni un PUBLISHED en mayúsculas cruza esta frontera hacia el
// resto del backend.
// El token de inyección es un Symbol porque Nest no puede inyectar una
// interfaz TS (se borra al compilar) — necesita un valor en runtime.
export const PUBLISHING_PROVIDER = Symbol("PUBLISHING_PROVIDER");

/**
 * Dónde viven las cuentas de UN usuario dentro del proveedor.
 *
 * Existe porque los dos proveedores que conocemos lo resuelven distinto y el
 * puerto no puede asumir ninguno de los dos (F7.5: primera vez que se
 * ejercita la abstracción con un segundo proveedor):
 * - PostFast tiene un solo workspace global compartido por todos los
 *   usuarios de Presencia; `ref` es una constante y ChannelsService tiene
 *   que averiguar por diff qué cuenta es de quién.
 * - Upload-Post tiene un perfil por usuario; `ref` es ese perfil y las
 *   cuentas que devuelve ya son solo las de ese usuario.
 *
 * `ref` es opaco: solo el adapter que lo emitió sabe interpretarlo.
 */
export interface WorkspaceRef {
  ref: string;
}

export interface ProviderAccount {
  /** Id de la cuenta en el proveedor (PostFast: socialMediaId). */
  providerRef: string;
  network: SocialNetwork;
  displayName: string | null;
  /**
   * false si el proveedor la sigue listando pero ya no está usable (token
   * revocado, etc — PostFast: connectionStatus !== "CONNECTED", ver
   * postfa.st/docs/accounts/list). listAccounts() NO omite estas cuentas,
   * solo las marca — el caller decide qué hacer (ChannelsService las trata
   * como "no disponible", no como ausente).
   */
  connected: boolean;
}

export interface SchedulePostRequest {
  network: SocialNetwork;
  content: CardContent;
  /** Siempre UTC — el caller ya tradujo desde el timezone del usuario. */
  scheduledAt: Date;
  /** providerRef de la social_accounts fila destino. */
  accountProviderRef: string;
}

export type ProviderPostStatus = "scheduled" | "published" | "failed";

export interface ProviderPostState {
  status: ProviderPostStatus;
  publishedAt: Date | null;
  /**
   * Enlace al post en la red, cuando el proveedor lo da y el post ya se
   * publicó. `null` es un valor legítimo y frecuente, no un error: PostFast
   * no devuelve la URL en ninguna de sus respuestas. El frontend degrada
   * solo (botón apagado con tooltip) en vez de bifurcar por proveedor.
   */
  postUrl: string | null;
  /**
   * Id del post en la red, no en el proveedor (Facebook `<pageId>_<postId>`,
   * LinkedIn `urn:li:share:…`, X el id numérico del tweet). `null` es
   * legítimo, igual que `postUrl`: PostFast no lo devuelve en su respuesta de
   * estado.
   *
   * Existe porque es la llave con la que se piden métricas (F8.7): el
   * `providerRef` identifica el envío dentro del proveedor, no la publicación
   * dentro de la red, y los endpoints de analíticas preguntan por el segundo.
   */
  platformPostId: string | null;
}

/** Un post ya publicado, del que se quieren métricas. */
export interface PostMetricsQuery {
  /** `providerRef` de la social_accounts por la que se publicó. */
  accountProviderRef: string;
  network: SocialNetwork;
  /** Id del post en la RED (ProviderPostState.platformPostId), no el del envío. */
  platformPostId: string;
  /** Cuándo se publicó. Algún proveedor pregunta por rango de fechas, no por id. */
  publishedAt: Date;
}

/**
 * Métricas de UN post en UN momento.
 *
 * Los cinco números son los que comparten todas las redes. `null` no es `0`:
 * `0` es "nadie lo vio", `null` es "la red no reportó esa métrica" (ADR-021).
 * Lo que cada red da además vive en `raw`, sin normalizar.
 */
export interface PostMetricsSnapshot {
  capturedAt: Date;
  impressions: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  /** Crudo del proveedor. Cuando NO hubo números, el motivo que dio. */
  raw: unknown;
}

export interface PublishingProvider {
  /**
   * Resuelve (creándolo si hace falta) el workspace del usuario en el
   * proveedor. Idempotente y puede hacer red — llamarlo FUERA de una
   * transacción de base de datos.
   */
  ensureWorkspace(userId: string): Promise<WorkspaceRef>;
  /** Cuentas conectadas visibles dentro de ese workspace. */
  listAccounts(ws: WorkspaceRef): Promise<ProviderAccount[]>;
  /**
   * Link para que el usuario conecte una cuenta nueva desde el proveedor.
   * La vigencia la decide el proveedor y viene de vuelta en `expiresAt`: no
   * es un parámetro porque no todos la dejan elegir (el JWT de Upload-Post
   * dura 48 h fijas).
   */
  createConnectLink(input: { ws: WorkspaceRef }): Promise<{
    connectUrl: string;
    expiresAt: Date;
  }>;
  schedule(req: SchedulePostRequest): Promise<{ providerRef: string }>;
  /**
   * Mueve de horario un post que el proveedor YA tiene, conservándolo
   * cuando puede (Upload-Post: `PATCH`, mismo job_id).
   *
   * Recibe el `req` completo y no solo la fecha porque un proveedor sin
   * endpoint de update tiene que emularlo recreando el post, y para eso
   * necesita red, contenido y cuenta destino (PostFast: cancel + create).
   *
   * Por lo mismo, el `providerRef` que devuelve **puede ser distinto** del
   * que recibió: el caller tiene que persistir el que vuelve, no asumir que
   * es el viejo.
   *
   * CONTRATO, y el dominio depende de él: si esto lanza un rechazo explícito
   * (`PublishingRejectedError`), el proveedor **no cambió nada y el post
   * original sigue vivo en su horario original**. Es lo que le permite a
   * `CardsService` devolver la card a donde estaba en vez de mandarla a
   * `draft` — reprogramar y fallar no debe costarte la programación que ya
   * tenías.
   *
   * Cumplirlo es responsabilidad del adapter, y no es gratis para el que
   * tiene que emular: `PostFastProvider` crea el post nuevo ANTES de
   * cancelar el viejo justo por esto (al revés, un rechazo del create
   * dejaría a la card apuntando a un post ya borrado). Un fallo AMBIGUO
   * (`PublishingUnavailableError`) no promete nada: ahí el caller ya asume
   * que no sabe qué pasó.
   */
  reschedule(
    previousProviderRef: string,
    req: SchedulePostRequest,
  ): Promise<{ providerRef: string }>;
  /** Idempotente: cancelar una publicación que ya no existe no es un error. */
  cancel(providerRef: string): Promise<void>;
  /** Batch de hasta 100 refs (límite del proveedor). El caller trocea si hay más. */
  getPostStates(providerRefs: string[]): Promise<Map<string, ProviderPostState>>;
  /**
   * Métricas de posts YA publicados (F8.7). La clave del Map es
   * `platformPostId`.
   *
   * Tres resultados posibles, y los tres son normales:
   *
   *  1. **Snapshot con números.** El caso feliz.
   *  2. **Snapshot con los cinco en `null` y el motivo en `raw`.** Cubre dos
   *     hechos distintos, los dos permanentes o casi: "la red no da métricas
   *     para esta cuenta" (LinkedIn solo las da de páginas de empresa) y "el
   *     proveedor no cubre esta red". Ninguno es un error: son hechos sobre
   *     esa publicación, y guardarlos es lo que evita volver a preguntar lo
   *     mismo. Un adapter que los dejara ausentes haría que la política de
   *     frescura los tratara como "nunca medidos" —máxima prioridad— en todos
   *     los pases, para siempre.
   *  3. **Ausente del Map.** No se llegó a preguntar, o se preguntó y no se
   *     entendió la respuesta. Es TRANSITORIO: el caller no escribe nada y el
   *     siguiente pase vuelve a intentar.
   *
   * Y un cuarto camino que no es un resultado: si TODO lo que se pidió falló,
   * el adapter lanza. Un Map vacío significaría "no había nada", y eso es
   * indistinguible de "el proveedor está caído" — que es justo lo que hay que
   * poder ver.
   *
   * El troceo y el respeto de los límites de tasa son del adapter, no del
   * caller: cada proveedor tiene el suyo y pregunta distinto (Upload-Post una
   * request por post con tope de 100 cada 5 minutos, PostFast una por rango
   * de fechas).
   */
  getPostMetrics(posts: readonly PostMetricsQuery[]): Promise<Map<string, PostMetricsSnapshot>>;
}
