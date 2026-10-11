-- F10.8.1: el resumen de un chat largo pasa a bloques que se agregan, uno por
-- compactación (ADR-006, addendum F10.8.1). Expand/contract: esta migración
-- solo AGREGA `blocks` y copia ahí el resumen que ya existía (bloque 1);
-- `summary` queda opcional para que la app nueva no la escriba, y la vieja
-- (que sigue corriendo hasta que se reinicia el contenedor) no truene. La
-- columna se borra en un release posterior.
ALTER TABLE "chat_summaries" ALTER COLUMN "summary" DROP NOT NULL;--> statement-breakpoint
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
)
WHERE "summary" IS NOT NULL;
