-- F10.6 PR1: el estilo visual por defecto de las imágenes (Configuración >
-- Estilo visual). Nullable: null = Fotográfico natural, el de siempre. Sin
-- backfill: nadie eligió todavía.
ALTER TABLE "brand_voices" ADD COLUMN "image_style" text;