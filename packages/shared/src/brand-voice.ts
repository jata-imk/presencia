import { z } from "zod";
import { normalizeExpression } from "./text.js";
import { verticalIdSchema, type VerticalId } from "./verticals.js";

// Contratos de brand_voices (docs/reference/modelo-de-datos.md,
// docs/explanation/product/presencia-configuracion-voz-de-marca.md).
// Onboarding (paso "Voz") y Configuración > Voz de marca escriben el
// MISMO objeto — una sola fuente de verdad (AGENTS.md regla dura #5).

/**
 * El objetivo activo del creator: el "Modo" de la cabecera de Ritmo.
 *
 * Existe porque amarra lo demás. Una cadencia de "3 por semana" sin un
 * para-qué es un número arbitrario; atada a un objetivo, es una sugerencia con
 * sentido (presencia-ritmo.md §3).
 *
 * Y por eso mismo **cambia cosas, no solo se muestra**: mueve la meta semanal
 * sugerida (ritmo.ts) y entra al payload de la narración. Un chip que no
 * cambiara nada sería decoración aparentando importar.
 */
export const MODOS_ESTRATEGIA = ["crecer", "mantener", "lanzar"] as const;
export const modoEstrategiaSchema = z.enum(MODOS_ESTRATEGIA);
export type ModoEstrategia = z.infer<typeof modoEstrategiaSchema>;

/** Cómo se le muestra cada modo. El emoji sale del mock de Claude Design. */
export const MODO_ESTRATEGIA_META: Record<
  ModoEstrategia,
  { label: string; emoji: string; ayuda: string }
> = {
  crecer: {
    label: "Crecer",
    emoji: "🚀",
    ayuda: "Sumar audiencia. Te vamos a sugerir publicar más seguido.",
  },
  mantener: {
    label: "Mantener",
    // ⚖️ y no 🔁: el de las flechas se lee como un icono de interfaz, sobre
    // todo al lado del lápiz de "editar".
    emoji: "⚖️",
    ayuda: "Sostener lo que ya tienes, sin exigirte de más.",
  },
  lanzar: {
    label: "Lanzar algo",
    emoji: "📣",
    ayuda: "Hay algo concreto que anunciar. Más volumen, concentrado en un tema.",
  },
};

/** El modo por defecto de quien todavía no eligió ni contestó nada. */
export const MODO_ESTRATEGIA_FALLBACK: ModoEstrategia = "mantener";

// Las palabras que delatan una intención de crecimiento en lo que el usuario
// contestó en el paso de metas del onboarding. Se comparan normalizadas
// (sin acentos, minúsculas) y por inclusión, no por palabra completa: acá lo
// que entra es texto libre además de los presets, y "conseguir más clientes"
// tiene que encontrar a "cliente".
const PALABRAS_DE_CRECER = ["seguidor", "audiencia", "venta", "client", "crecer", "alcance"];

/**
 * Deriva el Modo de lo que el usuario ya contestó en el onboarding.
 *
 * El paso de metas guarda un multiselect de frases en `extras.goals`, que
 * hasta ahora era dato muerto: se escribía una vez y no lo leía nadie. En vez
 * de agregarle un paso al onboarding, el Modo nace de ahí y el usuario lo
 * confirma o lo cambia — mismo truco que nicho → vertical.
 *
 * **`lanzar` no se deriva nunca.** Ninguna de las metas del onboarding
 * significa "tengo un lanzamiento": es una decisión puntual que el usuario
 * toma cuando le pasa, no algo que se adivine.
 *
 * Un empate se resuelve hacia `crecer` a propósito: si alguien que quería
 * crecer ve una meta baja, la sugerencia le pasa desapercibida; al revés, una
 * meta alta se baja con un click y además se muestra marcada como "Sugerido".
 */
export function modoDeGoals(goals: readonly string[]): ModoEstrategia {
  const texto = normalizeExpression(goals.join(" "));
  if (!texto) return MODO_ESTRATEGIA_FALLBACK;
  return PALABRAS_DE_CRECER.some((palabra) => texto.includes(palabra))
    ? "crecer"
    : MODO_ESTRATEGIA_FALLBACK;
}

