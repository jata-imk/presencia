CREATE TYPE "public"."channel_link_error" AS ENUM('taken');--> statement-breakpoint
ALTER TABLE "channel_links" ADD COLUMN "link_error" "channel_link_error";--> statement-breakpoint
ALTER TABLE "channel_links" ADD CONSTRAINT "channel_links_error_only_pending" CHECK ("channel_links"."link_error" IS NULL OR "channel_links"."status" = 'pending');