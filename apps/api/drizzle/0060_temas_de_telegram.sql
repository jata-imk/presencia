CREATE TABLE "telegram_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"chat_id" uuid NOT NULL,
	"telegram_chat_id" bigint NOT NULL,
	"message_thread_id" integer,
	"rename_topic" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_threads_chat" UNIQUE("chat_id"),
	CONSTRAINT "telegram_threads_place" UNIQUE NULLS NOT DISTINCT("user_id","telegram_chat_id","message_thread_id")
);
--> statement-breakpoint
ALTER TABLE "telegram_threads" ADD CONSTRAINT "telegram_threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_threads" ADD CONSTRAINT "telegram_threads_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- RLS (ADR-003, patrón de 0049). Sin worker_scan: el bot ya sabe de quién es
-- el update (channel_links) antes de buscar el tema, y entra con su tenant.
ALTER TABLE "telegram_threads" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "telegram_threads" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "telegram_threads"
  USING ("user_id" = current_setting('app.user_id')::uuid);
