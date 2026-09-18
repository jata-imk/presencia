CREATE TABLE "post_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"social_account_id" uuid,
	"network" "social_network" NOT NULL,
	"platform_post_id" text NOT NULL,
	"card_id" uuid,
	"snapshot_date" date NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"impressions" bigint,
	"reach" bigint,
	"likes" bigint,
	"comments" bigint,
	"shares" bigint,
	"raw" jsonb NOT NULL,
	"provider" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "post_metrics" ADD CONSTRAINT "post_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_metrics" ADD CONSTRAINT "post_metrics_social_account_id_social_accounts_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_metrics" ADD CONSTRAINT "post_metrics_card_id_publication_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."publication_cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "post_metrics_snapshot" ON "post_metrics" USING btree ("user_id","network","platform_post_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "post_metrics_by_card" ON "post_metrics" USING btree ("card_id");