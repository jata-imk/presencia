-- F6.5: fijar chats. `pinned_at` es timestamp nullable y no boolean —
-- mismo patrón que chats.archived_at y social_connect_intents.consumed_at.
-- Además de "está fijado" da gratis el orden ENTRE fijados.
--
-- SIN ÍNDICE, a propósito: bajo RLS toda query está acotada a un usuario,
-- un usuario tiene O(100) chats, `chats_recents` ya cubre el prefijo
-- (user_id) y `pinned_at` solo participa como desempate del ORDER BY sobre
-- ese scan. Un índice acá sería cargo cult (AGENTS.md #6). Si algún día un
-- usuario tiene decenas de miles de chats, medir antes de agregarlo.
--
-- RLS: `chats` ya tiene ENABLE + FORCE + POLICY tenant_isolation desde
-- 0001_rls_roles_policies.sql. Agregar una columna no toca policies.
ALTER TABLE "chats" ADD COLUMN "pinned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_not_pinned_and_archived" CHECK ("chats"."pinned_at" IS NULL OR "chats"."archived_at" IS NULL);
