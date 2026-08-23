ALTER TABLE "publication_cards" DROP CONSTRAINT "publication_cards_chat_id_chats_id_fk";
--> statement-breakpoint
ALTER TABLE "publication_cards" ALTER COLUMN "chat_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "publication_cards" ADD CONSTRAINT "publication_cards_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE set null ON UPDATE no action;