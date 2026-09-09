-- Índice para el barrido de reconciliación (F8, code review PR2).
--
-- La query del cron filtra por status='scheduled' SIN user_id, así que el
-- único índice que existía (`cards_calendar` sobre (user_id, scheduled_at))
-- no le sirve: su columna líder no aparece en el predicado. Sin esto, el pase
-- hace un seq scan de publication_cards cada minuto, para siempre, sobre una
-- tabla que solo crece (las cards published y failed se conservan).
--
-- Parcial a propósito: la fracción de filas 'scheduled' es chica y se mantiene
-- chica —una card deja ese estado en cuanto se publica o falla—, así que el
-- índice pesa poco y el planner puede recorrerlo entero cuando haga falta.
CREATE INDEX "cards_reconcilable" ON "publication_cards" ("scheduled_at")
  WHERE "status" = 'scheduled';
