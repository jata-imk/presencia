-- F10.8.4: los hashtags se guardan sin "#" (normalizeHashtags, packages/shared
-- publication.ts). Antes, la tool del chat guardaba lo que mandaba el modelo
-- ("#tacos") y la card salía "##tacos". Esta migración limpia con la misma
-- regla lo que ya estaba guardado, para que leer una card vieja no la cambie:
-- si no, cada parse del schema nuevo la vería distinta y abriría versiones de
-- texto que nadie editó.
--
-- La regla, igual que en JS: un "#" o una coma separan etiquetas; dentro de
-- cada una se quitan los espacios (la misma lista que `\s` de JS, escrita a
-- mano: [[:space:]] depende del locale de la base); las vacías y las
-- repetidas se descartan. El orden se conserva (la primera aparición).
--
-- Solo datos, sin cambio de forma: la app vieja que sigue corriendo hasta el
-- reinicio lee y escribe igual (y buildPostText normaliza al publicar, por si
-- guarda alguna con "#" en esa ventana). Corre como el rol owner, que en
-- este stack es superusuario, así que el FORCE RLS de las dos tablas no lo
-- filtra. No toca `updated_at`: la reconciliación lo usa para detectar
-- huérfanas.
CREATE FUNCTION pg_temp.normalizar_hashtags(tags jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(jsonb_agg(limpia ORDER BY primera), '[]'::jsonb)
  FROM (
    SELECT limpia, min(pos) AS primera
    FROM (
      SELECT
        regexp_replace(p.parte, '[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+', '', 'g') AS limpia,
        row_number() OVER (ORDER BY t.i, p.j) AS pos
      FROM jsonb_array_elements_text(tags) WITH ORDINALITY AS t(tag, i)
      CROSS JOIN LATERAL regexp_split_to_table(t.tag, '[#,]') WITH ORDINALITY AS p(parte, j)
    ) partes
    WHERE limpia <> ''
    GROUP BY limpia
  ) unicas
$$;--> statement-breakpoint
UPDATE "publication_cards"
SET "content" = jsonb_set("content", '{hashtags}', pg_temp.normalizar_hashtags("content"->'hashtags'))
WHERE jsonb_typeof("content"->'hashtags') = 'array'
  AND "content"->'hashtags' <> pg_temp.normalizar_hashtags("content"->'hashtags');--> statement-breakpoint
UPDATE "card_versions"
SET "content" = jsonb_set("content", '{hashtags}', pg_temp.normalizar_hashtags("content"->'hashtags'))
WHERE jsonb_typeof("content"->'hashtags') = 'array'
  AND "content"->'hashtags' <> pg_temp.normalizar_hashtags("content"->'hashtags');
