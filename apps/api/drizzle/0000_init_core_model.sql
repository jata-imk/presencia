CREATE TYPE "public"."asset_source" AS ENUM('generated', 'uploaded');--> statement-breakpoint
CREATE TYPE "public"."card_status" AS ENUM('draft', 'scheduled', 'published', 'canceled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('web', 'telegram', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."channel_link_status" AS ENUM('pending', 'active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."credit_reason" AS ENUM('monthly_grant', 'cycle_expiration', 'chat_message', 'idea_generation', 'multi_adapt', 'image_generation', 'weekly_calendar', 'refund', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant', 'system', 'tool');--> statement-breakpoint
CREATE TYPE "public"."publication_archetype" AS ENUM('visual_first', 'video_script', 'text_first');--> statement-breakpoint
CREATE TYPE "public"."social_account_status" AS ENUM('active', 'disconnected', 'error');--> statement-breakpoint
CREATE TYPE "public"."social_network" AS ENUM('instagram', 'facebook', 'tiktok', 'linkedin', 'youtube', 'threads', 'x');--> statement-breakpoint
CREATE TYPE "public"."voice_register" AS ENUM('neutro_profesional', 'informal', 'de_barrio', 'tecnico', 'profesional');--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"chat_id" uuid,
	"card_id" uuid,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"source" "asset_source" NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_voices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"market_country" text DEFAULT 'MX' NOT NULL,
	"market_region" text,
	"niche" text[] DEFAULT '{}' NOT NULL,
	"audience" text,
	"register" "voice_register" DEFAULT 'neutro_profesional' NOT NULL,
	"allowed_expressions" text[] DEFAULT '{}' NOT NULL,
	"banned_expressions" text[] DEFAULT '{}' NOT NULL,
	"use_anglicisms" boolean DEFAULT true NOT NULL,
	"key_topics" text[] DEFAULT '{}' NOT NULL,
	"preferred_ctas" text[] DEFAULT '{}' NOT NULL,
	"extras" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" "channel" NOT NULL,
	"external_id" text NOT NULL,
	"status" "channel_link_status" DEFAULT 'pending' NOT NULL,
	"linked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"folder_id" uuid,
	"title" text DEFAULT 'Nuevo chat' NOT NULL,
	"archived_at" timestamp with time zone,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "credit_ledger_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"delta" bigint NOT NULL,
	"reason" "credit_reason" NOT NULL,
	"reference_type" text,
	"reference_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"brand_voice_id" uuid,
	"position" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"parts" jsonb NOT NULL,
	"channel" "channel" DEFAULT 'web' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publication_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"chat_id" uuid NOT NULL,
	"message_id" uuid,
	"archetype" "publication_archetype" NOT NULL,
	"network" "social_network" NOT NULL,
	"status" "card_status" DEFAULT 'draft' NOT NULL,
	"content" jsonb NOT NULL,
	"group_id" uuid,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"provider_ref" text,
	"error_detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"network" "social_network" NOT NULL,
	"provider_ref" text NOT NULL,
	"display_name" text,
	"status" "social_account_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"timezone" text DEFAULT 'America/Mexico_City' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_card_id_publication_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."publication_cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_voices" ADD CONSTRAINT "brand_voices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_links" ADD CONSTRAINT "channel_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_brand_voice_id_brand_voices_id_fk" FOREIGN KEY ("brand_voice_id") REFERENCES "public"."brand_voices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_cards" ADD CONSTRAINT "publication_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_cards" ADD CONSTRAINT "publication_cards_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_cards" ADD CONSTRAINT "publication_cards_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brand_voices_one_default_per_user" ON "brand_voices" USING btree ("user_id") WHERE "brand_voices"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "channel_links_external" ON "channel_links" USING btree ("channel","external_id");--> statement-breakpoint
CREATE INDEX "chats_recents" ON "chats" USING btree ("user_id","last_message_at");--> statement-breakpoint
CREATE INDEX "ledger_balance" ON "credit_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_by_chat" ON "messages" USING btree ("chat_id","created_at");--> statement-breakpoint
CREATE INDEX "cards_calendar" ON "publication_cards" USING btree ("user_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "cards_by_group" ON "publication_cards" USING btree ("group_id");