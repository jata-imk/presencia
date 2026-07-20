ALTER TABLE "users" ADD COLUMN "display_name" text;--> statement-breakpoint

-- Solo canales de mensajería externos se vinculan; 'web' es la app misma
-- (modelo-de-datos.md). El enum global se reúsa, el CHECK cierra el hueco.
ALTER TABLE "channel_links" ADD CONSTRAINT "channel_links_no_web" CHECK ("channel" <> 'web');
