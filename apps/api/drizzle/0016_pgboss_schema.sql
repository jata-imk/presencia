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

-- Cuál de los dos roles crea las tablas depende de quién arranque primero:
-- en dev es presencia_app (el worker corre dentro de la API, WORKER_INLINE) y
-- en prod será presencia_worker. Se cubren los dos sentidos para que el otro
-- rol pueda leer y escribir la cola en cualquier caso.
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
