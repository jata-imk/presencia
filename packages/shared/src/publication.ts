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
