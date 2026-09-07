-- Schema de la cola de jobs (F8, ADR-008). pg-boss administra sus TABLAS
-- (arranca con migrate:true y las versiona con la librería), pero el schema
-- que las contiene lo crea una migración: crear schemas es DDL, y la DDL vive
-- acá (ADR-013). Por eso el runtime corre con createSchema:false.
--
-- Sin RLS a propósito (modelo-de-datos.md): `pgboss` no es superficie de la
-- API ni guarda datos de tenant. La regla es la otra: los payloads llevan
-- user_id explícito y el worker lo fija con SET LOCAL en SU transacción.
CREATE SCHEMA IF NOT EXISTS pgboss;
--> statement-breakpoint

GRANT ALL ON SCHEMA pgboss TO presencia_app, presencia_worker;
--> statement-breakpoint

-- Los dos roles de runtime pueden LEER Y ESCRIBIR la cola sin importar cuál
-- de los dos creó las tablas: quien las crea es quien arranca primero (en dev
-- presencia_app, porque el worker corre dentro de la API con WORKER_INLINE; en
-- prod sería presencia_worker).
--
-- OJO en el deploy: ALTER DEFAULT PRIVILEGES FOR ROLE exige que el rol que
-- corre la migración sea MIEMBRO de ese rol. En dev el owner es el superuser
-- del compose/VPS y no hay problema; presencia_migrator necesitará
-- `GRANT presencia_app, presencia_worker TO presencia_migrator`.
ALTER DEFAULT PRIVILEGES FOR ROLE presencia_app IN SCHEMA pgboss
  GRANT ALL ON TABLES TO presencia_worker;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE presencia_app IN SCHEMA pgboss
  GRANT ALL ON SEQUENCES TO presencia_worker;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE presencia_worker IN SCHEMA pgboss
  GRANT ALL ON TABLES TO presencia_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE presencia_worker IN SCHEMA pgboss
  GRANT ALL ON SEQUENCES TO presencia_app;

-- LO QUE ESTO **NO** RESUELVE, Y HAY QUE DECIDIR ANTES DEL PRIMER DEPLOY:
-- privilegios no son propiedad. Las migraciones internas de pg-boss (corren
-- solas al arrancar, `migrate: true`) hacen DDL de dueño — CREATE OR REPLACE
-- FUNCTION, ALTER TABLE ... ADD CONSTRAINT, ATTACH PARTITION — y eso exige ser
-- OWNER del objeto, cosa que ningún GRANT otorga.
--
-- Hoy no muerde porque un solo rol (presencia_app) instala y usa la cola. En el
-- momento en que el contenedor `worker` arranque como presencia_worker contra
-- estas tablas y una versión más nueva de pg-boss quiera migrarlas, el arranque
-- va a abortar con `must be owner of table job`. La fase de deploy tiene que
-- elegir una de dos y dejarla escrita en ADR-008:
--   a) un rol dueño único para la cola (p.ej. presencia_jobs) con el que se
--      conecte pg-boss en TODOS los entornos, o
--   b) `migrate: false` en el runtime y las migraciones de pg-boss vendidas
--      como migraciones nuestras (PgBoss.getConstructionPlans / getMigrationPlans).
