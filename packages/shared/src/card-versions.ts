import { z } from "zod";
import type { CardContent, PublicationCardDto } from "./publication.js";

// F10.5: editar a mano el texto de una card y su historial de versiones.
// La imagen tiene su propio historial (images.ts): una versión de texto no
// guarda ni restaura `assetIds`.

/**
 * Los campos de texto que se pueden editar. Llegan sueltos (solo lo que
 * cambió) y la API los fusiona con la card; los que no son del arquetipo
 * (`body` en un post visual) se descartan al validar contra su schema.
 */
export const cardTextFieldsSchema = z
  .object({
    caption: z.string().max(63206),
    body: z.string().max(63206),
    hook: z.string().max(2000),
    script: z.string().max(20000),
    hashtags: z.array(z.string().trim().min(1).max(100)).max(30),
    recordingNotes: z.string().max(5000),
    imagePrompt: z.string().max(2000),
  })
  .partial()
  .strict();
export type CardTextFields = z.infer<typeof cardTextFieldsSchema>;

export const updateCardContentBodySchema = z.object({
  fields: cardTextFieldsSchema,
  /**
   * La sesión de edición del navegador. Mientras sea la misma (y no pasen
   * CARD_EDIT_SESSION_IDLE_MS sin guardar), los autoguardados actualizan la
   * misma versión en vez de crear una por cada pausa al escribir.
   */
  editSessionId: z.uuid(),
});
export type UpdateCardContentBody = z.infer<typeof updateCardContentBodySchema>;

/** Sin guardar por más de esto, la siguiente edición abre una versión nueva. */
export const CARD_EDIT_SESSION_IDLE_MS = 10 * 60 * 1000;

export const cardVersionParamSchema = z.object({
  id: z.uuid(),
  n: z.coerce.number().int().min(1),
});

export type CardVersionSource = "chat" | "manual" | "ai" | "restore";

/**
 * Una versión del texto: la card sin `assetIds`. Distributivo a propósito:
 * `Omit` sobre la unión perdería los campos propios de cada arquetipo.
 */
export type CardVersionContent = CardContent extends infer C
  ? C extends CardContent
    ? Omit<C, "assetIds">
    : never
  : never;

export interface CardVersionDto {
  n: number;
  source: CardVersionSource;
  /** Solo las de la IA: lo que se pidió. */
  instruction: string | null;
  /** Solo los restores: qué número se restauró. */
  restoredFrom: number | null;
  content: CardVersionContent;
  createdAt: string;
  updatedAt: string;
}

/** Lo que devuelven editar y restaurar: la card al día y en qué versión quedó. */
export interface CardContentChangeDto {
  card: PublicationCardDto;
  version: CardVersionDto;
}
