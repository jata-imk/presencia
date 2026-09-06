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
  /** Idempotente: cancelar una publicación que ya no existe no es un error. */
  cancel(providerRef: string): Promise<void>;
  /** Batch de hasta 100 refs (límite del proveedor). El caller trocea si hay más. */
  getPostStates(providerRefs: string[]): Promise<Map<string, ProviderPostState>>;
}
