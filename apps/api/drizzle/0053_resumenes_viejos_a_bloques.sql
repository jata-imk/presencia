-- F10.8.4: antes de que la app deje de leer `chat_summaries.summary`, lo que
-- solo vivía ahí pasa a `blocks`. Es lo mismo que hacía en lectura el
-- respaldo de `blocksOf`, que se quita en este release:
--
-- 1. Fila sin bloques con `summary`: la app de antes de F10.8.1 la insertó
--    durante el deploy de 0050. Su resumen es el bloque 1.
-- 2. Fila cuyo último bloque no llega al corte de la fila: la app vieja movió
--    el corte y escribió solo `summary`. Ese resumen cubre el tramo nuevo y
--    entra como un bloque más.
--
-- Sin esto, esos resúmenes se perderían: la compactación seguiría después
-- del corte de la fila, y nada cubriría el tramo de antes. La columna se
-- queda (nullable) hasta la migración del release siguiente. Corre como el
-- rol owner, que es superusuario, así que el FORCE RLS no lo filtra.
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
WHERE "summary" IS NOT NULL
  AND jsonb_array_length("blocks") = 0;--> statement-breakpoint
UPDATE "chat_summaries"
SET "blocks" = "blocks" || jsonb_build_array(
  jsonb_build_object(
    'summary', "summary",
    'throughMessageId', "through_message_id",
    'throughCreatedAt', "through_created_at",
    'model', "model",
    'createdAt', "updated_at"
  )
)
WHERE "summary" IS NOT NULL
  AND jsonb_array_length("blocks") > 0
  AND "blocks"->-1->>'throughMessageId' IS DISTINCT FROM "through_message_id"::text;
