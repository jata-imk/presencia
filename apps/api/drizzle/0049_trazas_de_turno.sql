-- F10.8.1: la traza de un turno de chat (ADR-026). ai_run_steps guarda un
-- renglón por paso de modelo y por tool; run_id liga el turno, su respuesta
-- (messages) y las llamadas que dispara (ai_usage_events).
CREATE TYPE "public"."ai_run_step_kind" AS ENUM('model', 'tool');--> statement-breakpoint
CREATE TYPE "public"."ai_run_step_status" AS ENUM('ok', 'error', 'aborted');--> statement-breakpoint
CREATE TABLE "ai_run_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"chat_id" uuid,
	"step_index" smallint NOT NULL,
	"kind" "ai_run_step_kind" NOT NULL,
	"name" text NOT NULL,
	"status" "ai_run_step_status" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"duration_ms" integer NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cached_input_tokens" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD COLUMN "run_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "run_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_run_steps" ADD CONSTRAINT "ai_run_steps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_run_steps" ADD CONSTRAINT "ai_run_steps_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "run_steps_by_run" ON "ai_run_steps" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "run_steps_by_user" ON "ai_run_steps" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_by_run" ON "ai_usage_events" USING btree ("run_id");--> statement-breakpoint
-- RLS (ADR-003, patrón de 0006). Sin policy aparte para los jobs: saben de qué
-- usuario son y entran por `runWithTenant`.
ALTER TABLE "ai_run_steps" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ai_run_steps" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "ai_run_steps"
  USING ("user_id" = current_setting('app.user_id')::uuid);
--> statement-breakpoint
-- Append-only, como ai_usage_events: una traza no se edita.
REVOKE UPDATE, DELETE ON "ai_run_steps" FROM presencia_app;
