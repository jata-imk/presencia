import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ChannelAccountDto, ConnectIntentDto, SocialNetwork } from "@presencia/shared";
import { randomUUID } from "node:crypto";
import { CardsRepository } from "../cards/cards.repository.js";
import { DbService } from "../db/db.service.js";
import { FakePublishingProvider } from "../publishing/fake.provider.js";
import { PUBLISHING_PROVIDER, type PublishingProvider } from "../publishing/publishing.provider.js";
import { ChannelsRepository, type SocialAccountRow } from "./channels.repository.js";

// El workspace de PostFast es único y compartido entre todos los usuarios de
// Presencia (ADR-009 addendum) — "conectar tu red" no puede ser "leer las
// cuentas del workspace", porque cualquiera vería las de todos. Se resuelve
// con un diff: al iniciar la conexión se guarda una foto de qué cuentas ya
// existían (`known_account_refs`); al volver de postfa.st, las cuentas
// NUEVAS respecto a esa foto son las del usuario que inició ESTA conexión.
//
// Límite conocido y documentado (no resuelto en F6): si dos usuarios abren
// su flujo de conexión casi al mismo tiempo y ambos conectan una cuenta
// antes de que cualquiera reclame, el diff puede atribuir la cuenta al
// usuario equivocado. Un lock verdadero necesitaría ver intents de OTROS
// tenants, que RLS impide por diseño (current_setting('app.user_id') exige
// tenant fijado para cualquier query, incluida una de solo lectura
// cross-tenant) — implementarlo bien pediría BYPASSRLS, que
// modelo-de-datos.md prohíbe "por comodidad". Con Presencia pre-lanzamiento
// y solo-founder, el riesgo real es bajo; el índice único de
// social_accounts SÍ impide que una cuenta ya reclamada se le robe a su
// dueño real (ver claimConnectIntent).
const INTENT_TTL_MS = 30 * 60 * 1000;
const CONNECT_LINK_EXPIRY_DAYS = 7;

