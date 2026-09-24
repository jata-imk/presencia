-- F9.6: las tendencias pasan a ser por usuario, y personalizables.
--
-- Tres piezas:
--
--  1. `user_trends` — una tanda vigente por persona. Upsert, sin historial:
--     nadie pidió "las tendencias de la semana pasada" y guardarlas obligaría
--     a decidir cuándo podarlas.
--  2. `trend_sources` — los medios que el usuario quiere que miremos. Tabla y
--     no un array en `brand_voices` porque se listan, se agregan y se borran
--     de a una, y cada una necesita su fecha de alta.
--  3. Tres columnas en `brand_voices` para el resto de la personalización. Las
--     dos de texto son OPCIONALES: sin ellas la búsqueda se arma igual con el
--     nicho, la audiencia y la región del onboarding. Personalizar es opcional;
--     el prompt base, no.
--
-- `trend_langs` con default `{es}` y no vacío: el producto es para creators
-- mexicanos y ese es el comportamiento que ya tenían. Lo que cambia es que
-- ahora se puede abrir a inglés, que en nichos técnicos es donde está casi
-- todo lo que se mueve.

CREATE TABLE "trend_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"host" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_trends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"items" jsonb NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"usage" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brand_voices" ADD COLUMN "trend_prompt" text;--> statement-breakpoint
ALTER TABLE "brand_voices" ADD COLUMN "trend_exclude" text;--> statement-breakpoint
ALTER TABLE "brand_voices" ADD COLUMN "trend_langs" text[] DEFAULT '{"es"}' NOT NULL;--> statement-breakpoint
ALTER TABLE "trend_sources" ADD CONSTRAINT "trend_sources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_trends" ADD CONSTRAINT "user_trends_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "trend_sources_user_host" ON "trend_sources" USING btree ("user_id","host");--> statement-breakpoint
CREATE UNIQUE INDEX "user_trends_user" ON "user_trends" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_trends_expires" ON "user_trends" USING btree ("expires_at");

--> statement-breakpoint
-- RLS (ADR-003, patrón de 0030_cadence_targets.sql). Acá es más que rutina:
-- la tabla que estas reemplazan NO tenía aislamiento a propósito, así que una
-- policy mal puesta se vería igual que el comportamiento viejo. El spec del
-- repositorio lo verifica en las dos direcciones.
ALTER TABLE "user_trends" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "user_trends" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "user_trends"
  USING ("user_id" = current_setting('app.user_id')::uuid);
--> statement-breakpoint
-- El barrido necesita saber A QUIÉN le toca refresco, y eso es una pregunta
-- cross-tenant: "quién tiene la tanda vencida o no tiene ninguna". Sin esta
-- policy la query devolvería cero filas y las tendencias no se refrescarían
-- nunca, sin un solo error — el peor modo de falla posible.
--
-- Acotada como la de 0026: SOLO SELECT, y solo para el centinela del barrido.
-- No puede escribir; las escrituras siguen entrando por `runWithTenant`.
CREATE POLICY worker_trends_scan ON "user_trends"
  FOR SELECT
  TO presencia_app
  USING (current_setting('app.user_id', true) = '00000000-0000-0000-0000-000000000000');
--> statement-breakpoint
ALTER TABLE "trend_sources" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "trend_sources" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "trend_sources"
  USING ("user_id" = current_setting('app.user_id')::uuid);
