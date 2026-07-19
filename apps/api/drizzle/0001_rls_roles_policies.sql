-- RLS: aislamiento multi-tenant (ADR-003, docs/reference/modelo-de-datos.md).
-- Roles de conexión (sin password aquí; se asigna por entorno con ALTER ROLE):
--   presencia_app      → API, sujeto a RLS
--   presencia_worker   → worker pg-boss, sujeto a RLS (fija app.user_id por job)
--   (las migraciones corren con el rol owner: presencia_migrator o el superuser del entorno)

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'presencia_app') THEN
    CREATE ROLE presencia_app LOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'presencia_worker') THEN
    CREATE ROLE presencia_worker LOGIN;
  END IF;
END
$$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO presencia_app, presencia_worker;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO presencia_app, presencia_worker;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO presencia_app, presencia_worker;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO presencia_app, presencia_worker;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO presencia_app, presencia_worker;
--> statement-breakpoint

-- El ledger nunca registra movimientos nulos (ADR-012).
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_delta_not_zero" CHECK ("delta" <> 0);
--> statement-breakpoint

-- RLS en toda tabla de dominio. FORCE aplica incluso al owner.
ALTER TABLE "brand_voices" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "brand_voices" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "folders" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "folders" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "chats" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "chats" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "messages" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "publication_cards" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "publication_cards" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "assets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "assets" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "channel_links" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "channel_links" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "social_accounts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "social_accounts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "credit_ledger" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "credit_ledger" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Una policy por tabla: la fila es visible/escribible solo si pertenece
-- al tenant fijado con SET LOCAL app.user_id en la transacción.
CREATE POLICY tenant_isolation ON "brand_voices"
  USING ("user_id" = current_setting('app.user_id')::uuid);
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "folders"
  USING ("user_id" = current_setting('app.user_id')::uuid);
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "chats"
  USING ("user_id" = current_setting('app.user_id')::uuid);
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "messages"
  USING ("user_id" = current_setting('app.user_id')::uuid);
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "publication_cards"
  USING ("user_id" = current_setting('app.user_id')::uuid);
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "assets"
  USING ("user_id" = current_setting('app.user_id')::uuid);
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "channel_links"
  USING ("user_id" = current_setting('app.user_id')::uuid);
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "social_accounts"
  USING ("user_id" = current_setting('app.user_id')::uuid);
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "credit_ledger"
  USING ("user_id" = current_setting('app.user_id')::uuid);