@Injectable()
export class ChannelsService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(ChannelsRepository) private readonly repo: ChannelsRepository,
    @Inject(PUBLISHING_PROVIDER) private readonly provider: PublishingProvider,
    @Inject(CardsRepository) private readonly cardsRepo: CardsRepository,
  ) {}

  async listAccounts(userId: string): Promise<ChannelAccountDto[]> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const rows = await this.repo.listAccounts(tx);
      return rows.map(toDto);
    });
  }

  // Vista separada (F6 follow-up, "no me gusta que las desconectadas se
  // queden mezcladas") — mismo patrón que ChatService.listArchivedChats.
  async listDisconnectedAccounts(userId: string): Promise<ChannelAccountDto[]> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const rows = await this.repo.listDisconnectedAccounts(tx);
      return rows.map(toDto);
    });
  }

  async createConnectIntent(userId: string): Promise<ConnectIntentDto> {
    const [accounts, link] = await Promise.all([
      this.provider.listAccounts(),
      this.provider.createConnectLink({ expiryDays: CONNECT_LINK_EXPIRY_DAYS }),
    ]);
    const expiresAt = new Date(Date.now() + INTENT_TTL_MS);
    return this.dbService.runWithTenant(userId, async (tx) => {
      const intent = await this.repo.insertIntent(tx, {
        userId,
        knownAccountRefs: accounts.map((a) => a.providerRef),
        expiresAt,
      });
      return { id: intent.id, connectUrl: link.connectUrl, expiresAt: expiresAt.toISOString() };
    });
  }

  async claimConnectIntent(userId: string, intentId: string): Promise<ChannelAccountDto[]> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const intent = await this.repo.findIntentById(tx, intentId);
      if (!intent) throw new NotFoundException("No encontramos esa conexión.");
      if (intent.consumedAt) throw new ConflictException("Esa conexión ya se usó.");
      if (intent.expiresAt.getTime() < Date.now()) {
        throw new BadRequestException("Esa conexión expiró — vuelve a intentar conectar tu red.");
      }

      const accounts = await this.provider.listAccounts();
      const known = new Set(intent.knownAccountRefs as string[]);
      const newAccounts = accounts.filter((a) => !known.has(a.providerRef));

      // Se consume ya, antes de reclamar: un segundo click en "Conectar" con
      // el mismo intent no debe volver a intentar atribuirse cuentas que ya
      // procesamos (idempotencia del claim, no del efecto en PostFast).
      await this.repo.consumeIntent(tx, intent.id);

      // Nota: mientras la cuenta siga viva en PostFast, un providerRef que
      // ya entró a un snapshot nunca vuelve a calificar como "nueva" aquí
      // — incluso si el usuario la desconectó solo de nuestro lado
      // (disconnectAccount es un flag local, no revoca nada en PostFast).
      // Reconectar ESE caso es reactivateAccount(), no este flujo.
      //
      // Pero si la cuenta salió del workspace de verdad (token expirado,
      // revocada) y el usuario la reautoriza en postfa.st desde "Conectar
      // red" en vez de "Reconectar" (que rechaza justo por eso), SÍ vuelve
      // a aparecer como "nueva" en el diff — el catch de abajo la reclama
      // sin perderla en silencio.
      const claimed: SocialAccountRow[] = [];
      for (const account of newAccounts) {
        // listAccounts() no omite cuentas con token revocado, solo las
        // marca (connectionStatus !== "CONNECTED" → connected:false, ver
        // postfa.st/docs/accounts/list) — reclamar o reactivar una cuenta
        // que el proveedor ya no puede usar sería el mismo error que
        // reactivateAccount() bloquea abajo, solo que por este otro
        // camino.
        if (!account.connected) continue;
        try {
          // SAVEPOINT (tx.transaction anidado), no la tx de afuera
          // directo: un unique_violation dentro de la tx principal la deja
          // "aborted" del lado de Postgres — cualquier query siguiente
          // (el findAccountByProviderRef del catch, o el insertAccount del
          // próximo account del for) fallaría con 25P02 aunque el error ya
          // se haya capturado en JS. El savepoint aísla el fallo: si el
          // insert truena, drizzle hace ROLLBACK TO SAVEPOINT y la tx de
          // afuera sigue utilizable.
          const inserted = await tx.transaction((savepoint) =>
            this.repo.insertAccount(savepoint, {
              userId,
              network: account.network,
              providerRef: account.providerRef,
              displayName: account.displayName,
            }),
          );
          claimed.push(inserted);
        } catch (error) {
          if (!isProviderRefConflict(error)) throw error;

          // El índice único de providerRef es GLOBAL (todo el workspace),
          // no por tenant — este conflicto tiene dos causas posibles y hay
          // que distinguirlas:
          //  1. Otro usuario ya reclamó esta cuenta primero (carrera de
          //     conexión, ver comentario de cabecera) — su fila es
          //     invisible para mi RLS, así que esta re-lectura regresa
          //     undefined. Se ignora, nunca se le atribuye a este usuario.
          //  2. Es MI PROPIA cuenta, ya existía como "disconnected" (p.ej.
          //     el token expiró, la desconecté, y ahora la reautoricé en
          //     postfa.st desde "Conectar red" en vez de "Reconectar" —
          //     que rechaza justo por esto, ver reactivateAccount). Mi RLS
          //     SÍ ve esa fila — hay que reactivarla, no perder el claim en
          //     silencio como pasaba antes.
          const own = await this.repo.findAccountByProviderRef(tx, account.providerRef);
          if (!own) continue;
          claimed.push(
            await this.repo.reactivateAccount(tx, own.id, account.displayName ?? own.displayName),
          );
        }
      }
      return claimed.map(toDto);
    });
  }

  /**
   * Solo oculta la cuenta del lado de Presencia (no revoca nada en
   * PostFast) — por eso reconectarla es reactivateAccount(), directo,
   * sin pasar por el flujo de connect-intent (ver nota en
   * claimConnectIntent: un providerRef que ya vimos una vez jamás vuelve a
   * calificar como "nuevo" en el diff).
   */
  async disconnectAccount(userId: string, id: string): Promise<void> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const account = await this.repo.findAccountById(tx, id);
      if (!account) throw new NotFoundException("No encontramos esa cuenta conectada.");
      await this.repo.disconnectAccount(tx, id);
    });
  }

  /**
   * Borrado permanente (F6 follow-up, "no me gusta que las desconectadas
   * se queden mezcladas") — a diferencia de disconnectAccount (soft,
   * reversible), esto sí borra la fila. Mismo guard que
   * ChatService.deleteChat: una card "scheduled" es un compromiso real en
   * postfa.st, borrar la cuenta que apunta no debe dejarla sin rastro.
   */
  async deleteAccount(userId: string, id: string): Promise<void> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const account = await this.repo.findAccountById(tx, id);
      if (!account) throw new NotFoundException("No encontramos esa cuenta conectada.");
      const hasScheduled = await this.cardsRepo.hasScheduledCardsForAccount(tx, id);
      if (hasScheduled) {
        throw new BadRequestException(
          "Esta cuenta tiene publicaciones programadas — cancélalas o espera a que se publiquen antes de eliminarla.",
        );
      }
      await this.repo.deleteAccount(tx, id);
    });
  }

  /**
   * Antes solo volteaba el flag local sin preguntarle a PostFast nada —
   * "Reconectar" podía mostrar como activa una cuenta cuyo token ya se
   * revocó del otro lado, y el usuario no se enteraba hasta que un
   * schedule() fallara después. Ahora confirma contra el workspace real
   * primero (mismo patrón que claimConnectIntent: red fuera de la
   * transacción, luego un segundo runWithTenant para el write).
   */
  async reactivateAccount(userId: string, id: string): Promise<ChannelAccountDto> {
    const account = await this.dbService.runWithTenant(userId, (tx) =>
      this.repo.findAccountById(tx, id),
    );
    if (!account) throw new NotFoundException("No encontramos esa cuenta conectada.");

    const providerAccounts = await this.provider.listAccounts();
    // .connected, no solo presencia: PostFast sigue listando una cuenta con
    // token revocado (connectionStatus:"DISABLED"), no la quita — sin este
    // filtro, "Reconectar" habría vuelto a mostrar como activa justo la
    // cuenta que este método existe para bloquear.
    const stillConnected = providerAccounts.find(
      (a) => a.providerRef === account.providerRef && a.connected,
    );
    if (!stillConnected) {
      throw new ConflictException(
        'Esa cuenta ya no está conectada en PostFast — vuelve a autorizarla desde "Conectar red".',
      );
    }

    return this.dbService.runWithTenant(userId, async (tx) => {
      const reactivated = await this.repo.reactivateAccount(tx, id, stillConnected.displayName);
      return toDto(reactivated);
    });
  }

  /**
   * Solo-dev: simula "ya conecté mi cuenta en postfa.st" cuando se prueba
   * con PUBLISHING_PROVIDER=fake, que arranca sin ninguna cuenta (a
   * propósito — seedAccount es privado del proveedor, no un default). No
   * toca social_accounts: agrega la cuenta al lado del "workspace" fake
   * para que el flujo real (Conectar red → esto → Ya conecté mi cuenta) la
   * detecte por diff, exactamente como pasaría con PostFast real. 404 si el
   * provider activo no es el fake — no existe superficie nueva en prod.
   */
  seedFakeAccount(network: SocialNetwork, displayName: string): void {
    if (!(this.provider instanceof FakePublishingProvider)) {
      throw new NotFoundException();
    }
    this.provider.seedAccount({ providerRef: `fake_seed_${randomUUID()}`, network, displayName });
  }
}

function toDto(row: SocialAccountRow): ChannelAccountDto {
  return { id: row.id, network: row.network, displayName: row.displayName, status: row.status };
}

/** SQLSTATE 23505 (unique_violation) sobre social_accounts_provider_ref. */
function isProviderRefConflict(error: unknown): boolean {
  const pgError = extractPgError(error);
  return pgError?.code === "23505" && pgError.constraint === "social_accounts_provider_ref";
}

function extractPgError(error: unknown): { code?: string; constraint?: string } | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const withCode = error as { code?: unknown; constraint?: unknown; cause?: unknown };
  if (typeof withCode.code === "string") {
    return { code: withCode.code, constraint: withCode.constraint as string | undefined };
  }
  // drizzle-orm envuelve el error del driver pg y lo expone en `.cause`
  // (mismo patrón que rls.spec.ts usa para inspeccionar violaciones de RLS).
  return withCode.cause ? extractPgError(withCode.cause) : undefined;
}
