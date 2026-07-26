import type { ToolUIPart, UIMessage } from "ai";
import type { CardArchetypeToolName, CardToolOutput } from "@presencia/shared";

// Tipado explícito en vez de InferUITools: las tools del backend no
// declaran outputSchema Zod (el execute() retorna un objeto plano), así
// que InferUITools no podría inferir `content`. CardArchetypeToolName se
// deriva de CARD_ARCHETYPE_TOOLS en @presencia/shared, no se duplica aquí.
export type CardArchetypeUITools = {
  [K in CardArchetypeToolName]: { input: unknown; output: CardToolOutput };
};

export type ChatUIMessage = UIMessage<never, never, CardArchetypeUITools>;
export type CardToolPart = ToolUIPart<CardArchetypeUITools>;
