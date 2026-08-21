import type { CardContent, SocialNetwork } from "@presencia/shared";

// Interfaz propia (ADR-009): PostFast es plomería detrás de este puerto.
// Vocabulario 100% nuestro — ni un pf-api-key, ni un socialMediaId, ni un
// PUBLISHED en mayúsculas cruza esta frontera hacia el resto del backend.
// El token de inyección es un Symbol porque Nest no puede inyectar una
// interfaz TS (se borra al compilar) — necesita un valor en runtime.
export const PUBLISHING_PROVIDER = Symbol("PUBLISHING_PROVIDER");

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
  /** Cuentas conectadas visibles con la API key actual (todo el workspace). */
  listAccounts(): Promise<ProviderAccount[]>;
  /** Link para que el usuario conecte una cuenta nueva desde postfa.st. */
  createConnectLink(input: { expiryDays: number }): Promise<{ connectUrl: string }>;
  schedule(req: SchedulePostRequest): Promise<{ providerRef: string }>;
  /** Idempotente: cancelar una publicación que ya no existe no es un error. */
  cancel(providerRef: string): Promise<void>;
  /** Batch de hasta 100 refs (límite del proveedor). El caller trocea si hay más. */
  getPostStates(providerRefs: string[]): Promise<Map<string, ProviderPostState>>;
}
