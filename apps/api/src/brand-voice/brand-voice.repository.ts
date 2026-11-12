import { Injectable } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import type {
  BrandVoiceExampleDto,
  BrandVoiceForPrompt,
  BrandVoiceReferenceExample,
  BrandVoiceRegister,
  ModoEstrategia,
} from "@presencia/shared";
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
  vertical: string | null;
  modo: ModoEstrategia | null;
  audience: string | null;
  register: BrandVoiceRegister;
  formality: number;
  allowedExpressions: string[];
  bannedExpressions: string[];
  useAnglicisms: boolean;
  keyTopics: string[];
  preferredCtas: string[];
  referenceExamples: BrandVoiceReferenceExample[];
  // F12.5: «Así escribes» y «Datos fijos de tu marca».
  styleNotes: string[];
  businessFacts: string | null;
  // Configuración › Tendencias (F9.6). Viven en la voz porque son parte de
  // "quién soy y qué me importa", pero las escribe TrendsService, no el PATCH
  // de voz de marca: ver `guardarAjustes`.
  trendPrompt: string | null;
  trendExclude: string | null;
  trendLangs: string[];
  // Escape hatch sin schema propio — ver comentario en
  // packages/shared/src/brand-voice.ts junto a updateBrandVoiceBodySchema.
  extras: Record<string, unknown>;
}>;

// Los campos de `BrandVoiceForPrompt`: los que cambian cómo escribe el chat.
// Un Record sobre sus llaves, y no una lista: un campo nuevo del prompt que
// falte aquí no compila (revisión del PR7).
const SUENAN: Record<keyof BrandVoiceForPrompt, true> = {
  marketCountry: true,
  marketRegion: true,
  niche: true,
  audience: true,
  register: true,
  formality: true,
  allowedExpressions: true,
  bannedExpressions: true,
  useAnglicisms: true,
  keyTopics: true,
  preferredCtas: true,
  referenceExamples: true,
  styleNotes: true,
  businessFacts: true,
};
export const CAMPOS_QUE_SUENAN = Object.keys(SUENAN) as (keyof BrandVoiceForPrompt)[];

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
  // `audience` usa COALESCE en vez de sobrescribir directo: el paso "Voz"
  // del onboarding nunca captura audience (lo pide Configuración después,
  // "lo que el onboarding no pedía por tiempo") — sin el COALESCE, reenviar
  // el PUT (doble-click) borraría en silencio lo que el usuario ya guardó
  // ahí. `marketRegion` sí se sobrescribe directo: el onboarding SÍ lo
  // captura, así que un reenvío es una actualización legítima.
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
          audience: sql`coalesce(excluded.audience, ${brandVoices.audience})`,
          register: input.register,
          formality: input.formality,
          updatedAt: sql`now()`,
        },
      })
      .returning();
    if (!row) throw new Error("No se pudo guardar la voz de marca");
    return row;
  }

  /**
   * F12.5: el último "Ver ejemplo de tu voz". NO toca `updated_at`: generar un
   * ejemplo no es editar la voz, y así la pantalla puede comparar
   * `generatedAt` contra `updatedAt` para avisar que la voz cambió después.
   */
  async saveLastExample(tx: Tx, example: BrandVoiceExampleDto): Promise<void> {
    await tx
      .update(brandVoices)
      .set({ lastVoiceExample: example })
      .where(eq(brandVoices.isDefault, true));
  }

  /**
   * `updated_at` se mueve solo si `suena`: si cambió el VALOR de algo que viaja
   * al prompt (lo decide el servicio contra la fila de antes). Es lo que la
   * pantalla compara contra el último ejemplo para decir "Tu voz cambió". Los
   * ajustes de Tendencias, el estilo de imagen, el nombre, `extras` o un
   * autoguardado que reenvía lo mismo no cambian cómo escribe, y movían el
   * aviso en falso (revisión de la fase y del PR7).
   */
  async updateDefault(
    tx: Tx,
    patch: UpdateBrandVoicePatch,
    opciones: { suena: boolean },
  ): Promise<BrandVoiceRow> {
    const set = omitUndefined(patch);
    // Sin nada que escribir (un PATCH `{}`), un UPDATE sin SET no es SQL.
    if (!opciones.suena && Object.keys(set).length === 0) {
      const actual = await this.findDefault(tx);
      if (!actual) throw new Error("No se pudo actualizar la voz de marca");
      return actual;
    }
    const [row] = await tx
      .update(brandVoices)
      .set(opciones.suena ? { ...set, updatedAt: sql`now()` } : set)
      .where(eq(brandVoices.isDefault, true))
      .returning();
    if (!row) throw new Error("No se pudo actualizar la voz de marca");
    return row;
  }
}
