-- F10 PR3: generar la imagen de una card (ADR-025).
--
-- `image_generations` es una fila por imagen pedida: la referencia del asiento
-- (se cobra por imagen), lo que se pidió y el linaje de las ediciones.
-- `publication_cards.image_job` es el estado que ve el navegador y el candado
-- contra el doble click.

CREATE TYPE "public"."image_generation_kind" AS ENUM('generate', 'edit');--> statement-breakpoint
CREATE TYPE "public"."image_generation_status" AS ENUM('pending', 'succeeded', 'failed', 'blocked');--> statement-breakpoint
CREATE TABLE "image_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"card_id" uuid,
	"batch_id" uuid NOT NULL,
	"kind" "image_generation_kind" NOT NULL,
	"provider_slot" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt" text NOT NULL,
	"instruction" text,
	"parent_asset_id" uuid,
	"aspect_ratio" text NOT NULL,
	"status" "image_generation_status" DEFAULT 'pending' NOT NULL,
	"asset_id" uuid,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "publication_cards" ADD COLUMN "image_job" jsonb;--> statement-breakpoint
ALTER TABLE "image_generations" ADD CONSTRAINT "image_generations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_generations" ADD CONSTRAINT "image_generations_card_id_publication_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."publication_cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_generations" ADD CONSTRAINT "image_generations_parent_asset_id_assets_id_fk" FOREIGN KEY ("parent_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_generations" ADD CONSTRAINT "image_generations_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "image_generations_batch" ON "image_generations" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "image_generations_card" ON "image_generations" USING btree ("card_id");
--> statement-breakpoint
-- RLS (ADR-003, patrón de 0035). Sin policy de worker: quien liquida el job ya
-- sabe de qué usuario es y entra por `runWithTenant`.
ALTER TABLE "image_generations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "image_generations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "image_generations"
  USING ("user_id" = current_setting('app.user_id')::uuid);
