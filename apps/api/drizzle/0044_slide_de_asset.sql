-- F10.6.1: el slide del carrusel de cada imagen, para que las versiones de un
-- slide sean solo las suyas (antes la tira mostraba TODAS las de la card).
-- Nullable y sin FK: los slides viven en el JSONB de la card. Null = no se
-- supo: cuenta como de la portada (en una imagen suelta, su único slide).
ALTER TABLE "assets" ADD COLUMN "slide_id" uuid;--> statement-breakpoint

-- Backfill, de lo más seguro a lo más inferido:
-- 1. Lo generado: su fila de generación ya dice a qué slide iba (F10.6 PR3).
UPDATE "assets" a SET "slide_id" = ig."slide_id"
FROM "image_generations" ig
WHERE ig."asset_id" = a."id" AND ig."slide_id" IS NOT NULL;--> statement-breakpoint

-- 2. Lo que hoy está puesto en un slide (cubre las subidas a un carrusel).
UPDATE "assets" a SET "slide_id" = (s->>'id')::uuid
-- El CASE va DENTRO de jsonb_array_elements: un `slides` que no sea arreglo
-- (null en JSON) la haría fallar antes de que el WHERE lo descarte.
FROM "publication_cards" c,
  jsonb_array_elements(
    CASE WHEN jsonb_typeof(c."content"->'slides') = 'array' THEN c."content"->'slides' END
  ) s
WHERE a."card_id" = c."id"
  AND a."slide_id" IS NULL
  AND s->>'assetId' = a."id"::text;--> statement-breakpoint

-- 3. Recortes y originales comparten slide: la original hereda el de su
-- recorte, y un recorte el de su original.
UPDATE "assets" o SET "slide_id" = cr."slide_id"
FROM "assets" cr
WHERE cr."metadata"->>'croppedFrom' = o."id"::text
  AND o."slide_id" IS NULL
  AND cr."slide_id" IS NOT NULL;--> statement-breakpoint
UPDATE "assets" cr SET "slide_id" = o."slide_id"
FROM "assets" o
WHERE cr."metadata"->>'croppedFrom' = o."id"::text
  AND cr."slide_id" IS NULL
  AND o."slide_id" IS NOT NULL;
