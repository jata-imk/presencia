-- F9: la meta semanal de publicaciones por red.
--
-- Es lo que rellena el denominador que el Calendario ya tenía abierto: la
-- barra de cadencia contaba publicaciones contra un 5 hardcodeado, con un
-- comentario diciendo que el número sale de Ritmo.
--
-- La AUSENCIA de fila es un valor: significa "no he puesto la mía, usa la
-- sugerida". Por eso no hay backfill ni default en la columna — sembrar la
-- sugerencia convertiría a cada usuario en alguien que ya eligió, y se
-- perdería la distinción entre un número que el producto propuso y uno que la
-- persona aceptó. No son la misma promesa, y la UI las marca distinto.
--
-- `target = 0` sí es una elección legítima: "en esta red no publico".

CREATE TABLE "cadence_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"network" "social_network" NOT NULL,
	"target" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cadence_targets" ADD CONSTRAINT "cadence_targets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cadence_targets_user_network" ON "cadence_targets" USING btree ("user_id","network");
--> statement-breakpoint
-- RLS (ADR-003, mismo patrón que 0025_rls_post_metrics.sql). Los GRANT no
-- hacen falta: 0001_rls_roles_policies.sql dejó un ALTER DEFAULT PRIVILEGES
-- para presencia_app sobre las tablas nuevas.
ALTER TABLE "cadence_targets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cadence_targets" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "cadence_targets"
  USING ("user_id" = current_setting('app.user_id')::uuid);
