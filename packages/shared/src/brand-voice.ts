import { z } from "zod";

// Contratos de brand_voices (docs/reference/modelo-de-datos.md,
// docs/explanation/product/presencia-configuracion-voz-de-marca.md).
// Onboarding (paso "Voz") y Configuración > Voz de marca escriben el
// MISMO objeto — una sola fuente de verdad (AGENTS.md regla dura #5).

export const brandVoiceRegisterSchema = z.enum([
  "neutro_profesional",
  "informal",
  "de_barrio",
  "tecnico",
  "profesional",
]);
export type BrandVoiceRegister = z.infer<typeof brandVoiceRegisterSchema>;

// Anclas del slider de formalidad 0-100 (doc §4): el single-select
// categórico del onboarding no es un sistema aparte del slider de
// Configuración, es un click que suelta el pin en una de estas
// posiciones. formalityToRegister() hace el camino inverso.
export const REGISTER_FORMALITY_ANCHORS: Record<BrandVoiceRegister, number> = {
  de_barrio: 15,
  informal: 35,
  neutro_profesional: 55,
  profesional: 75,
  tecnico: 90,
};

// Zonas nombradas del slider de formalidad 0-100 (doc §4), mismas 5
// posiciones que REGISTER_FORMALITY_ANCHORS pero como rangos con límite
// superior en vez de puntos únicos. Única fuente de verdad: vive en shared
// porque tanto la UI (FormalitySlider, qué zona le muestra al usuario)
// como el system prompt (chat/system-prompt.ts, qué registro recibe el
// modelo) tienen que coincidir para el mismo valor — antes de este fix
// cada uno tenía su propia tabla, desincronizadas.
export const FORMALITY_ZONES: ReadonlyArray<{ max: number; label: string }> = [
  { max: 24, label: "De barrio" },
  { max: 44, label: "Casual" },
  { max: 64, label: "Neutro-profesional" },
  { max: 84, label: "Profesional" },
  { max: 100, label: "Técnico/formal" },
];

export function formalityZoneLabel(formality: number): string {
  return FORMALITY_ZONES.find((zone) => formality <= zone.max)?.label ?? "Neutro-profesional";
}

export function formalityToRegister(formality: number): BrandVoiceRegister {
  let closest: BrandVoiceRegister = "neutro_profesional";
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const [register, anchor] of Object.entries(REGISTER_FORMALITY_ANCHORS) as Array<
    [BrandVoiceRegister, number]
  >) {
    const distance = Math.abs(anchor - formality);
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = register;
    }
  }
  return closest;
}

// Ejemplo de referencia (doc §2 Bloque D): hasta 2, pegados como texto en
// F4. sourceCardId queda sin poblar hasta que exista Biblioteca — el
// selector lo llenará sin migrar nada.
export const brandVoiceReferenceExampleSchema = z.object({
  text: z.string().trim().min(1).max(1200),
  sourceCardId: z.uuid().optional(),
});
export type BrandVoiceReferenceExample = z.infer<typeof brandVoiceReferenceExampleSchema>;

// Topes de tamaño: cada campo de Voz de marca viaja en el system prompt de
// CADA generación (ver chat/system-prompt.ts). Sin tope, un usuario se
// dispara su propio costo por mensaje y puede empujar el prompt fuera de
// la ventana de contexto.
const shortTag = z.string().trim().min(1).max(40);
const ctaTag = z.string().trim().min(1).max(80);
const tagList = (maxItems: number) => z.array(shortTag).max(maxItems);

export const createBrandVoiceBodySchema = z.object({
  // Los 3 campos obligatorios del onboarding paso "Voz" (doc §1): mercado,
  // nicho/audiencia, registro. audience es la profundización que llega
  // después en Configuración, no la del onboarding rápido.
  marketCountry: z.string().trim().min(2).max(56).default("MX"),
  marketRegion: z.string().trim().min(1).max(80).optional(),
  niche: tagList(20).min(1),
  audience: z.string().trim().min(1).max(500).optional(),
  register: brandVoiceRegisterSchema.default("neutro_profesional"),
});
export type CreateBrandVoiceBody = z.infer<typeof createBrandVoiceBodySchema>;

// PATCH parcial — Configuración > Voz de marca (doc §2, bloques A-D).
export const updateBrandVoiceBodySchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  marketCountry: z.string().trim().min(2).max(56).optional(),
  // nullable, a diferencia de create: Configuración necesita poder borrar
  // un campo ya guardado, no solo dejarlo intacto. `undefined` = "no
  // tocar" (omitido del PATCH), `null` = "borrar" — ver
  // voz-de-marca.tsx::handleSave.
  marketRegion: z.string().trim().min(1).max(80).nullable().optional(),
  niche: tagList(20).min(1).optional(),
  audience: z.string().trim().max(500).nullable().optional(),
  register: brandVoiceRegisterSchema.optional(),
  formality: z.number().int().min(0).max(100).optional(),
  allowedExpressions: tagList(20).optional(),
  bannedExpressions: tagList(20).optional(),
  useAnglicisms: z.boolean().optional(),
  keyTopics: tagList(20).optional(),
  preferredCtas: z.array(ctaTag).max(20).optional(),
  referenceExamples: z.array(brandVoiceReferenceExampleSchema).max(2).optional(),
  // Escape hatch sin schema propio (modelo-de-datos.md: "lo que el
  // onboarding aprenda después sin migrar"). V1: reemplazo total del
  // objeto al persistir, no merge — el único escritor hoy es el paso
  // "Goals" del onboarding (extras.goals). Nunca llega al system prompt
  // (buildSystemPrompt no lo lee).
  extras: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateBrandVoiceBody = z.infer<typeof updateBrandVoiceBodySchema>;

export interface BrandVoiceDto {
  id: string;
  name: string;
  isDefault: boolean;
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
  createdAt: string;
  updatedAt: string;
}

// Shape plano que consume chat/system-prompt.ts y la suite cultural
// (scripts/cultural-suite/run.ts) para ensamblar el prompt — nunca la fila
// de Drizzle, para que ese módulo siga sin depender de Nest/DB.
export type BrandVoiceForPrompt = Omit<
  BrandVoiceDto,
  "id" | "name" | "isDefault" | "createdAt" | "updatedAt"
>;

// Quita acentos vía descomposición Unicode: "café" y "cafe" cuentan como el
// mismo modismo. Vive en shared (no en brand-voice.service.ts) porque dos
// consumidores sin relación de dependencia la necesitan: el service
// (prohibido gana sobre permitido) y scripts/cultural-suite/prohibited-word.ts
// (cuenta ocurrencias del modismo prohibido en las generaciones de prueba)
// — este último no puede importar de apps/api/src sin arrastrar Nest.
const COMBINING_DIACRITICS = /[\u0300-\u036f]/g;

export function normalizeExpression(term: string): string {
  return term.trim().toLowerCase().normalize("NFD").replace(COMBINING_DIACRITICS, "");
}
