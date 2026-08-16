-- RLS para social_connect_intents (F6, ADR-003, mismo patrón que 0001_rls_roles_policies.sql).
ALTER TABLE "social_connect_intents" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "social_connect_intents" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "social_connect_intents"
  USING ("user_id" = current_setting('app.user_id')::uuid);
