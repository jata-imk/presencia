CREATE TABLE "card_asset_picks" (
	"user_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"slide_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_asset_picks_card_id_asset_id_pk" PRIMARY KEY("card_id","asset_id")
);
--> statement-breakpoint
ALTER TABLE "card_asset_picks" ADD CONSTRAINT "card_asset_picks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_asset_picks" ADD CONSTRAINT "card_asset_picks_card_id_publication_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."publication_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_asset_picks" ADD CONSTRAINT "card_asset_picks_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_asset_picks_asset" ON "card_asset_picks" USING btree ("asset_id");--> statement-breakpoint
-- RLS (ADR-003, patrón de 0055).
ALTER TABLE "card_asset_picks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "card_asset_picks" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "card_asset_picks"
  USING ("user_id" = current_setting('app.user_id')::uuid);
