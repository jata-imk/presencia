-- RLS para post_metrics (F8.7, ADR-003, mismo patrón que 0006_rls_ai_usage_events.sql).
--
-- A diferencia de ai_usage_events, esta tabla NO es append-only: el pase del
-- mismo día actualiza la fila en vez de insertar otra (es el invariante del
-- DoD), así que UPDATE tiene que seguir concedido. DELETE tampoco se revoca:
-- borrar la cuenta o el usuario ya limpia por FK, y una fila de métricas de un
-- post que se borró de la red no tiene por qué ser inmortal.
--
-- Los GRANT no hacen falta: 0001_rls_roles_policies.sql dejó un
-- ALTER DEFAULT PRIVILEGES para presencia_app sobre las tablas nuevas.
--
-- No lleva policy de worker_scan: el job de ingesta enumera desde
-- publication_cards (que sí la tiene, ver 0026) y escribe por tenant con
-- runWithTenant. Nunca necesita leer métricas de todos los usuarios a la vez.
ALTER TABLE "post_metrics" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "post_metrics" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "post_metrics"
  USING ("user_id" = current_setting('app.user_id')::uuid);
