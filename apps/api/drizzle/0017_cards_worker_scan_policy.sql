-- Barrido de reconciliación sin tenant fijado (F8, ADR-009 addendum).
--
-- El cron necesita responder "¿qué cards hay que reconciliar, de quién sea?"
-- antes de poder abrir la transacción de cada usuario. Eso es una lectura
-- cross-tenant, y la policy tenant_isolation la prohíbe: fuera de
-- runWithTenant no hay app.user_id que comparar.
--
-- modelo-de-datos.md ya contemplaba este caso: "Jobs agregados cross-user usan
-- tablas sin datos de tenant o una policy adicional explícita — nunca
-- BYPASSRLS por comodidad". Esta es esa policy, y es deliberadamente angosta:
--
--   * solo SELECT — el worker lee para decidir a quién reconciliar; TODA
--     escritura sigue pasando por runWithTenant con su tenant fijado.
--   * solo status='scheduled' — una card en draft, published o failed sigue
--     siendo invisible fuera de su tenant.
--   * solo cuando app.user_id vale el UUID nil, que es el modo "barrido" y no
--     puede ser el id de nadie. Con un usuario real fijado esta policy es
--     falsa y manda tenant_isolation, así que ninguna consulta de la API
--     cambia de comportamiento.
--
-- Por qué un centinela y no "app.user_id sin fijar", que era lo natural:
-- las policies permisivas se combinan con OR, pero Postgres las EVALÚA todas,
-- y `tenant_isolation` usa `current_setting('app.user_id')` sin missing_ok.
-- Sin la variable fijada esa expresión lanza `42704 unrecognized configuration
-- parameter` y tumba la query entera antes de que este OR pueda salvarla
-- (verificado contra la DB, no deducido). Fijar el nil deja que
-- tenant_isolation evalúe a falso limpiamente en vez de tronar.
--
-- Y conserva la red de seguridad que da el error: una query que se olvide de
-- fijar tenant sigue fallando ruidosamente, en vez de devolver cero filas en
-- silencio. El centinela hay que pedirlo a propósito (DbService.runWorkerScan).
--
-- Escribir en modo barrido es inocuo por construcción: tenant_isolation no
-- matchea ninguna fila con el nil, así que un UPDATE ahí toca cero filas.
--
-- Incluye a presencia_app porque en dev el worker corre dentro del proceso de
-- la API (WORKER_INLINE); el split de roles llega con la fase de deploy.
CREATE POLICY worker_scan ON "publication_cards"
  FOR SELECT TO presencia_app, presencia_worker
  USING (
    current_setting('app.user_id', true) = '00000000-0000-0000-0000-000000000000'
    AND "status" = 'scheduled'
  );
