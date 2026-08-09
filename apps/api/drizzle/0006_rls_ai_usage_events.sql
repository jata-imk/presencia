-- RLS para ai_usage_events (F4.5, ADR-003, mismo patrón que 0001_rls_roles_policies.sql).
ALTER TABLE "ai_usage_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ai_usage_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "ai_usage_events"
  USING ("user_id" = current_setting('app.user_id')::uuid);
--> statement-breakpoint

-- Append-only (F4.5): el ALTER DEFAULT PRIVILEGES de 0001 otorga los 4 verbos
-- a toda tabla nueva. Aquí se revocan los dos que corromperían el registro:
-- una corrección se hace con una fila nueva, nunca editando la anterior.
REVOKE UPDATE, DELETE ON "ai_usage_events" FROM presencia_app, presencia_worker;
