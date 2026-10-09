-- F10.8: pgvector. La imagen de Postgres lo trae desde F10.8 PR3 (ADR-020);
-- esta migración lo activa en la base. Requiere el rol dueño (superusuario
-- del contenedor), que es el que corre las migraciones.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
ALTER TYPE "public"."ai_task_kind" ADD VALUE 'memory_index';--> statement-breakpoint
ALTER TYPE "public"."ai_task_kind" ADD VALUE 'memory_search';--> statement-breakpoint
CREATE TABLE "memory_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"chat_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memory_chunks" ADD CONSTRAINT "memory_chunks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_chunks" ADD CONSTRAINT "memory_chunks_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_chunks" ADD CONSTRAINT "memory_chunks_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "memory_chunks_message" ON "memory_chunks" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "memory_chunks_user" ON "memory_chunks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "memory_chunks_embedding" ON "memory_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
-- RLS (ADR-003, patrón de 0035). Sin policy de worker: el job de indexado
-- sabe de qué usuario es y entra por `runWithTenant`.
ALTER TABLE "memory_chunks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "memory_chunks" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "memory_chunks"
  USING ("user_id" = current_setting('app.user_id')::uuid);
