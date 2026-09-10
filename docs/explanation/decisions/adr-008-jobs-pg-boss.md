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

Esa migración además ataca un problema que solo se ve al ejecutarlo: **pg-boss crea sus tablas como
el rol que conecta**, y ese rol no es el mismo en dev que en prod (ver el punto siguiente). Con
`ALTER DEFAULT PRIVILEGES FOR ROLE` en los dos sentidos, el otro rol hereda los permisos sin importar
quién llegó primero. Verificado en la primera corrida: las 12 tablas quedaron con owner
`presencia_app` y `presencia_worker` recibió sus 84 grants sin intervención.

**Pero resuelve los privilegios, no la propiedad — y eso es una decisión pendiente, no un detalle.**
Las migraciones internas de pg-boss (las que corren solas al arrancar con `migrate: true`) hacen DDL
de dueño: `CREATE OR REPLACE FUNCTION`, `ALTER TABLE ... ADD CONSTRAINT`, `ATTACH PARTITION`. Eso
exige ser **owner** del objeto, y ningún `GRANT` lo otorga. Hoy no muerde porque un solo rol instala y
usa la cola; el día que el contenedor `worker` arranque como `presencia_worker` contra estas tablas y
una versión más nueva de pg-boss quiera migrarlas, el arranque aborta con `must be owner of table
job`. **La fase de deploy tiene que elegir antes de introducir el segundo rol:** o un rol dueño único
para la cola (`presencia_jobs`) con el que pg-boss se conecte en todos los entornos, o `migrate:
false` en el runtime con las migraciones de pg-boss vendidas como migraciones nuestras
(`getConstructionPlans` / `getMigrationPlans`). Queda anotado también en el cuerpo de la migración.

**En dev el worker vive dentro del proceso de la API** (`WORKER_INLINE`, default `true`). No es
comodidad: `FakePublishingProvider` guarda los posts programados en un `Map` de instancia, así que un
worker en otro proceso tendría ese mapa vacío, `getPostStates` no reconocería ninguna ref y la
reconciliación marcaría como **fallida toda card programada**. Como el fake es el provider permanente
de dev (ADR-009), un worker separado rompería el flujo normal de trabajo de todos los días.

`worker.ts` existe igual desde este PR, porque la forma de prod es la del ADR (misma imagen, distinto
entrypoint) y no queremos descubrir en el deploy que nunca se ejercitó. El flag es lo único que
cambia entre las dos formas.

El default es `true` porque el único entorno que existe hoy es dev, pero **es el sentido peligroso
para prod**: un contenedor `app` desplegado sin la variable consumiría la misma cola que el
contenedor `worker`. Por eso los dos entrypoints lo dicen al arrancar — `main.ts` avisa que además
está consumiendo la cola, y `worker.ts` avisa si detecta que la API también la consume.

**Las colas se declaran con `policy: 'exclusive'` y `retryLimit: 0` por default**
(`BossService.registerRecurring`). Un job periódico no quiere reintento inmediato: el reintento es el
tick siguiente, y repetir al instante solo duplica la carga contra lo que acaba de fallar.

La policy sí tiene una trampa que vale la pena dejar escrita, porque la elección obvia es la
equivocada. `singleton` **no** sirve para un barrido periódico: limita los jobs _activos_, no los
encolados, así que si un pase tarda cinco minutos los cinco ticks de por medio se acumulan en
`created` y se ejecutan todos seguidos al terminar. `exclusive` permite como mucho un job existiendo,
encolado o activo, así que el tick que cae sobre un pase en curso **se descarta**. Eso es lo que hace
un `pg_try_advisory_lock` cuando no consigue el lock, y la razón por la que ese lock no aparece en
este código.

Y un detalle de pg-boss que muerde en silencio: `createQueue` es un `INSERT ... ON CONFLICT DO
NOTHING`. Sobre una cola que ya existe, las opciones **se ignoran sin avisar**. Por eso
`registerRecurring` llama `updateQueue` después (para que un cambio de `retryLimit` en el código
llegue a la base) y compara la `policy` contra `getQueue`, que es lo único que `updateQueue` no puede
cambiar: si divergen, lo grita en los logs en vez de dejar el cron portándose raro.

