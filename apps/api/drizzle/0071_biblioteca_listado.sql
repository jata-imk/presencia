ALTER TABLE "image_generations" ADD COLUMN "description" text;--> statement-breakpoint
CREATE INDEX "assets_library" ON "assets" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "assets_by_card" ON "assets" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "image_generations_asset" ON "image_generations" USING btree ("asset_id");--> statement-breakpoint
-- A mano (drizzle-kit no genera datos): lo que pidió el creator, recortado del
-- prompt compuesto de las filas que ya existen. Solo las que siguen el formato
-- de F10.6 ("Qué se ve: …", ver image-prompt.ts): la descripción termina donde
-- empieza el nicho o el encuadre, que son las dos cosas que pueden seguirla.
-- Las anteriores se quedan en null y Biblioteca cae a su prompt completo.
UPDATE "image_generations"
SET "description" = substring(
  "prompt" from E'Qué se ve: (.*?)\n\n(?:Es para una publicación de un creador|Encuadre completo:)'
)
WHERE "kind" = 'generate'
  AND "description" IS NULL
  AND "prompt" LIKE '%Qué se ve: %';
