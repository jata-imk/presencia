-- F10.6 PR3: el slide del carrusel al que va cada imagen pedida. Nullable:
-- null = la imagen suelta de siempre. Sin FK (los slides viven en el JSONB
-- de la card) y sin backfill: ninguna imagen anterior es de un carrusel.
ALTER TABLE "image_generations" ADD COLUMN "slide_id" uuid;
