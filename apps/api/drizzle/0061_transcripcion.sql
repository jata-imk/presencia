ALTER TYPE "public"."ai_task_kind" ADD VALUE 'transcription';--> statement-breakpoint
ALTER TYPE "public"."credit_reason" ADD VALUE 'audio_transcription' BEFORE 'refund';--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD COLUMN "audio_seconds" smallint;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "voice_seconds" smallint;