**Dependencia fijada, y por qué.** `pg-boss@12.25.0` exacto, y `pg` fijado a `8.22.0` con un override
del workspace. Las versiones nuevas de pg-boss piden `pg@^8.23.0`, y `pg@8.23.0` está publicado roto:
declara `pg-protocol@^1.16.0`, que no existe en el registry. Se puede soltar el pin cuando lo
publiquen.

**Lo que este PR NO hace:** no agrega ningún job. Solo el runtime, para que el primer job se lea
después como un job y no como "un job más un runtime".

## Addendum (2026-09-08, F8 PR2) — el primer job

`cards.reconcile`, cron `* * * * *`. La lógica vive entera en `CardsService.reconcileAll`; `CardsJobs` solo la agenda — el job es el disparador y nada más (ver el addendum de F8 en ADR-009 por lo que sí cambió del pase).

**Por qué cada minuto y no algo más espaciado:** cuando no hay nada vencido el pase cuesta **una query y cero red** (el proveedor solo se consulta si hay refs que resolver), así que la cadencia la fija la latencia que queremos, no el costo. Una card publicada aparece como tal dentro del minuto siguiente a que se cumpla el margen de gracia de 2 minutos.

**Los jobs se declaran en un solo lugar** (`jobs/scheduled-jobs.module.ts`), que importan los dos entrypoints: `worker.ts` siempre y `main.ts` solo con `WORKER_INLINE`. Tener la lista duplicada era la forma más fácil de terminar con el worker y la API corriendo jobs distintos sin que nadie lo notara.

**El registro va en `OnApplicationBootstrap`, no en `OnModuleInit`:** pg-boss tiene que haber arrancado —lo hace en el `OnModuleInit` de `BossService`— antes de que se pueda crear una cola.

## Addendum (2026-09-08, F8 PR3) — el segundo job, y el patrón que ya se repite

`credits.cycle`, cron diario. El detalle contable está en el addendum de ADR-012; lo que interesa acá es que los dos jobs terminaron con la misma forma, y conviene nombrarla antes de que llegue el tercero:

**Enumerar → iterar con `try/catch` por unidad → contar fallos → relanzar al final.** El `try/catch` existe para que el fallo de un usuario no deje sin atender a los demás; el relanzado, para que el pase no mienta sobre cómo le fue. Sin él, pg-boss registra `completed` y un fallo durable se repite en cada corrida sin más señal que un log que en el servidor nadie está mirando.

**Y una consecuencia de haberlos escrito: un job global es difícil de probar contra una base compartida.** Los dos casos aparecieron solos. El de cards habría marcado como fallidas las cards de otros specs corriendo en paralelo; el de créditos se comió su timeout esperando advisory locks de usuarios que otros specs estaban usando. La salida no es subir el timeout: es probar las piezas con reglas (el colector, el cálculo, la idempotencia) y dejar fuera el bucle, que no las tiene.

## Addendum (2026-09-09, F8 seguimiento) — dos ajustes de operación

Del review sobre el rango completo, lo que toca a los jobs y no a la reconciliación:

**Un fallo al agendar ya no tumba el arranque de la API.** Con `WORKER_INLINE` el módulo de jobs cuelga de `AppModule`, así que una excepción en `onApplicationBootstrap` abortaba `NestFactory.create` y la API entera se negaba a levantar. El caso real no es hipotético: arrancar `pnpm dev` con el túnel al VPS todavía abajo. Ahora se registra el error y la API sigue viva sin cron — el disparador perezoso cubre mientras tanto, que es exactamente para lo que se dejó.

**El pase de créditos ya no espera locks.** Tomaba `pg_advisory_xact_lock` bloqueante por usuario: uno solo atrapado detrás de un request largo atrasaba a todos los demás del pase, y si el pase cruzaba su `expireInSeconds`, pg-boss lo daba por muerto y podía arrancar un segundo pase concurrente — el mismo peligro que documenta `RecurringJob.expireInSeconds`. Ahora usa `pg_try_advisory_xact_lock` y se salta al usuario ocupado. No cuesta nada: el pase de mañana lo agarra, y si el usuario entra antes, la ruta perezosa se lo resuelve en el acto.
