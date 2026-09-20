-- F9: la caché compartida de tendencias.
--
-- Esta tabla NO lleva `user_id` ni RLS, y es la única del dominio que no los
-- lleva. Es una excepción consciente a ADR-003, razonada en ADR-023.
--
-- El motivo: no es dato de un tenant. Las tendencias dependen de la tupla
-- (vertical, país, región) y no de la persona — diez creators de "fitness en
-- CDMX" tienen exactamente la misma respuesta. Llavearla por usuario
-- multiplicaría por diez el gasto de búsqueda para producir diez copias del
-- mismo texto, y esa es justo la palanca que el producto no quiere perder.
--
-- Qué NO puede vivir acá, para que la excepción no se ensanche sola: nada
-- derivado del contenido, del historial ni de las métricas de un usuario. Si
-- una fila de esta tabla dependiera de quién la pidió, dejaría de ser caché
-- compartida y pasaría a ser dato de tenant sin aislamiento — que es
-- exactamente el modo de falla que ADR-003 existe para impedir.
--
-- La escribe solo el worker (TrendsService, disparado por sus jobs); la API
-- únicamente lee. Eso es convención y no privilegio: los dos procesos usan el
-- mismo rol `presencia_app`, así que el motor no puede distinguirlos. Lo que
-- sí garantiza el código es que no existe un camino de escritura colgado de un
-- request.
--
-- Una sola fila vigente por tupla: el refresco es un upsert. Sin historial a
-- propósito — nadie pidió "las tendencias de la semana pasada", y guardarlas
-- obligaría a decidir cuándo podarlas.
CREATE TABLE "niche_trends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vertical" text NOT NULL,
	"market_country" text NOT NULL,
	"region" text NOT NULL,
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
CREATE UNIQUE INDEX "niche_trends_key" ON "niche_trends" USING btree ("vertical","market_country","region");
