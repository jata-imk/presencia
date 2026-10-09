ALTER TYPE "public"."credit_reason" ADD VALUE 'history_compaction' BEFORE 'refund';--> statement-breakpoint
CREATE TABLE "chat_summaries" (
	"chat_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"summary" text NOT NULL,
	"through_message_id" uuid NOT NULL,
	"through_created_at" timestamp with time zone NOT NULL,
	"cards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_summaries" ADD CONSTRAINT "chat_summaries_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_summaries" ADD CONSTRAINT "chat_summaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- RLS (ADR-003, patrón de 0035). Sin policy de worker: el job de compactación
-- sabe de qué usuario es y entra por `runWithTenant`.
ALTER TABLE "chat_summaries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "chat_summaries" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "chat_summaries"
  USING ("user_id" = current_setting('app.user_id')::uuid);
