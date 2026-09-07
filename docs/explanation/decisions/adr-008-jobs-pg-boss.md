# ADR-008 · Jobs programados: pg-boss sobre Postgres

**Decisión:** pg-boss como job queue (tendencias de Ritmo, agregación de horarios, resets de créditos, procesamiento Telegram). Worker = misma imagen Docker que la app, distinto entrypoint.

**Razón:** Postgres como base Y cola = menos piezas móviles. Reintentos + visibilidad que un crontab no da.

**Descartado:**

- Crontab de Linux — frágil.
- BullMQ + Redis — migración futura solo si el volumen lo pide.

**Nota:** la publicación programada NO es cron propio — la hace PostFast vía su API (ver [ADR-009](./adr-009-publicacion-postfast-adapter.md)).

## Addendum (2026-09-07, F8 PR1) — el runtime, y lo que el ADR original daba por hecho

Primera implementación real. Tres cosas que el ADR de 13 líneas de arriba no decía, y que resultaron
decisiones y no detalles.

**El schema `pgboss` lo crea una migración, no pg-boss.** La línea de `modelo-de-datos.md` decía que
"pg-boss crea y administra su propio schema". Administra sus **tablas** (arranca con `migrate: true` y
las versiona con la librería), pero crear el schema es DDL, y la DDL vive en migraciones (ADR-013).
El runtime corre con `createSchema: false` contra el schema que dejó `0016_pgboss_schema`.

Esa migración además resuelve un problema que solo se ve al ejecutarlo: **pg-boss crea sus tablas como
el rol que conecta**, y ese rol no es el mismo en dev que en prod (ver el punto siguiente). Con
`ALTER DEFAULT PRIVILEGES FOR ROLE` en los dos sentidos, el otro rol hereda los permisos sin importar
quién llegó primero. Verificado en la primera corrida: las 12 tablas quedaron con owner
`presencia_app` y `presencia_worker` recibió sus 84 grants sin intervención.

**En dev el worker vive dentro del proceso de la API** (`WORKER_INLINE`, default `true`). No es
comodidad: `FakePublishingProvider` guarda los posts programados en un `Map` de instancia, así que un
worker en otro proceso tendría ese mapa vacío, `getPostStates` no reconocería ninguna ref y la
reconciliación marcaría como **fallida toda card programada**. Como el fake es el provider permanente
de dev (ADR-009), un worker separado rompería el flujo normal de trabajo de todos los días.

`worker.ts` existe igual desde este PR, porque la forma de prod es la del ADR (misma imagen, distinto
entrypoint) y no queremos descubrir en el deploy que nunca se ejercitó. El flag es lo único que
cambia entre las dos formas.

**Las colas se declaran con `policy: 'singleton'` y `retryLimit: 0` por default**
(`BossService.registerRecurring`). Un job periódico no quiere reintento inmediato: el reintento es el
tick siguiente, y repetir al instante solo duplica la carga contra lo que acaba de fallar. El
`singleton` es lo que impide que dos pases se pisen cuando uno tarda más que su intervalo — el
equivalente al `pg_try_advisory_lock` que haría falta con un `setInterval` dentro del proceso web, y
la razón por la que ese lock **no** aparece en este código.

**Dependencia fijada, y por qué.** `pg-boss@12.25.0` exacto, y `pg` fijado a `8.22.0` con un override
del workspace. Las versiones nuevas de pg-boss piden `pg@^8.23.0`, y `pg@8.23.0` está publicado roto:
declara `pg-protocol@^1.16.0`, que no existe en el registry. Se puede soltar el pin cuando lo
publiquen.

**Lo que este PR NO hace:** no agrega ningún job. Solo el runtime, para que el primer job se lea
después como un job y no como "un job más un runtime".
