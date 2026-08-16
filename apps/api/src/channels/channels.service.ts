import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ChannelAccountDto, ConnectIntentDto, SocialNetwork } from "@presencia/shared";
import { randomUUID } from "node:crypto";
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
  ) {}

  async listAccounts(userId: string): Promise<ChannelAccountDto[]> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const rows = await this.repo.listAccounts(tx);
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

      // Nota: una vez que un providerRef entra a UN snapshot, sigue
      // apareciendo en todos los siguientes mientras la cuenta exista en
      // PostFast — así que nunca vuelve a calificar como "nueva" aquí,
      // incluso si el usuario la desconectó solo de nuestro lado
      // (disconnectAccount es un flag local, no revoca nada en PostFast).
      // Por diseño, este bucle solo puede toparse con providerRefs que
      // jamás pasaron por social_accounts: reconectar una cuenta ya
      // conocida es reactivateAccount(), no este flujo.
      const claimed: SocialAccountRow[] = [];
      for (const account of newAccounts) {
        try {
          claimed.push(
            await this.repo.insertAccount(tx, {
              userId,
              network: account.network,
              providerRef: account.providerRef,
              displayName: account.displayName,
            }),
          );
        } catch (error) {
          if (isProviderRefConflict(error)) {
            // Otro usuario ya reclamó esta cuenta primero (carrera de
            // conexión en el workspace compartido, ver comentario de
            // cabecera) — se ignora, nunca se le atribuye a este usuario.
            continue;
          }
          throw error;
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

  async reactivateAccount(userId: string, id: string): Promise<ChannelAccountDto> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const account = await this.repo.findAccountById(tx, id);
      if (!account) throw new NotFoundException("No encontramos esa cuenta conectada.");
      const reactivated = await this.repo.reactivateAccount(tx, id, account.displayName);
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