/**
 * Las metas del onboarding, sacadas del escape hatch con cuidado.
 *
 * `extras` es jsonb sin schema: el motor no garantiza su forma, así que lo que
 * no sea una lista de strings simplemente no está. Mismo criterio que
 * `parseItems` en la caché de tendencias.
 */
export function goalsDeExtras(extras: unknown): string[] {
  if (typeof extras !== "object" || extras === null) return [];
  const goals = (extras as Record<string, unknown>).goals;
  if (!Array.isArray(goals)) return [];
  return goals.filter((g): g is string => typeof g === "string");
}

/**
 * El Modo que de verdad aplica: el elegido, o el derivado si no eligió.
 *
 * Una sola función para que el servidor y la pantalla no puedan discrepar —
 * mismo patrón que `resolveVertical`. Si la UI derivara por su cuenta, podría
 * mostrarle al usuario un Modo y calcularle la meta con otro.
 */
export function modoEfectivo(modo: ModoEstrategia | null, extras: unknown): ModoEstrategia {
  return modo ?? modoDeGoals(goalsDeExtras(extras));
}

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
  // `null` = "vuelve a derivarla de mi nicho", no "no tengo vertical". Es la
  // única forma que tiene el usuario de deshacer una elección manual y volver
  // al default automático.
  vertical: verticalIdSchema.nullable().optional(),
  // `null` = "vuelve a derivarlo de mis metas", igual que `vertical`. Es cómo
  // el usuario deshace una elección manual sin que le inventemos un default.
  modo: modoEstrategiaSchema.nullable().optional(),
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
  /**
   * La vertical que el usuario ELIGIÓ, o `null` si nunca la tocó. No es la
   * efectiva: para esa se llama a `resolveVertical(vertical, niche)`, que es
   * la misma función que usa el servidor al armar la llave de caché. Exponer
   * la cruda y no la resuelta es lo que le permite a la UI decir "esto lo
   * adivinamos por tu nicho" en vez de presentarlo como una decisión del
   * usuario que nunca tomó.
   */
  vertical: VerticalId | null;
  /**
   * El Modo que el usuario ELIGIÓ, o `null` si nunca lo tocó. Igual que
   * `vertical`, no es el efectivo: ese sale de `modoDeGoals(extras.goals)`
   * cuando este viene en null, y la pantalla usa la distinción para decir
   * "esto lo dedujimos de tus metas" en vez de presentarlo como una decisión
   * que el usuario no tomó.
   */
  modo: ModoEstrategia | null;
  /**
   * El Modo que saldría de sus metas si no eligiera ninguno.
   *
   * Lo calcula el SERVIDOR con la misma función que usa para la meta semanal.
   * La pantalla necesita este valor para poder decir "por tus metas asumimos
   * X", y derivarlo por su cuenta pediría exponer `extras` entero — además de
   * abrir la puerta a que muestre un Modo y el backend calcule con otro, que
   * es justo lo que el comentario de `vertical` advierte.
   */
  modoDerivado: ModoEstrategia;
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
//
// `vertical` queda fuera a propósito, aunque sea un campo de identidad: es un
// cubo grueso para compartir caché entre usuarios, y el prompt ya recibe
// `niche`, que es el texto que el usuario escribió y lo que hace que su
// contenido suene a él. Meter "design" junto a "Diseño & IA para creators de
// Mérida" no agrega información y sí invita al modelo a escribir para la
// categoría en vez de para la persona.
//
// `modo` también queda fuera, y por un motivo distinto: no es identidad de
// voz, es una preferencia de estrategia. Lo que hace es mover la meta semanal
// sugerida y entrar al payload de la narración; que además tiña cómo escribe
// el chat es una decisión aparte que nadie tomó todavía.
export type BrandVoiceForPrompt = Omit<
  BrandVoiceDto,
  "id" | "name" | "isDefault" | "createdAt" | "updatedAt" | "vertical" | "modo" | "modoDerivado"
>;
