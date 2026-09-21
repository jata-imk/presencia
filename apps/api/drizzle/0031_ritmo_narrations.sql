-- F9: la narración de Ritmo bajo demanda.
--
-- Dos cosas que hasta ahora no existían y que este PR tiene que abrir.
--
-- 1. `credit_reason` no tenía valor para esto. Se agrega BEFORE 'refund' para
--    que los motivos de consumo queden juntos y los de ajuste al final; el
--    orden del enum no tiene significado en el código, pero sí se lee en un
--    `\dT+` y en cualquier query manual sobre el ledger.
--
--    Va en su propio statement y no se USA en esta migración: Postgres permite
--    agregar el valor dentro de una transacción, pero no referenciarlo en la
--    misma. Acá solo se declara; quien lo inserta es el runtime.
--
-- 2. La narración se guarda. El cobro se deduplica por día con el índice
--    `ledger_dedup`, que necesita un `reference_id` uuid — sin fila, no hay a
--    qué apuntar. Y sin guardar el texto, el segundo click del día pagaría la
--    llamada al modelo sin cobrarla: el usuario no lo nota y el gasto sí.
--
--    `day` es el día LOCAL del usuario, no UTC. Con UTC, a alguien en Mérida
--    la ventana de cobro se le cortaría a las 18:00.

ALTER TYPE "public"."credit_reason" ADD VALUE 'ritmo_narration' BEFORE 'refund';--> statement-breakpoint
CREATE TABLE "ritmo_narrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"body" text NOT NULL,
	"payload" jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ritmo_narrations" ADD CONSTRAINT "ritmo_narrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Una narración por día. Es la misma llave que deduplica el cobro, y que viva
-- acá es lo que hace que dos clicks simultáneos no puedan cobrar dos veces: el
-- segundo choca contra el índice, no contra un `if` en el servicio.
CREATE UNIQUE INDEX "ritmo_narrations_user_day" ON "ritmo_narrations" USING btree ("user_id","day");
--> statement-breakpoint
-- RLS (ADR-003, mismo patrón que 0030_cadence_targets.sql). Los GRANT no hacen
-- falta: 0001_rls_roles_policies.sql dejó un ALTER DEFAULT PRIVILEGES para
-- presencia_app sobre las tablas nuevas.
ALTER TABLE "ritmo_narrations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ritmo_narrations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "ritmo_narrations"
  USING ("user_id" = current_setting('app.user_id')::uuid);
