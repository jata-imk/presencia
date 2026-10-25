CREATE TYPE "public"."web_read_status" AS ENUM('ok', 'requiere_sesion', 'no_encontrada', 'no_legible', 'bloqueada', 'tiempo', 'muy_grande', 'tipo_no_soportado', 'no_disponible');--> statement-breakpoint
CREATE TABLE "web_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"chat_id" uuid NOT NULL,
	"url" text NOT NULL,
	"final_url" text,
	"status" "web_read_status" NOT NULL,
	"title" text,
	"site_name" text,
	"extracted_text" text,
	"truncated" boolean DEFAULT false NOT NULL,
	"only_description" boolean DEFAULT false NOT NULL,
	"token_estimate" integer DEFAULT 0 NOT NULL,
	"description" text,
	"described_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "web_reads" ADD CONSTRAINT "web_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_reads" ADD CONSTRAINT "web_reads_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "web_reads_by_chat" ON "web_reads" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "web_reads_by_url" ON "web_reads" USING btree ("user_id","url");--> statement-breakpoint
CREATE INDEX "web_reads_by_final_url" ON "web_reads" USING btree ("user_id","final_url");--> statement-breakpoint
-- RLS (ADR-003, patrón de 0055). Sin worker_scan: ningún cron recorre lecturas
-- de todos; el job de descripción (PR4) entra con el tenant de su chat.
ALTER TABLE "web_reads" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "web_reads" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "web_reads"
  USING ("user_id" = current_setting('app.user_id')::uuid);
