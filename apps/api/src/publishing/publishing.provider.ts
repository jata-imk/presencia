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
}
