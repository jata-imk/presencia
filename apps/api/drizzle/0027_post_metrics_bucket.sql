-- F8.7 (continuación): la resolución de la serie deja de ser el día.
--
-- `post_metrics` guardaba UNA fila por post y día. Eso ponía un techo al dato
-- que no tenía nada que ver con lo que el proveedor puede dar: medir un post
-- ocho veces en su primer día costaba ocho requests y guardaba UN punto, el
-- último, porque todas caían en la misma fila.
--
-- Ahora la llave temporal es el inicio del BUCKET al que pertenece la
-- medición, y el ancho del bucket lo decide la edad del post (frescura.ts):
-- 1 h en las primeras 12, 6 h hasta las 48, 1 día hasta los 14, 3 días hasta
-- los 30. Resolución fina donde el post se mueve, barata donde ya no.
--
-- Lo importante del cambio: frecuencia de medición y resolución de la serie
-- dejan de poder divergir. Cada request que se paga deja un punto, y dos
-- pases dentro del mismo bucket siguen escribiendo la misma fila — el
-- invariante del DoD de la fase, ahora por bucket en vez de por día.
--
-- Conversión sin pérdida: las filas que ya existen eran diarias, así que su
-- bucket es la medianoche UTC de su día. `date::timestamptz` en una sesión
-- con otro TimeZone daría la medianoche LOCAL, que es un día distinto; por eso
-- el AT TIME ZONE 'UTC' explícito.
ALTER TABLE "post_metrics" ADD COLUMN "snapshot_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "post_metrics" SET "snapshot_at" = ("snapshot_date"::timestamp AT TIME ZONE 'UTC');
--> statement-breakpoint
ALTER TABLE "post_metrics" ALTER COLUMN "snapshot_at" SET NOT NULL;
--> statement-breakpoint
DROP INDEX "post_metrics_snapshot";
--> statement-breakpoint
ALTER TABLE "post_metrics" DROP COLUMN "snapshot_date";
--> statement-breakpoint
CREATE UNIQUE INDEX "post_metrics_snapshot" ON "post_metrics" USING btree ("user_id","network","platform_post_id","snapshot_at");
