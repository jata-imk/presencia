-- Rol del backup diario (F8.5, ADR-011). Lo usa el `pg_dump` del job
-- `backups.daily`, y nada más.
--
-- Por qué un rol propio y no el owner: el dump necesita LEER TODO, y ese poder
-- no tiene por qué vivir en el rol que sirve requests (presencia_app, sujeto a
-- RLS) ni exigir meter el password del superusuario en el contenedor del
-- worker. `pg_read_all_data` es un rol predefinido desde Postgres 14: da
-- SELECT sobre todo, presente y futuro, y nada más — ni escritura, ni DDL, ni
-- BYPASSRLS para modificar.
--
-- RLS: `pg_read_all_data` NO exime de las policies — la documentación de
-- Postgres lo dice explícitamente y recomienda poner BYPASSRLS al rol. Sin él,
-- `pg_dump` (que corre con `row_security = off`) aborta en la primera tabla con
-- RLS: `query would be affected by row-level security policy for table ...`, y
-- toda tabla de dominio la tiene desde 0001 con ENABLE + FORCE.
--
-- BYPASSRLS acá es de solo lectura: el rol no tiene INSERT/UPDATE/DELETE ni
-- DDL, así que no abre ninguna vía para escribir sobre datos de otro usuario.
-- Y un dump que respeta RLS no sería un respaldo de la base: sería el de un
-- tenant vacío. Requiere superusuario, como el ALTER OWNER de 0020.
--
-- Password sin asignar, como en 0001 y 0020. Por entorno:
--   ALTER ROLE presencia_backup WITH PASSWORD '...';

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'presencia_backup') THEN
    CREATE ROLE presencia_backup LOGIN;
  END IF;
END
$$;
--> statement-breakpoint

GRANT pg_read_all_data TO presencia_backup;
--> statement-breakpoint

-- `pg_read_all_data` ya da USAGE sobre todos los schemas, `pgboss` incluido:
-- no hace falta ningún GRANT extra para que el dump lo lea.
ALTER ROLE presencia_backup BYPASSRLS;
