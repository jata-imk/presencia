# ADR-021 · Métricas de publicación: un snapshot por post y día

**Decisión:** las métricas de una publicación viven en `post_metrics`, una fila por **post y día**, llaveada por `(user_id, network, platform_post_id, snapshot_date)`. _(La parte temporal de esa llave quedó superada por el addendum del 2026-09-20, al final: el día pasó a ser un bucket de ancho variable. Todo lo demás de abajo sigue vigente.)_ La card es una referencia opcional, no la llave. Cada fila guarda las métricas dos veces: normalizadas en columnas (`impressions`, `reach`, `likes`, `comments`, `shares`) y crudas en `raw`. `NULL` significa "la red no lo reportó" y nunca se traduce a `0`.

**Razón:** las tres partes de la llave están elegidas contra un modo de falla concreto.

- **No por card.** Un post puede existir en la red sin haber nacido en Presencia. Es el caso normal, no el raro: un creator que conecta sus cuentas trae un historial previo, y ese historial es la única forma de que Ritmo tenga algo que decir antes de que el usuario publique diez veces con nosotros. Atarlo a `publication_cards` haría que guardarlo exigiera una migración después, justo cuando ya hubiera usuarios.
- **No por cuenta conectada.** Dos motivos independientes. `social_account_id` es nullable —es `SET NULL`, para que desconectar no borre historial— y un `NULL` no colisiona en un índice único, así que el upsert insertaría una fila nueva en cada pase. Y la fila tampoco es estable: reconectar sin borrar reutiliza la misma (`claimConnectIntent` captura la violación de unicidad y reactiva), pero borrar la cuenta y volver a conectarla crea una nueva, y ahí el mismo post del mismo día se guardaría dos veces. `social_account_id` se conserva como dato, pero no identifica nada.
- **Un snapshot por día, no una fila viva.** Una fila que se sobrescribe pierde la velocidad, que es justo la señal: cuánto creció un post en sus primeras 24 h distingue el que funcionó del que no, y el total acumulado no. Guardar la serie completa por pase iría al otro extremo: las redes reportan con horas de retraso, así que cuatro pases diarios darían cuatro filas casi idénticas. El día es la granularidad a la que el dato cambia de verdad. El índice único hace que el segundo pase del mismo día actualice en vez de insertar — es el invariante que el DoD de F8.7 pide por nombre.

Las dos copias de las métricas siguen el criterio de `ai_usage_events`: lo derivado se recalcula, lo crudo no se recupera. Las columnas normalizadas son lo que comparten todas las redes y lo que Ritmo va a leer; `raw` guarda lo que cada red reporta además (retención de video, reacciones por tipo) y también el **motivo** cuando no hubo métricas, que es información y no ausencia de información.

`NULL ≠ 0` es decisión de producto, no de estilo. `reach: 0` es "nadie lo vio"; `reach: null` es "la red no lo reportó". Confundirlos haría que una recomendación de Ritmo promediara ceros inventados y le dijera al usuario que su mejor horario es el peor.

**Descartado:**

- **Una fila viva por card, actualizada in-place** — el mínimo posible y lo que pedía la lectura literal de "no duplicar filas". Pierde la curva de crecimiento y no puede recibir historial previo del creator.
- **Guardar `activity_by_hour`** (seguidores en línea por hora, que Upload-Post describe como _"the field to build a publishing schedule on"_) — verificado el 2026-09-17: ese endpoint **solo responde TikTok**, y Post for Me no lo tiene. Para LinkedIn, Facebook o X no existe. Los mejores horarios de F9 salen de nuestra propia tabla: hora de publicación cruzada con engagement. Funciona en toda red, no depende de que el proveedor lo regale, y es literalmente "la app aprende de tu historial" en vez de "la app repite lo que dice la red".
- **Una tabla por red, con las columnas de cada una** — las métricas comparables se vuelven joins, y agregar una red sexta sería una migración. `raw` cubre lo específico sin pagar eso.

**Lo que esta decisión NO cubre:** de dónde salen los números (el puerto `getPostMetrics` y sus adapters, ADR-009), cada cuándo se piden (ADR-008), ni cómo se muestran (F12). Tampoco el backfill del historial previo al conectar una cuenta: el modelo lo admite, pero traerlo depende del proveedor — hoy solo Post for Me expone el feed de la cuenta, no solo lo que se subió a través de él.

**Contexto:** F8.7, 2026-09-17. La fase existe porque la deuda de datos no se rebobina: cada semana en producción sin capturar métricas es historial que ninguna migración recupera. El diseño se cerró después de verificar las tres specs de máquina (Upload-Post, PostFast, Post for Me) y de sondear la API real de Upload-Post, que devolvió números para la Page de Facebook y errores explicativos para LinkedIn personal y X — el caso "publicó pero no hay métricas" es la norma, no la excepción, y por eso es de primera clase en el modelo.

## Addendum (2026-09-20) — la resolución deja de ser el día

**Decisión:** la llave temporal pasa de `snapshot_date` (un día) a `snapshot_at`, el inicio del **bucket** al que pertenece la medición, y el ancho del bucket lo decide la edad del post: 1 hora en las primeras 12, 6 horas hasta las 48, 1 día hasta los 14, 3 días hasta los 30. El cron del job pasa de cada 6 horas a cada hora.

**Qué estaba mal.** El ADR argumentaba bien por qué una fila viva pierde la velocidad, y después ponía el techo en el día sin justificarlo. Ese techo tenía una consecuencia que no estaba escrita: **la frecuencia de medición y la resolución de la serie podían divergir**. Medir un post ocho veces en su primer día costaba ocho requests contra la cuota del proveedor y guardaba un punto, el último — las otras siete sobrescribían la misma fila. Y al revés: subir la cadencia del job para bajar la latencia de la primera medición aumentaba el gasto sin aumentar el dato.

Con el bucket como llave las dos cosas son la misma: si el bucket de ahora no es el último medido hay un punto nuevo que guardar, y si es el mismo, no hay nada que pedir. **Cada request que se paga deja un punto.**

**Por qué una escalera y no un ancho fijo.** Un ancho fijo obliga a elegir entre resolución y costo para todo el historial. Un post hace casi todo en sus primeras horas: ahí un punto por hora vale lo que cuesta. A los diez días la curva es plana y un punto diario ya sobra. La escalera da ~35 puntos por post por ~35 mediciones, concentradas donde pasa algo.

**Por qué alineados al reloj UTC y no a la hora de publicación.** Dos motivos. Las series de dos posts distintos se pueden comparar y agregar (que es lo que F9 va a hacer para derivar mejores horarios), y dos pases que caen en el mismo bucket escriben la misma fila aunque hayan mirado posts distintos — el invariante del DoD sigue siendo verificable sin conocer la hora de publicación de cada post.

**Lo que esto le cuesta al presupuesto.** Nada, y es contraintuitivo: el cron horario no multiplica el gasto porque **la cadencia no decide cuántas veces se mide un post, su bucket sí**. Un post de cinco días vive en buckets diarios y lo saltan 23 de los 24 pases sin tocar la red. Lo que cambia es que el primer escalón de la escalera —el horario— ahora es alcanzable; con cron cada 6 h era una resolución que no se podía llenar.

**Contexto:** se decidió el 2026-09-20, con 3 filas en prod y 0 en dev. Hacerlo ahora es cambiar una tabla vacía; cada semana de espera es historia intradía que no existe y que ninguna migración recupera — el mismo argumento con el que nació la fase.
