DROP INDEX "channel_links_external";--> statement-breakpoint
ALTER TABLE "channel_links" ALTER COLUMN "external_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "channel_links" ADD COLUMN "link_token_hash" text;--> statement-breakpoint
ALTER TABLE "channel_links" ADD COLUMN "link_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "channel_links" ADD COLUMN "username" text;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_links_active_external" ON "channel_links" USING btree ("channel","external_id") WHERE "channel_links"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "channel_links_user_channel" ON "channel_links" USING btree ("user_id","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_links_token" ON "channel_links" USING btree ("link_token_hash");--> statement-breakpoint
ALTER TABLE "channel_links" ADD CONSTRAINT "channel_links_active_has_external" CHECK ("channel_links"."status" <> 'active' OR "channel_links"."external_id" IS NOT NULL);--> statement-breakpoint
-- F11 (ADR-030): el bot de Telegram recibe updates sin sesión. Para saber de
-- quién es un mensaje (`external_id` → `user_id`) y canjear el código del deep
-- link (`link_token_hash` → `user_id`) tiene que leer sin conocer el tenant.
-- Patrón de 0017/0055: solo SELECT, solo con el centinela nil y solo las filas
-- que el bot puede necesitar (pendientes y activas, nunca las revocadas).
-- Todo lo que escribe vuelve a entrar por runWithTenant, con su tenant.
CREATE POLICY worker_scan ON "channel_links"
  FOR SELECT TO presencia_app
  USING (
    current_setting('app.user_id', true) = '00000000-0000-0000-0000-000000000000'
    AND "status" IN ('pending', 'active')
  );
