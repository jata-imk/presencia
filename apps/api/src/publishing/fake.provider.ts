import { Injectable } from "@nestjs/common";
import type {
  ProviderAccount,
  ProviderPostState,
  PublishingProvider,
  SchedulePostRequest,
} from "./publishing.provider.js";

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

  listAccounts(): Promise<ProviderAccount[]> {
    return Promise.resolve([...this.accounts]);
  }

  createConnectLink(): Promise<{ connectUrl: string }> {
    return Promise.resolve({ connectUrl: "https://postfa.st/fake-connect-link" });
  }

  schedule(req: SchedulePostRequest): Promise<{ providerRef: string }> {
    this.counter += 1;
    const providerRef = `fake_${this.counter}`;
    this.posts.set(providerRef, { scheduledAt: req.scheduledAt });
    return Promise.resolve({ providerRef });
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
