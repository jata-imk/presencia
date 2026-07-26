import type { ToolUIPart, UIMessage } from "ai";
import type { CardToolOutput } from "@presencia/shared";

// Las 3 tools de crear borrador (ADR-005) — el nombre debe coincidir con
// CARD_ARCHETYPE_TOOLS de @presencia/shared. Tipado explícito en vez de
// InferUITools: las tools del backend no declaran outputSchema Zod (el
// execute() retorna un objeto plano), así que InferUITools no podría
// inferir `content`.
type CardArchetypeToolName =
  "crear_borrador_visual" | "crear_borrador_video" | "crear_borrador_texto";

export type CardArchetypeUITools = {
  [K in CardArchetypeToolName]: { input: unknown; output: CardToolOutput };
};

export type ChatUIMessage = UIMessage<never, never, CardArchetypeUITools>;
export type CardToolPart = ToolUIPart<CardArchetypeUITools>;
