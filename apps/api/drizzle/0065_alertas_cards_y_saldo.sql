-- Alertas de operación, PR3 (F12.8, ADR-031): lo que `ops.watch` necesita
-- leer cross-tenant para avisar de dos cosas — un pico de cards que pasan a
-- fallidas (la primera señal de que el proveedor de publicación cambió algo)
-- y un proveedor de IA que se quedó sin saldo o que dejó de contestar.
--
-- Mismo patrón que `worker_scan` (0017) y `worker_metrics_scan` (0026): solo
-- SELECT, solo con el centinela nil del modo barrido, y acotadas a lo que el
-- chequeo mira. `ops.watch` solo CUENTA: no escribe nada de estas tablas, y
-- ningún dato de un creator sale en el aviso más allá de un motivo genérico
-- (cards) o el error del proveedor (IA).
--
-- La ventana de 2 h es el doble de la que usan los chequeos (60 min): holgura
-- contra relojes, sin abrir más historia de la necesaria.

-- Cards que pasaron a `failed` hace poco. `updated_at` es la hora del fallo:
-- la reconciliación la toca al marcarla, y una card fallida no se vuelve a
-- editar (habría que reprogramarla, que la saca de `failed`).
CREATE POLICY worker_ops_scan ON "publication_cards"
  FOR SELECT
  TO presencia_app
  USING (
    current_setting('app.user_id', true) = '00000000-0000-0000-0000-000000000000'
    AND "status" = 'failed'
    AND "updated_at" > now() - interval '2 hours'
  );
--> statement-breakpoint
CREATE INDEX "cards_failed_recent" ON "publication_cards" ("updated_at")
  WHERE "status" = 'failed';
--> statement-breakpoint
-- Los eventos de uso de IA recientes: de ahí salen los intentos caídos por
-- saldo (`provider_raw.attempts`) y cuánto tráfico contesta un respaldo
-- (`fallback_from`). Append-only: la policy no agrega escritura.
CREATE POLICY worker_ops_scan ON "ai_usage_events"
  FOR SELECT
  TO presencia_app
  USING (
    current_setting('app.user_id', true) = '00000000-0000-0000-0000-000000000000'
    AND "created_at" > now() - interval '2 hours'
  );
--> statement-breakpoint
-- `usage_by_user` empieza por user_id y no sirve para "todo lo de la última
-- hora": sin este índice, cada pase de cinco minutos recorrería la tabla
-- entera, que crece con cada mensaje de cada creator.
CREATE INDEX "usage_by_created_at" ON "ai_usage_events" ("created_at");
