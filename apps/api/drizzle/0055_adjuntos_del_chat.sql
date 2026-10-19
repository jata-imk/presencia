CREATE TYPE "public"."attachment_kind" AS ENUM('image', 'text', 'pdf');--> statement-breakpoint
CREATE TABLE "message_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"chat_id" uuid,
	"message_id" uuid,
	"kind" "attachment_kind" NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"storage_key" text NOT NULL,
	"model_storage_key" text,
	"width" integer,
	"height" integer,
	"pages" integer,
	"scanned" boolean DEFAULT false NOT NULL,
	"extracted_text" text,
	"truncated" boolean DEFAULT false NOT NULL,
	"token_estimate" integer NOT NULL,
	"description" text,
	"described_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_by_message" ON "message_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "attachments_by_chat" ON "message_attachments" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "attachments_unsent" ON "message_attachments" USING btree ("created_at") WHERE "message_attachments"."message_id" is null;--> statement-breakpoint
-- RLS (ADR-003, patrón de 0049).
ALTER TABLE "message_attachments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "message_attachments" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "message_attachments"
  USING ("user_id" = current_setting('app.user_id')::uuid);
--> statement-breakpoint
-- El cron `attachments.cleanup` busca, de quien sea, los adjuntos que nunca se
-- enviaron (patrón de 0017/0026: solo SELECT, solo con el centinela nil, y
-- solo las filas sin mensaje). El borrado entra por runWithTenant, con su
-- tenant. Solo presencia_app: el worker corre como él (0022).
CREATE POLICY worker_scan ON "message_attachments"
  FOR SELECT TO presencia_app
  USING (
    current_setting('app.user_id', true) = '00000000-0000-0000-0000-000000000000'
    AND "message_id" IS NULL
  );
