ALTER TYPE "public"."credit_reason" ADD VALUE 'voice_distill' BEFORE 'refund';--> statement-breakpoint
ALTER TABLE "brand_voices" ADD COLUMN "style_notes" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_voices" ADD COLUMN "business_facts" text;--> statement-breakpoint
ALTER TABLE "brand_voices" ADD COLUMN "last_voice_example" jsonb;