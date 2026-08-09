import { Injectable } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import type { BrandVoiceReferenceExample, BrandVoiceRegister } from "@presencia/shared";
import { brandVoices } from "../db/schema.js";
import type { Tx } from "../db/db.service.js";
import { omitUndefined } from "../db/omit-undefined.js";

// Todo acceso a brand_voices vive aquí (patrón de ChatRepository). Las
// queries no filtran por user_id: el RLS de la transacción es el filtro —
// filtrar solo por is_default alcanza porque un tenant nunca ve la fila de
// otro (docs/reference/modelo-de-datos.md, ADR-003).
//
// F4 solo trabaja con la voz default (una por usuario, índice único
// parcial en el schema). Voz por carpeta (folders.brand_voice_id) es V2.

export type BrandVoiceRow = typeof brandVoices.$inferSelect;

export interface InsertDefaultBrandVoiceInput {
  userId: string;
  name: string;
  marketCountry: string;
  marketRegion: string | null;
  niche: string[];
  audience: string | null;
  register: BrandVoiceRegister;
  formality: number;
}

export type UpdateBrandVoicePatch = Partial<{
  name: string;
  marketCountry: string;
  marketRegion: string | null;
  niche: string[];
  audience: string | null;
  register: BrandVoiceRegister;
  formality: number;
  allowedExpressions: string[];
  bannedExpressions: string[];
  useAnglicisms: boolean;
  keyTopics: string[];
  preferredCtas: string[];
  referenceExamples: BrandVoiceReferenceExample[];
  // Escape hatch sin schema propio — ver comentario en
  // packages/shared/src/brand-voice.ts junto a updateBrandVoiceBodySchema.
  extras: Record<string, unknown>;
}>;

@Injectable()
export class BrandVoiceRepository {
  async findDefault(tx: Tx): Promise<BrandVoiceRow | undefined> {
    const [row] = await tx.select().from(brandVoices).where(eq(brandVoices.isDefault, true));
    return row;
  }

  // UPSERT atómico en una sola sentencia (hallazgo del code review de
  // PR 1): find-then-insert dejaba una ventana de carrera entre dos PUT
  // concurrentes (doble-click en el paso "Voz" del onboarding) — el
  // segundo insert chocaba contra el índice único parcial con un error
  // crudo de Postgres. `targetWhere` replica el predicado de ese índice
  // (`WHERE is_default`) para que Postgres pueda inferir el conflicto.
  // `name` queda fuera del `set`: si el usuario ya renombró su voz desde
  // Configuración, reenviar el paso "Voz" no debe resetearla a "Mi voz".
  async upsertDefault(tx: Tx, input: InsertDefaultBrandVoiceInput): Promise<BrandVoiceRow> {
    const [row] = await tx
      .insert(brandVoices)
      .values({ ...input, isDefault: true })
      .onConflictDoUpdate({
        target: brandVoices.userId,
        targetWhere: sql`${brandVoices.isDefault}`,
        set: {
          marketCountry: input.marketCountry,
          marketRegion: input.marketRegion,
          niche: input.niche,
          audience: input.audience,
          register: input.register,
          formality: input.formality,
          updatedAt: sql`now()`,
        },
      })
      .returning();
    if (!row) throw new Error("No se pudo guardar la voz de marca");
    return row;
  }

  async updateDefault(tx: Tx, patch: UpdateBrandVoicePatch): Promise<BrandVoiceRow> {
    const set = omitUndefined(patch);
    const [row] = await tx
      .update(brandVoices)
      .set({ ...set, updatedAt: sql`now()` })
      .where(eq(brandVoices.isDefault, true))
      .returning();
    if (!row) throw new Error("No se pudo actualizar la voz de marca");
    return row;
  }
}
