import { z } from "zod";

// Contratos núcleo de publication_cards (docs/reference/modelo-de-datos.md).
// El backend valida el JSONB `content` con el schema del arquetipo; el
// frontend renderiza la card según el mismo contrato (ADR-005).

export const publicationArchetypeSchema = z.enum(["visual_first", "video_script", "text_first"]);
export type PublicationArchetype = z.infer<typeof publicationArchetypeSchema>;

export const socialNetworkSchema = z.enum([
  "instagram",
  "facebook",
  "tiktok",
  "linkedin",
  "youtube",
  "threads",
  "x",
]);
export type SocialNetwork = z.infer<typeof socialNetworkSchema>;

export const cardStatusSchema = z.enum(["draft", "scheduled", "published", "canceled", "failed"]);
export type CardStatus = z.infer<typeof cardStatusSchema>;

// Contenido por arquetipo. Versión mínima de F0; los campos finos se
// afinan en F3 cuando la tool crear_borrador_publicacion cobre vida.

export const visualFirstContentSchema = z.object({
  archetype: z.literal("visual_first"),
  caption: z.string(),
  hashtags: z.array(z.string()).default([]),
  imagePrompt: z.string().optional(),
  assetIds: z.array(z.uuid()).default([]),
});

export const videoScriptContentSchema = z.object({
  archetype: z.literal("video_script"),
  hook: z.string(),
  script: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()).default([]),
  recordingNotes: z.string().optional(),
});

export const textFirstContentSchema = z.object({
  archetype: z.literal("text_first"),
  body: z.string(),
  hashtags: z.array(z.string()).default([]),
  assetIds: z.array(z.uuid()).default([]),
});

export const cardContentSchema = z.discriminatedUnion("archetype", [
  visualFirstContentSchema,
  videoScriptContentSchema,
  textFirstContentSchema,
]);
export type CardContent = z.infer<typeof cardContentSchema>;

// Input de tool call por arquetipo (ADR-005, F3). NO usamos cardContentSchema
// (discriminatedUnion) como inputSchema de tool: medido contra Gemini 3.5
// Flash, Claude Haiku 4.5 y DeepSeek V4 Flash con keys reales, los 3
// proveedores generan tool calls con input inválido en la mayoría de los
// intentos (docs/reference/suite-cultural/2026-07-22-reporte.md). En vez de
// una tool con schema aplanado + reconciliación posterior, usamos 3 tools
// separadas — una por arquetipo — reusando el schema de contenido tal cual.
// El modelo no llena un objeto con reglas condicionales: elige cuál tool
// llamar, y esa elección es la inferencia del arquetipo. Cada schema solo
// acepta las redes de su arquetipo (más estricto que las 7 redes + decidir
// después) y omite `archetype`/`assetIds`, que el servidor asigna siempre.

export const visualFirstToolInputSchema = visualFirstContentSchema
  .omit({ archetype: true, assetIds: true })
  .extend({ network: z.enum(["instagram", "facebook"]) });
export type VisualFirstToolInput = z.infer<typeof visualFirstToolInputSchema>;

export const videoScriptToolInputSchema = videoScriptContentSchema
  .omit({ archetype: true })
  .extend({ network: z.enum(["tiktok", "youtube"]) });
export type VideoScriptToolInput = z.infer<typeof videoScriptToolInputSchema>;

export const textFirstToolInputSchema = textFirstContentSchema
  .omit({ archetype: true, assetIds: true })
  .extend({ network: z.enum(["linkedin", "threads", "x"]) });
export type TextFirstToolInput = z.infer<typeof textFirstToolInputSchema>;

// parse() aquí es una red de seguridad barata (el shape ya lo garantiza TS),
// no una reconciliación entre esquemas distintos — solo puede fallar si al
// modelo le faltó un campo requerido.
export function buildVisualFirstContent(
  input: VisualFirstToolInput,
): z.infer<typeof visualFirstContentSchema> {
  return visualFirstContentSchema.parse({ ...input, archetype: "visual_first", assetIds: [] });
}

export function buildVideoScriptContent(
  input: VideoScriptToolInput,
): z.infer<typeof videoScriptContentSchema> {
  return videoScriptContentSchema.parse({ ...input, archetype: "video_script" });
}

export function buildTextFirstContent(
  input: TextFirstToolInput,
): z.infer<typeof textFirstContentSchema> {
  return textFirstContentSchema.parse({ ...input, archetype: "text_first", assetIds: [] });
}
