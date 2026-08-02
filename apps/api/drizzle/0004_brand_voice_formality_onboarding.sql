ALTER TABLE "brand_voices" ADD COLUMN "formality" smallint DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_voices" ADD COLUMN "reference_examples" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarding_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "brand_voices" ADD CONSTRAINT "brand_voices_formality_range" CHECK ("brand_voices"."formality" BETWEEN 0 AND 100);