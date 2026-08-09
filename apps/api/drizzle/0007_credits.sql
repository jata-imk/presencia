CREATE TYPE "public"."plan_tier" AS ENUM('creator', 'pro', 'agencia');--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD COLUMN "rate_card_version" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plan_tier" "plan_tier" DEFAULT 'creator' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_dedup" ON "credit_ledger" USING btree ("user_id","reason","reference_type","reference_id") WHERE "credit_ledger"."reference_id" is not null;