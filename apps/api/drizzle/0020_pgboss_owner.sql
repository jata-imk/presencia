-- Dueño único de la cola de jobs (F8.5, addendum de ADR-008). Cierra la
-- decisión que dejó abierta 0016: privilegios no son propiedad.
--
-- El problema: pg-boss corre sus propias migraciones al arrancar
-- (`migrate: true`), y esas hacen DDL de dueño — CREATE OR REPLACE FUNCTION,
-- ALTER TABLE ... ADD CONSTRAINT, ATTACH PARTITION. Eso exige ser OWNER del
-- objeto, y ningún GRANT lo otorga. Mientras un solo rol instalaba y usaba la
-- cola no mordía; con el contenedor `worker` conectando con OTRO rol, el día
-- que suba la versión de pg-boss el arranque aborta con
-- `must be owner of table job`.
--
-- La salida elegida: un rol, presencia_jobs, dueño de todo lo que vive en el
-- schema `pgboss`, con el que pg-boss se conecta en TODOS los entornos
-- (JOBS_DATABASE_URL). Quien crea es siempre quien usa, así que el desajuste
-- es imposible por construcción. La alternativa descartada —migrate:false y
-- las migraciones de pg-boss vendidas como nuestras— convertía cada upgrade
-- de la librería en trabajo manual.
--
-- Como el rol que crea las tablas deja de variar, la cola además se separa del
-- acceso a datos: presencia_app y presencia_worker pierden todo acceso a
-- `pgboss` (siguen con RLS sobre `public`, ADR-003). Ningún código de la app
-- consulta la cola por SQL; solo pg-boss, por su propio pool.
--
-- Idempotente y válida en los dos estados en que la encuentra un entorno:
--   · dev: las tablas ya existen, a nombre de presencia_app → se reasignan.
--   · prod (base nueva): pg-boss todavía no arrancó nunca → los bucles no
--     encuentran nada, y las tablas nacen a nombre de presencia_jobs.
--
-- Password sin asignar a propósito, como en 0001: un password en SQL
-- versionado es un secreto commiteado. Por entorno:
--   ALTER ROLE presencia_jobs WITH PASSWORD '...';

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'presencia_jobs') THEN
    CREATE ROLE presencia_jobs LOGIN;
  END IF;
END
$$;
--> statement-breakpoint

ALTER SCHEMA pgboss OWNER TO presencia_jobs;
--> statement-breakpoint

-- Tablas, secuencias sueltas y vistas. Las tablas incluyen el padre
-- particionado Y cada partición por separado (job_common, una `j<hash>` por
-- cola, las diarias de queue_stats): ALTER TABLE sobre el padre NO propaga el
-- dueño a sus particiones.
--
-- Las secuencias que pertenecen a una columna (serial, identity) se SALTAN:
-- cambian de dueño junto con su tabla, y un ALTER SEQUENCE directo sobre ellas
-- falla con "cannot change owner of sequence". El filtro de pg_depend se
-- limita a relkind 'S' a propósito: Postgres registra también el vínculo de
-- una partición con su padre como dependencia `deptype = 'a'`, y sin esa
-- condición el bucle se saltaba todas las particiones.
--
-- Los índices no se tocan: siguen al dueño de su tabla.
DO $$
DECLARE
  obj record;
BEGIN
  FOR obj IN
    SELECT c.relname, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'pgboss'
      AND c.relkind IN ('r', 'p', 'S', 'v', 'm')
      AND (
        c.relkind <> 'S'
        OR NOT EXISTS (
          SELECT 1 FROM pg_depend d
          WHERE d.classid = 'pg_class'::regclass
            AND d.objid = c.oid
            AND d.deptype IN ('a', 'i')
        )
      )
  LOOP
    EXECUTE format(
      'ALTER %s pgboss.%I OWNER TO presencia_jobs',
      CASE obj.relkind
        WHEN 'S' THEN 'SEQUENCE'
        WHEN 'v' THEN 'VIEW'
        WHEN 'm' THEN 'MATERIALIZED VIEW'
        ELSE 'TABLE'
      END,
      obj.relname
    );
  END LOOP;

  -- Funciones y procedimientos: justo lo que pg-boss reemplaza con
  -- CREATE OR REPLACE en sus migraciones.
  FOR obj IN
    SELECT p.oid::regprocedure AS signature, p.prokind
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'pgboss'
  LOOP
    EXECUTE format(
      'ALTER %s %s OWNER TO presencia_jobs',
      CASE obj.prokind WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END,
      obj.signature
    );
  END LOOP;

  -- Tipos propios (el enum de estados del job). Los tipos fila de cada tabla y
  -- los tipos arreglo siguen a su dueño solos, por eso solo enum y dominio.
  FOR obj IN
    SELECT t.typname
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'pgboss'
      AND t.typtype IN ('e', 'd')
  LOOP
    EXECUTE format('ALTER TYPE pgboss.%I OWNER TO presencia_jobs', obj.typname);
  END LOOP;
END
$$;
--> statement-breakpoint

-- La separación: los roles de datos dejan de ver la cola.
REVOKE ALL ON ALL TABLES IN SCHEMA pgboss FROM presencia_app, presencia_worker;
--> statement-breakpoint
REVOKE ALL ON ALL SEQUENCES IN SCHEMA pgboss FROM presencia_app, presencia_worker;
--> statement-breakpoint
REVOKE ALL ON SCHEMA pgboss FROM presencia_app, presencia_worker;
--> statement-breakpoint

-- Y se desarman los ALTER DEFAULT PRIVILEGES cruzados de 0016: existían para
-- que el segundo rol heredara permisos sobre tablas creadas por el primero.
-- Con un dueño único ya no hay "segundo rol", y dejarlos sería configuración
-- muerta que miente sobre quién puede tocar la cola.
ALTER DEFAULT PRIVILEGES FOR ROLE presencia_app IN SCHEMA pgboss
  REVOKE ALL ON TABLES FROM presencia_worker;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE presencia_app IN SCHEMA pgboss
  REVOKE ALL ON SEQUENCES FROM presencia_worker;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE presencia_worker IN SCHEMA pgboss
  REVOKE ALL ON TABLES FROM presencia_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE presencia_worker IN SCHEMA pgboss
  REVOKE ALL ON SEQUENCES FROM presencia_app;
