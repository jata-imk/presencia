-- F9.6: adelantar el refresco de tendencias, cobrándoselo al usuario.
--
-- El refresco periódico lo absorbe el negocio (ADR-024). Lo que se cobra es
-- pedirlo ANTES de que venza la tanda: el usuario ya tiene tendencias en
-- pantalla y quiere otras hoy.
--
-- Dos cosas que este PR tiene que abrir:
--
-- 1. `credit_reason` no tenía valor para esto. Va BEFORE 'refund' para que los
--    motivos de consumo queden juntos y los de ajuste al final. En su propio
--    statement y sin usarse acá: Postgres deja agregar el valor dentro de una
--    transacción, pero no referenciarlo en la misma.
--
-- 2. `trend_refreshes`. Hace tres trabajos que no se pueden hacer sin ella:
--
--    - **Es el `reference_id` del asiento.** `ledger_dedup` es único por
--      (user_id, reason, reference_type, reference_id) y necesita un uuid. El
--      candidato obvio, `user_trends.id`, NO sirve: esa fila es un upsert, su
--      id no cambia entre refrescos, y el segundo cobro chocaría contra el
--      índice y se perdería en silencio.
--
--    - **Es el candado contra el doble click**, con el índice parcial de
--      abajo. Un `if` en el servicio puede perder la carrera; un índice único
--      no.
--
--    - **Guarda si el refresco era cobrable**, decidido al pedirlo. La
--      pregunta ("¿tenía tendencias vigentes?") solo se puede contestar en el
--      momento del click: cuando el job termina, ~40 segundos después, la
--      tanda ya es otra.

ALTER TYPE "public"."credit_reason" ADD VALUE 'trend_refresh' BEFORE 'refund';--> statement-breakpoint
CREATE TABLE "trend_refreshes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"billable" boolean NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	"outcome" text
);
--> statement-breakpoint
ALTER TABLE "trend_refreshes" ADD CONSTRAINT "trend_refreshes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Un refresco en vuelo por usuario. Parcial por `settled_at is null`: el
-- candado dura lo que dura el job y se suelta solo al liquidarlo.
CREATE UNIQUE INDEX "trend_refreshes_en_vuelo" ON "trend_refreshes" USING btree ("user_id") WHERE "trend_refreshes"."settled_at" is null;--> statement-breakpoint
CREATE INDEX "trend_refreshes_user_requested" ON "trend_refreshes" USING btree ("user_id","requested_at");
--> statement-breakpoint
-- RLS (ADR-003, patrón de 0034). Sin policy de worker: el barrido periódico no
-- toca esta tabla y quien liquida el job ya sabe de qué usuario es, así que
-- entra por `runWithTenant` como cualquier otra escritura.
ALTER TABLE "trend_refreshes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "trend_refreshes" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "trend_refreshes"
  USING ("user_id" = current_setting('app.user_id')::uuid);
