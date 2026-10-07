CREATE TYPE "public"."chat_title_source" AS ENUM('default', 'auto', 'user');--> statement-breakpoint
ALTER TYPE "public"."credit_reason" ADD VALUE 'chat_title' BEFORE 'refund';--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "title_source" "chat_title_source" DEFAULT 'default' NOT NULL;--> statement-breakpoint
-- F10.8: un chat que ya no dice "Nuevo chat" lo renombró el creator (antes no
-- había título automático), y ése no se toca.
UPDATE "chats" SET "title_source" = 'user' WHERE "title" <> 'Nuevo chat';
