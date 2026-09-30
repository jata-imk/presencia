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
 * Una versión del texto: la card sin `assetIds` ni `slides` (F10.6: los
 * slides son imágenes y su orden, no texto; restaurar no los toca). Distributivo a propósito:
 * `Omit` sobre la unión perdería los campos propios de cada arquetipo.
 */
export type CardVersionContent = CardContent extends infer C
  ? C extends CardContent
    ? Omit<C, "assetIds" | "slides">
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

/** Lo que devuelven editar, restaurar y el cambio por IA: la card al día y en qué versión quedó. */
export interface CardContentChangeDto {
  card: PublicationCardDto;
  version: CardVersionDto;
  /**
   * Si esta escritura cambió el texto. `false` cuando lo que llegó es igual a
   * lo que ya había (la IA lo dejó igual, un autoguardado sin cambios): en ese
   * caso `version` es la que ya existía. Si es `true`, la anterior es
   * `version.n - 1`: los números son consecutivos por card.
   */
  changed: boolean;
}

// ── F10.5 PR4: pedirle un cambio a la IA sobre la card ─────────────────

/** "Hazlo más corto": la instrucción que se le da a la IA sobre esta card. */
export const rewriteCardBodySchema = z.object({
  instruction: z.string().trim().min(2).max(500),
});
export type RewriteCardBody = z.infer<typeof rewriteCardBodySchema>;

/**
 * Los atajos del campo "Pide un cambio a este borrador" (rd-panel.jsx →
 * AskBar). La etiqueta es lo que se ve; la instrucción, lo que se le pide.
 */
export const CARD_REWRITE_SUGGESTIONS = [
  { label: "Más corto", instruction: "Hazlo más corto, sin perder la idea principal." },
  { label: "Más formal", instruction: "Hazlo más formal, sin perder la cercanía." },
  { label: "Otro CTA", instruction: "Cambia el llamado a la acción del final por otro." },
  { label: "Más emojis", instruction: "Agrega algunos emojis donde sumen, sin exagerar." },
  { label: "Sin emojis", instruction: "Quita todos los emojis." },
] as const;

/**
 * "Recortar con IA" del aviso de texto excedido: la instrucción con el
 * límite de la red dentro, para que el modelo sepa a cuánto llegar.
 */
export function trimToLimitInstruction(limit: number): string {
  return `Recórtalo para que el texto completo, con hashtags, quepa en ${String(limit)} caracteres, sin perder la idea principal.`;
}
