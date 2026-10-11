-- F10.8.1: el resumen de un chat largo pasa a bloques que se agregan, uno por
-- compactación (ADR-006, addendum F10.8.1). El resumen que ya existía se
-- vuelve el bloque 1, con el corte y el modelo que tenía. La columna vieja se
-- quita en 0051, después de que esta copia corrió.
ALTER TABLE "chat_summaries" ADD COLUMN "blocks" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "chat_summaries"
SET "blocks" = jsonb_build_array(
  jsonb_build_object(
    'summary', "summary",
    'throughMessageId', "through_message_id",
    'throughCreatedAt', "through_created_at",
    'model', "model",
    'createdAt', "updated_at"
  )
);
