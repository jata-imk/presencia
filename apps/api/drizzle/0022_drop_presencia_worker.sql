-- Elimina el rol presencia_worker (F8.6). Se creó en 0001 pensando que el
-- worker tendría su propia identidad de base de datos, pero nunca se usó: el
-- contenedor `worker` lee y escribe datos como presencia_app (APP_DATABASE_URL)
-- y la cola como presencia_jobs (0020). En dev y en prod existía sin password,
-- así que tampoco podía iniciar sesión: no era un riesgo, era un cabo suelto
-- que confundía a quien leyera el inventario de roles.
--
-- No basta un DROP ROLE: Postgres se niega mientras el rol aparezca en una
-- policy o tenga privilegios. Lo referenciaban:
--   - la policy `worker_scan` (0017, estrechada en 0019), `TO presencia_app,
--     presencia_worker`. Es la que permite la lectura cross-tenant del barrido
--     de reconciliación, y el barrido corre como presencia_app: se deja solo a
--     ese rol, con el USING de 0019 intacto (ALTER POLICY ... TO no lo toca).
--   - los GRANT de 0001 sobre public, y los REVOKE parciales de 0006 y 0008.
--   - los default privileges de 0001 (public) y los de 0016 (pgboss), que 0020
--     vació pero cuyas entradas pueden seguir en pg_default_acl.
-- DROP OWNED BY limpia todo lo segundo en esta base. El rol no es dueño de
-- ningún objeto (verificado en dev y prod contra pg_shdepend antes de aplicar),
-- así que no borra nada más que privilegios.
--
-- Idempotente: en una base donde el rol ya no existe no hace nada.

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'presencia_worker') THEN
    ALTER POLICY worker_scan ON "publication_cards" TO presencia_app;
    DROP OWNED BY presencia_worker;
    DROP ROLE presencia_worker;
  END IF;
END
$$;
