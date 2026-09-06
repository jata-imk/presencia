import { Injectable } from "@nestjs/common";
import type {
  ProviderAccount,
  ProviderPostState,
  PublishingProvider,
  SchedulePostRequest,
  WorkspaceRef,
} from "./publishing.provider.js";

const FAKE_WORKSPACE: WorkspaceRef = { ref: "fake:workspace" };
const FAKE_CONNECT_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Provider de dev y de todos los tests (PUBLISHING_PROVIDER=fake, default sin
// POSTFAST_API_KEY) — no es andamio temporal: es el provider permanente
// hasta que Jose cargue la key real. In-memory, sin red, determinista salvo
// por el reloj: un post "se publica" cuando su scheduledAt ya pasó, exacto
// mismo criterio que la reconciliación real de PostFast (polling, sin
// webhooks) espera encontrar.
@Injectable()
export class FakePublishingProvider implements PublishingProvider {
  private readonly accounts: ProviderAccount[] = [];
  private readonly posts = new Map<string, { scheduledAt: Date }>();
  private counter = 0;

  /**
   * Solo para tests: simula una cuenta ya conectada en el workspace.
   * `connected` por defecto true (el caso común) — pasar `connected:false`
   * para simular una cuenta que el proveedor sigue listando pero ya no es
   * usable (token revocado, ver postfa.st/docs/accounts/list).
   */
  seedAccount(account: Omit<ProviderAccount, "connected"> & { connected?: boolean }): void {
    this.accounts.push({ ...account, connected: account.connected ?? true });
  }

  // Un solo workspace, como PostFast: el fake emula la forma del proveedor
  // que inspiró el puerto, que es también la que ejercitan los tests de
  // ChannelsService (el diff antes/después). Hacerlo multi-perfil no
  // agregaría cobertura y rompería seedAccount, que no sabe de usuarios.
  ensureWorkspace(): Promise<WorkspaceRef> {
    return Promise.resolve(FAKE_WORKSPACE);
  }

  listAccounts(): Promise<ProviderAccount[]> {
    return Promise.resolve([...this.accounts]);
  }

  createConnectLink(): Promise<{
    connectUrl: string;
    expiresAt: Date;
  }> {
    return Promise.resolve({
      connectUrl: "https://postfa.st/fake-connect-link",
      expiresAt: new Date(Date.now() + FAKE_CONNECT_LINK_TTL_MS),
    });
  }

  schedule(req: SchedulePostRequest): Promise<{ providerRef: string }> {
    this.counter += 1;
    const providerRef = `fake_${this.counter}`;
    this.posts.set(providerRef, { scheduledAt: req.scheduledAt });
    return Promise.resolve({ providerRef });
  }

  /**
   * Conserva la misma ref, como un proveedor CON endpoint de update
   * (Upload-Post). Es a propósito, aunque el resto del fake imite a
   * PostFast: es la forma que el puerto prefiere y la que conviene tener
   * en dev, porque la emulación cancel+create es la degradada. Los tests
   * que necesitan ejercitar la emulación usan su propio provider.
   */
  reschedule(
    previousProviderRef: string,
    req: SchedulePostRequest,
  ): Promise<{ providerRef: string }> {
    // Si el post ya no existe del otro lado, reprogramar no puede
    // "actualizar" nada: se crea uno nuevo, igual que haría el real.
    if (!this.posts.has(previousProviderRef)) return this.schedule(req);
    this.posts.set(previousProviderRef, { scheduledAt: req.scheduledAt });
    return Promise.resolve({ providerRef: previousProviderRef });
  }

  cancel(providerRef: string): Promise<void> {
    // Idempotente por contrato: borrar una ref que ya no existe no es error.
    this.posts.delete(providerRef);
    return Promise.resolve();
  }

  getPostStates(providerRefs: string[]): Promise<Map<string, ProviderPostState>> {
    const now = new Date();
    const result = new Map<string, ProviderPostState>();
    for (const ref of providerRefs) {
      const post = this.posts.get(ref);
      // Ausente (nunca existió, o cancel() ya la borró): el caller lo trata
      // como "failed" — mismo contrato que el adapter real de PostFast.
      if (!post) continue;
      result.set(ref, {
        status: post.scheduledAt <= now ? "published" : "scheduled",
        publishedAt: post.scheduledAt <= now ? post.scheduledAt : null,
      });
    }
    return Promise.resolve(result);
  }
}
