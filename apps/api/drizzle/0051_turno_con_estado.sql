-- F10.8.2: una respuesta que se cortó (Detener, la red) o falló se guarda con
-- lo que alcanzó a escribirse y su estado, para que la card de estado del chat
-- sobreviva a la recarga (ADR-006, addendum F10.8.2). Solo expand: el default
-- constante no reescribe la tabla, y la app vieja ignora la columna.
CREATE TYPE "public"."message_status" AS ENUM('complete', 'stopped', 'failed');--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "status" "message_status" DEFAULT 'complete' NOT NULL;