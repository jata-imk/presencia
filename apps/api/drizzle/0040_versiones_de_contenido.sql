-- F10.5 PR3: versiones del texto de una card.
--
-- Cada edición manual (una por sesión de edición), cada cambio que pide la
-- IA y cada restore deja una fila. La original (`chat`) se escribe la
-- primera vez que la card cambia, no aquí: no hay backfill, así que la
-- migración no depende del rol con que se corra y cubre también las cards
-- que nazcan entre la migración y el deploy.

CREATE TYPE "public"."card_version_source" AS ENUM('chat', 'manual', 'ai', 'restore');--> statement-breakpoint
CREATE TABLE "card_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"n" integer NOT NULL,
	"content" jsonb NOT NULL,
	"source" "card_version_source" NOT NULL,
	"instruction" text,
	"restored_from" integer,
	"edit_session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "card_versions" ADD CONSTRAINT "card_versions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_versions" ADD CONSTRAINT "card_versions_card_id_publication_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."publication_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "card_versions_card_n" ON "card_versions" USING btree ("card_id","n");
--> statement-breakpoint
-- RLS (ADR-003, patrón de 0039).
ALTER TABLE "card_versions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "card_versions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "card_versions"
  USING ("user_id" = current_setting('app.user_id')::uuid);
