CREATE TABLE "ops_alerts" (
	"key" text PRIMARY KEY NOT NULL,
	"firing" boolean NOT NULL,
	"since" timestamp with time zone NOT NULL,
	"last_sent_at" timestamp with time zone,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- RLS (ADR-003) aunque no haya tenant: el invariante del repo es que toda
-- tabla de `public` con datos de la app lo tiene, y así una query de la API
-- con un usuario fijado no ve ni toca el estado de operación.
--
-- La única policy es la del modo barrido (el UUID nil de
-- DbService.runWorkerScan, mismo centinela que 0017): ahí corre `ops.watch`.
-- Sin `tenant_isolation`, con un usuario real fijado la tabla es invisible.
-- A diferencia de las otras `worker_scan`, esta sí escribe: el estado de las
-- alertas no es de nadie, así que no hay un tenant al cual regresar para
-- escribir (la regla de DbService.runWorkerScan es para datos de usuarios).
ALTER TABLE "ops_alerts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ops_alerts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY worker_scan ON "ops_alerts"
  FOR ALL TO presencia_app
  USING (current_setting('app.user_id', true) = '00000000-0000-0000-0000-000000000000')
  WITH CHECK (current_setting('app.user_id', true) = '00000000-0000-0000-0000-000000000000');
