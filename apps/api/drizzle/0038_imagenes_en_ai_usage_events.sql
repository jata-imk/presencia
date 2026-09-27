ALTER TYPE "public"."ai_task_kind" ADD VALUE 'image_generate';--> statement-breakpoint
ALTER TYPE "public"."ai_task_kind" ADD VALUE 'image_edit';--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD COLUMN "images_count" smallint;