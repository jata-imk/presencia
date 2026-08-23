-- F6.5: búsqueda full-text (ADR-017). Migración escrita a mano, no
-- generada por drizzle-kit: extensiones, configuración de text search,
-- funciones y columnas generadas no se expresan en el schema de Drizzle.
-- Mismo trato que 0008 y 0010 (registrada en meta/_journal.json sin
-- snapshot). Las columnas `search_tsv` NO se declaran en schema.ts a
-- propósito: drizzle-kit diffea contra el snapshot, no contra la DB viva,
-- así que si nunca entran a un snapshot nunca las va a querer borrar.
--
-- Verificado contra la DB real: Postgres 17, ambas extensiones
-- disponibles y `trusted` (PG13+), así que las crea el owner sin
-- superusuario. CI corre postgres:17-alpine, mismo mayor.
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint

-- El stemmer 'spanish' NO quita acentos: "adiós" y "adios" stemean
-- distinto, y el producto es en español mexicano. Config propia que
-- encadena unaccent antes del stemmer.
CREATE TEXT SEARCH CONFIGURATION es_unaccent (COPY = spanish);--> statement-breakpoint
ALTER TEXT SEARCH CONFIGURATION es_unaccent
  ALTER MAPPING FOR hword, hword_part, word WITH unaccent, spanish_stem;--> statement-breakpoint

-- unaccent(text) es STABLE, no IMMUTABLE, y un índice de expresión lo
-- rechaza. Este wrapper es el workaround documentado por el propio
-- Postgres: fija el diccionario explícitamente (sin depender del search_path
-- de la sesión) y se declara inmutable.
CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
  $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;--> statement-breakpoint

-- ── Cuerpos: FTS con stemming ────────────────────────────────────────
-- messages.parts es jsonb (shape UIMessage del AI SDK), no texto. Extraer
-- con jsonb_array_elements exigiría una subquery, y las columnas generadas
-- no las admiten; jsonb_path_query_array sí es inmutable y solo toca la
-- propia fila. El ::text deja ["hola", "mundo"] con corchetes y comillas:
-- no molesta, el parser de Postgres los trata como separadores.
-- Es STORED, así que Postgres la calcula para las filas existentes al
-- agregarla — cero código de backfill.
ALTER TABLE "messages" ADD COLUMN "search_tsv" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('es_unaccent',
      jsonb_path_query_array("parts", '$[*] ? (@.type == "text").text')::text)
  ) STORED;--> statement-breakpoint
CREATE INDEX "messages_search_tsv" ON "messages" USING gin ("search_tsv");--> statement-breakpoint

-- publication_cards.content valida contra cardContentSchema, que es un
-- discriminatedUnion de tres arquetipos con campos DISTINTOS:
--   visual_first → caption
--   video_script → hook + script + caption
--   text_first   → body
-- Se concatenan todos con coalesce: el que no aplica al arquetipo de la
-- fila simplemente no existe y aporta ''. Quedan fuera imagePrompt y
-- recordingNotes: son instrucciones de producción, no el texto publicable
-- que el usuario va a recordar y buscar.
ALTER TABLE "publication_cards" ADD COLUMN "search_tsv" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('es_unaccent',
      coalesce("content" ->> 'caption', '') || ' ' ||
      coalesce("content" ->> 'body', '') || ' ' ||
      coalesce("content" ->> 'hook', '') || ' ' ||
      coalesce("content" ->> 'script', '') || ' ' ||
      coalesce(jsonb_path_query_array("content", '$.hashtags[*]')::text, ''))
  ) STORED;--> statement-breakpoint
CREATE INDEX "publication_cards_search_tsv" ON "publication_cards" USING gin ("search_tsv");--> statement-breakpoint

-- ── Nombres: trigramas ───────────────────────────────────────────────
-- Títulos y nombres son strings cortos: importa tolerar typos y
-- coincidencias parciales, no el stemming. f_unaccent para que "merida"
-- encuentre "Mérida".
CREATE INDEX "chats_title_trgm" ON "chats" USING gin (f_unaccent("title") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "folders_name_trgm" ON "folders" USING gin (f_unaccent("name") gin_trgm_ops);
