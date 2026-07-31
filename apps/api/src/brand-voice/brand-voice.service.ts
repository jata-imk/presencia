import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  formalityToRegister,
  REGISTER_FORMALITY_ANCHORS,
  type BrandVoiceDto,
  type BrandVoiceForPrompt,
  type BrandVoiceReferenceExample,
  type CreateBrandVoiceBody,
  type UpdateBrandVoiceBody,
} from "@presencia/shared";
import { DbService } from "../db/db.service.js";
import {
  BrandVoiceRepository,
  type BrandVoiceRow,
  type UpdateBrandVoicePatch,
} from "./brand-voice.repository.js";

@Injectable()
export class BrandVoiceService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(BrandVoiceRepository) private readonly repo: BrandVoiceRepository,
  ) {}

  getDefault(userId: string): Promise<BrandVoiceDto> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const row = await this.repo.findDefault(tx);
      if (!row) throw new NotFoundException("Aún no configuras tu voz de marca.");
      return this.toDto(row);
    });
  }

  // Usado por chat/system-prompt assembly (PR 2). null si el usuario
  // todavía no tiene voz (a medio onboarding) — el prompt cae a
  // BASE_SYSTEM_PROMPT sin romper el chat.
  getDefaultForPrompt(userId: string): Promise<BrandVoiceForPrompt | null> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const row = await this.repo.findDefault(tx);
      return row ? this.toPromptShape(row) : null;
    });
  }

  // PUT — paso "Voz" del onboarding: crea la default con los 3 campos
  // obligatorios. Idempotente (si ya existe, actualiza) para que reenviar
  // el paso no truene contra el índice único de is_default.
  upsertDefault(userId: string, body: CreateBrandVoiceBody): Promise<BrandVoiceDto> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const existing = await this.repo.findDefault(tx);
      const formality = REGISTER_FORMALITY_ANCHORS[body.register];

      if (existing) {
        const updated = await this.repo.updateDefault(tx, {
          marketCountry: body.marketCountry,
          marketRegion: body.marketRegion,
          niche: body.niche,
          audience: body.audience,
          register: body.register,
          formality,
        });
        return this.toDto(updated);
      }

      const created = await this.repo.insertDefault(tx, {
        userId,
        name: "Mi voz",
        marketCountry: body.marketCountry,
        marketRegion: body.marketRegion ?? null,
        niche: body.niche,
        audience: body.audience ?? null,
        register: body.register,
        formality,
      });
      return this.toDto(created);
    });
  }

  // PATCH — Configuración > Voz de marca: parcial, sobre los 4 bloques.
  updateDefault(userId: string, body: UpdateBrandVoiceBody): Promise<BrandVoiceDto> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const existing = await this.repo.findDefault(tx);
      if (!existing) throw new NotFoundException("Aún no configuras tu voz de marca.");

      const patch = this.reconcileFormality(body);
      const allowedExpressions = patch.allowedExpressions ?? existing.allowedExpressions;
      const bannedExpressions = patch.bannedExpressions ?? existing.bannedExpressions;
      const resolved = this.resolveConflicts(allowedExpressions, bannedExpressions);

      const updated = await this.repo.updateDefault(tx, {
        ...patch,
        allowedExpressions: resolved.allowedExpressions,
        bannedExpressions: resolved.bannedExpressions,
      });
      return this.toDto(updated);
    });
  }

  // formality y register viven sincronizados en el mismo objeto (doc §4):
  // si el cliente manda formality (slider de Configuración), esa es la
  // posición fina y register se recalcula desde ahí; si solo manda
  // register (single-select del onboarding), se usa su ancla fija.
  // Mandar los dos a la vez no ocurre desde nuestra UI, pero si pasara,
  // formality gana por ser el dato más específico.
  private reconcileFormality(body: UpdateBrandVoiceBody): UpdateBrandVoicePatch {
    if (body.formality !== undefined) {
      return { ...body, register: formalityToRegister(body.formality) };
    }
    if (body.register !== undefined) {
      return { ...body, formality: REGISTER_FORMALITY_ANCHORS[body.register] };
    }
    return body;
  }

  // Prohibido gana (doc §6): un modismo presente en las dos listas se saca
  // de permitidos antes de persistir. No es solo un warning de UI — este
  // dato termina literal dentro del system prompt, así que el servidor lo
  // aplica de verdad.
  private resolveConflicts(
    allowed: string[],
    banned: string[],
  ): { allowedExpressions: string[]; bannedExpressions: string[] } {
    const bannedSet = new Set(banned.map(normalizeExpression));
    return {
      allowedExpressions: allowed.filter((term) => !bannedSet.has(normalizeExpression(term))),
      bannedExpressions: banned,
    };
  }

  private toDto(row: BrandVoiceRow): BrandVoiceDto {
    return {
      id: row.id,
      name: row.name,
      isDefault: row.isDefault,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      ...this.toPromptShape(row),
    };
  }

  private toPromptShape(row: BrandVoiceRow): BrandVoiceForPrompt {
    return {
      marketCountry: row.marketCountry,
      marketRegion: row.marketRegion,
      niche: row.niche,
      audience: row.audience,
      register: row.register,
      formality: row.formality,
      allowedExpressions: row.allowedExpressions,
      bannedExpressions: row.bannedExpressions,
      useAnglicisms: row.useAnglicisms,
      keyTopics: row.keyTopics,
      preferredCtas: row.preferredCtas,
      referenceExamples: row.referenceExamples as BrandVoiceReferenceExample[],
    };
  }
}

// Quita acentos vía descomposición Unicode: "café" y "cafe" cuentan como el
// mismo modismo al comparar permitidos contra prohibidos. Rango expresado
// con \u escapes (no caracteres combinantes literales en el fuente).
const COMBINING_DIACRITICS = /[\u0300-\u036f]/g;

function normalizeExpression(term: string): string {
  return term.trim().toLowerCase().normalize("NFD").replace(COMBINING_DIACRITICS, "");
}
