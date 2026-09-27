ALTER TYPE "public"."ai_task_kind" ADD VALUE 'trends_search';--> statement-breakpoint
ALTER TYPE "public"."ai_task_kind" ADD VALUE 'trends_structure';--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD COLUMN "search_queries" smallint;