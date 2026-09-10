-- Acota la policy del barrido a lo que el pase puede llegar a necesitar hoy
-- (F8 PR4, idea de Jose en la revisión de la fase).
--
-- Antes dejaba leer TODA card `scheduled`, incluidas las programadas para
-- dentro de dos semanas — que no van a cambiar de estado en el pase de hoy y
-- por lo tanto el worker no tiene por qué poder verlas. En un sistema sano esa
-- es la mayoría de las cards programadas.
--
-- El añadido respeta las DOS ramas de la reconciliación, y ahí está el detalle
-- que no es obvio:
--
--   * Vencidas: tienen `provider_ref` y su hora ya pasó → `scheduled_at < now()`.
--   * Huérfanas: NO tienen `provider_ref` porque el proceso murió entre las dos
--     transacciones de schedule(). Su `scheduled_at` puede estar en el FUTURO
--     —una card programada para dentro de dos semanas cuya llamada al proveedor
--     nunca se confirmó— y hay que cerrarlas igual, porque el proveedor jamás
--     las recibió y nunca se van a publicar. Acotarlas por fecha las volvería
--     invisibles para el worker y se quedarían colgadas para siempre.
--
-- Por qué `now()` a secas y no `now() - RECONCILE_GRACE_MS`: el margen de
-- gracia vive en el código (cards.service.ts) y copiarlo acá sería tener la
-- misma regla en dos lugares. Si algún día cambia y la policy se queda vieja,
-- empezaría a ESCONDER filas que la consulta sí pide — un fallo silencioso.
-- Dejando la policy deliberadamente un poco más ancha que la consulta, nunca
-- puede esconder nada: solo recorta lo que sobra sin discusión posible.
ALTER POLICY worker_scan ON "publication_cards"
  USING (
    current_setting('app.user_id', true) = '00000000-0000-0000-0000-000000000000'
    AND "status" = 'scheduled'
    AND ("provider_ref" IS NULL OR "scheduled_at" < now())
  );
