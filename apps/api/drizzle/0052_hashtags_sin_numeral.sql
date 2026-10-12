-- F10.8.4: los hashtags se guardan sin "#" (normalizeHashtags, packages/shared
-- publication.ts). Antes, la tool del chat guardaba lo que mandaba el modelo
-- ("#tacos") y la card salía "##tacos". Esta migración limpia con la misma
-- regla lo que ya estaba guardado, para que leer una card vieja no la cambie:
-- si no, cada parse del schema nuevo la vería distinta y abriría versiones de
-- texto que nadie editó.
--
-- La regla: un "#" o una coma separan etiquetas; dentro de cada una se quitan
-- los espacios; las vacías se descartan. El orden se conserva.
--
-- Solo datos, sin cambio de forma: la app vieja que sigue corriendo hasta el
-- reinicio lee y escribe igual (y buildPostText normaliza al publicar, por si
-- guarda alguna con "#" en esa ventana). Corre como el rol owner, que en
-- este stack es superusuario, así que el FORCE RLS de las dos tablas no lo
-- filtra. No toca `updated_at`: la reconciliación lo usa para detectar
-- huérfanas.
CREATE FUNCTION pg_temp.normalizar_hashtags(tags jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(jsonb_agg(limpia ORDER BY i, j), '[]'::jsonb)
  FROM (
    SELECT t.i, p.j, regexp_replace(p.parte, '[[:space:]]+', '', 'g') AS limpia
    FROM jsonb_array_elements_text(tags) WITH ORDINALITY AS t(tag, i)
    CROSS JOIN LATERAL regexp_split_to_table(t.tag, '[#,]') WITH ORDINALITY AS p(parte, j)
  ) partes
  WHERE limpia <> ''
$$;--> statement-breakpoint
UPDATE "publication_cards"
SET "content" = jsonb_set("content", '{hashtags}', pg_temp.normalizar_hashtags("content"->'hashtags'))
WHERE jsonb_typeof("content"->'hashtags') = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements_text("content"->'hashtags') AS t(tag)
    WHERE t.tag ~ '[#,[:space:]]' OR t.tag = ''
  );--> statement-breakpoint
UPDATE "card_versions"
SET "content" = jsonb_set("content", '{hashtags}', pg_temp.normalizar_hashtags("content"->'hashtags'))
WHERE jsonb_typeof("content"->'hashtags') = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements_text("content"->'hashtags') AS t(tag)
    WHERE t.tag ~ '[#,[:space:]]' OR t.tag = ''
  );
