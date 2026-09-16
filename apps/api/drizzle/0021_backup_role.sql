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
-- RLS: `pg_read_all_data` incluye el privilegio de saltarse las policies de
-- lectura. Es exactamente lo que un respaldo necesita —un dump por tenant no
-- es un respaldo de la base— y es de solo lectura, así que no abre una vía
-- para escribir sobre datos de otro usuario.
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

-- El dump también lee el schema de la cola. Sin esto, `pg_dump` falla al
-- intentar listar `pgboss` (su dueño es presencia_jobs desde la 0020).
GRANT USAGE ON SCHEMA pgboss TO presencia_backup;
