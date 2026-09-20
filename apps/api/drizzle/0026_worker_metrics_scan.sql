-- F8.7: el barrido de métricas necesita ver las cards PUBLICADAS de todos los
-- usuarios, y la policy que ya existe no se lo permite.
--
-- `worker_scan` (0017, acotada por 0019) deja ver solo `status = 'scheduled'`
-- y accionable. Ampliarla para incluir publicadas sería deshacer ese recorte a
-- propósito: el pase de reconciliación corre CADA MINUTO y cuanto menos ve,
-- menos puede romper. Por eso va una policy aparte — en Postgres las policies
-- de un mismo comando se combinan con OR, así que cada barrido ve exactamente
-- lo suyo y nada más.
--
-- Las tres condiciones, y por qué cada una:
--
--  - `status = 'published'`: es el único estado del que hay algo que medir.
--  - `platform_post_id IS NOT NULL`: sin id nativo no hay a quién preguntarle
--    (migración 0023). Incluye las siete publicaciones anteriores a esa
--    migración, que se quedaron sin él y nunca van a tener métricas.
--  - `published_at > now() - interval '35 days'`: el tope de la ventana que se
--    mide. Es lo que acota el barrido a un conjunto que no crece para siempre,
--    y coincide con el tope que el adapter de PostFast le pone a su rango de
--    fechas. Cinco días de margen sobre los 30 de la política de frescura: la
--    policy no debe ser el filtro fino, solo el techo.
--
-- Solo SELECT: el job escribe métricas por tenant (runWithTenant) y no toca
-- las cards. Y solo a presencia_app, que es el rol con el que corre todo
-- desde 0022.
CREATE POLICY worker_metrics_scan ON "publication_cards"
  FOR SELECT
  TO presencia_app
  USING (
    current_setting('app.user_id', true) = '00000000-0000-0000-0000-000000000000'
    AND "status" = 'published'
    AND "platform_post_id" IS NOT NULL
    AND "published_at" > now() - interval '35 days'
  );
--> statement-breakpoint
-- Índice parcial para ese barrido: sin user_id, porque el pase es global.
-- Mismo patrón que cards_reconcilable (0018).
CREATE INDEX "cards_metrics_scan" ON "publication_cards" ("published_at")
  WHERE "status" = 'published' AND "platform_post_id" IS NOT NULL;
