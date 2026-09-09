# ADR-009 · Publicación: PostFast detrás de patrón adapter

**Decisión:** Interfaz propia `PublishingProvider`; `PostFastProvider` como implementación (REST/MCP de postfa.st).

**Razón:** Depender de una API indie es single point of failure. No casarse con el proveedor.

**Implicación de posicionamiento:** el valor de Presencia NO puede estar en programar/publicar (eso es commodity que PostFast revende por ~€10/mes). El valor está exclusivamente en la capa conversacional + cultural que ponemos encima.

## Addendum (2026-08-15) — implementación (F6 PR1: adapter + canales)

- **Interfaz** (`apps/api/src/publishing/publishing.provider.ts`): `listAccounts`, `createConnectLink`, `schedule`, `cancel`, `getPostStates`. Vocabulario 100% nuestro — ni `pf-api-key`, ni `socialMediaId`, ni `PUBLISHED` en mayúsculas cruzan la frontera. `PostFastProvider` implementa contra la referencia pública de `postfa.st/docs.md` (verificada 2026-08-15): base `https://api.postfa.st`, header `pf-api-key`, `POST /social-posts`, `DELETE /social-posts/:id`, `GET /social-posts`, `GET /social-media/my-social-accounts`, `POST /social-media/connect-link`. **No hay webhooks** — confirmar "publicado" es responsabilidad nuestra (polling), no de PostFast.
- **`FakePublishingProvider` no es andamio temporal**: es el provider permanente de dev/test (`PUBLISHING_PROVIDER=fake`, default). Solo se usa `postfast` real con `POSTFAST_API_KEY` cargada — `env.ts` falla fail-fast si se pide `postfast` sin key.
- **Decisión de tenant:** la API key de PostFast es por WORKSPACE, no por usuario final — un solo workspace global de Presencia. El aislamiento entre usuarios de Presencia lo da nuestro RLS, nunca PostFast (que ve todas las cuentas del workspace sin distinguir dueño). `social_accounts.provider_ref` tiene un **índice único global** (no por usuario) — es la defensa real contra que dos tenants reclamen la misma cuenta de PostFast; Postgres lo hace cumplir incluso cuando RLS le esconde la fila existente al segundo tenant (verificado en `rls.spec.ts`).
- **Conectar un canal es un diff, no una lectura directa:** como el workspace es compartido, "tus cuentas conectadas" no puede ser "las cuentas del workspace". `ChannelsService.createConnectIntent` guarda una foto de qué `providerRef` ya existían antes de mandar al usuario a postfa.st (`social_connect_intents.known_account_refs`, TTL 30 min); al volver, `claimConnectIntent` vuelve a listar y atribuye al usuario las refs que son NUEVAS respecto a esa foto.
- **Límite conocido, documentado y no resuelto en F6:** si dos usuarios abren su flujo de conexión casi al mismo tiempo y ambos conectan una cuenta antes de que cualquiera reclame, el diff puede atribuir la cuenta al usuario equivocado — el índice único evita que se la "roben" de un tercero ya dueño, pero no resuelve la ambigüedad entre dos cuentas nuevas simultáneas. Un lock verdadero necesitaría leer intents de OTROS tenants, que RLS impide por diseño (`current_setting('app.user_id')` exige tenant fijado para cualquier query, incluida una de solo lectura cross-tenant); implementarlo pediría `BYPASSRLS`, que `modelo-de-datos.md` prohíbe "por comodidad". Con Presencia pre-lanzamiento y solo-founder, el riesgo real es bajo — se documenta en vez de construir infraestructura que la arquitectura de RLS no soporta limpiamente.
- **Reconectar una cuenta ya nuestra NO pasa por el diff.** Una vez que un `providerRef` entra a un snapshot, sigue apareciendo en todos los siguientes mientras la cuenta exista en PostFast — nunca vuelve a calificar como "nueva". Por eso `disconnectAccount` (solo oculta del lado de Presencia, no revoca nada en PostFast) y `reactivateAccount` son directos: no autorizan nada de nuevo, solo cambian el `status` local.

## Addendum (2026-08-15) — implementación (F6 PR2: ciclo de vida de la card)

- **`CardsService`** (`apps/api/src/cards/cards.service.ts`) implementa las transiciones sobre `publication_cards` que ya existían en el schema desde F0: `draft → scheduled` (programar), `scheduled → scheduled` (reprogramar), `failed → scheduled` (reintentar tras un fallo del proveedor), `scheduled → draft` (cancelar programación — decisión de producto, `presencia-chat.md`: el contenido sigue siendo útil; el valor `canceled` del enum queda reservado para descartar una card en Biblioteca, fuera de F6). Cualquier otra transición es 409.
- **`social_account_id`** (migración `0011_cards_social_account`, nullable, FK `social_accounts.id` `ON DELETE SET NULL`) — completa la relación que el ER de `modelo-de-datos.md` ya documentaba (`publication_cards }o--|| social_accounts`) pero el schema no tenía. Se fija al programar, nunca antes.
- **PostFast no tiene update de post:** reprogramar es `cancel(providerRef viejo)` + `schedule(nuevo)`, siempre con nuevo `providerRef`. Si el `cancel` real falla, se sigue igual con el nuevo horario (best-effort, logueado) — el objetivo del usuario es reprogramar, no bloquearse; hueco conocido: PostFast puede terminar con dos posts si esto pasa.
- **Invariante DB↔PostFast, dos transacciones:** `markScheduling` dentro de la primera transacción deja `provider_ref = NULL` a propósito; solo se llena en una segunda transacción (`attachProviderRef`) si la llamada al proveedor tuvo éxito. Si falla, la card vuelve a `draft` con el motivo en `error_detail` — nunca se queda "scheduled" apuntando a nada.
- **Reconciliación perezosa** (`CardsService.reconcileDueCards`), mismo patrón que `CreditsService.ensureCurrentCycle` (F5): se dispara al listar cards de un chat, con cooldown de 60s por usuario en memoria de proceso (no hay pg-boss hasta F8; una sola instancia hoy, así que esto basta). Dos casos:
  1. **Huérfanas** — `scheduled` sin `provider_ref` y con más de 2 min sin tocarse: el proceso murió entre las dos transacciones de arriba. Se cierran directo como `failed`, sin preguntarle nada a PostFast (no hay nada que preguntar).
  2. **Debidas** — `scheduled`, con `provider_ref`, cuya `scheduled_at` ya pasó hace más de 2 min (margen de gracia para que PostFast de verdad publique): se pregunta en batches de hasta 100 refs (límite del proveedor) y se mapea `PUBLISHED → published`, `FAILED` o ausente → `failed`.
  3. F8 solo cambia el disparador (cron en vez de "alguien listó sus cards"), no esta lógica.

## Addendum (2026-08-19) — correcciones tras probar con PostFast real

Probando F6 con la API key real de Jose salieron dos incidentes que corrigen afirmaciones de los addenda de arriba — quedan documentados acá para que nadie vuelva a asumir lo viejo.

- **`postfa.st/docs.md` (el .md combinado, línea 11 de arriba) NO alcanza para verificar shapes de respuesta — no trae ejemplos de response.** El shape real de `POST /social-posts` se había inferido como `{data:[{id,status}]}` (consistente con `GET /social-posts`) y resultó ser **`{postIds: string[]}`** — un array de UUIDs, nada más. La inferencia causó un incidente real: PostFast creó y programó un post de verdad, pero `PostFastProvider.schedule()` no encontró el `id` donde lo esperaba, y `CardsService.schedule()` (ver abajo, versión vieja) trató eso como "no pasó nada" — la card volvió a `draft`, perdiendo el único rastro de un post real y externo. Corregido con el shape real confirmado contra `postfa.st/docs/posts/create` (la página HTML específica, no el .md). **Regla desde ahora:** verificar contra las páginas HTML de `postfa.st/docs/<sección>/<endpoint>` (índice en `postfa.st/docs`) y `postfa.st/api-guides/<red>/<tema>` para quirks por plataforma — nunca confiar solo en el .md combinado.
- **La frase de arriba "si falla, la card vuelve a `draft`... nunca se queda 'scheduled' apuntando a nada" ya no es la regla completa.** `CardsService.schedule()` ahora distingue `classifyScheduleFailure()`: **rechazo explícito** del proveedor (4xx/429, `PublishingRejectedError`/`PublishingRateLimitError`) → sigue yendo a `draft`, confiado en que no se creó nada. **Fallo ambiguo** (5xx, error de red, o un 2xx que no se pudo interpretar — exactamente el incidente de arriba) → va a **`failed`**, no a `draft`, preservando `scheduledAt`/`socialAccountId`/`providerRef` como rastro (mismo criterio que ya usaba `reconcileDueCards` para huérfanas — antes esa era la única ruta consistente, el catch de `schedule()` la contradecía). El mensaje al usuario avisa explícito de revisar PostFast antes de reintentar, para no arriesgar un post duplicado (PostFast no tiene idempotency key, confirmado en su doc).
- **`PublishingUnavailableError` ahora expone `.detail`** (antes solo `cause`, sin propiedad pública) — simétrico con `PublishingRejectedError`. Necesario para que el body crudo del proveedor sobreviva hasta `error_detail` en la DB y un `console.error` nuevo en el catch — antes se perdía en los tres lugares (DB, HTTP response, logs).
- **`ProviderAccount` gana `connected: boolean`** (`PostFastProvider.listAccounts` lo mapea de `connectionStatus === "CONNECTED"`). Corrige el addendum de arriba: `GET /social-media/my-social-accounts` **NO omite** cuentas con token revocado, las sigue listando con `connectionStatus:"DISABLED"` — `reactivateAccount` y el self-heal de `claimConnectIntent` (ver siguiente punto) ahora exigen `connected`, no solo presencia en la lista. Verificado contra `postfa.st/docs/accounts/list`.
- **"Reconectar una cuenta ya nuestra NO pasa por el diff" (línea de arriba) sigue siendo cierto solo cuando el token sigue vivo.** Si de verdad se revocó (`reactivateAccount` rechaza con 409), el camino de recuperación real SÍ es reautorizar en postfa.st desde "Conectar red" — pero `claimConnectIntent` original asumía que cualquier choque de `providerRef` era "otro tenant ganó la carrera" (línea de arriba sobre el índice único) y lo ignoraba en silencio, incluso cuando el choque era con la PROPIA fila `disconnected` del usuario. Corregido: el catch relee por `providerRef` dentro de la misma tx (RLS decide: visible = mía → reactivar; invisible = de otro tenant → ignorar, comportamiento original intacto). El insert conflictivo corre en un SAVEPOINT (`tx.transaction` anidado) — un `unique_violation` deja la transacción de Postgres "aborted", cualquier query después (incluida la relectura) truena con `25P02` si no se aísla así.
- **Cuentas desconectadas ya no se mezclan con las activas.** `ChannelsService.listAccounts` excluye `status:"disconnected"` (viven en `listDisconnectedAccounts`, vista aparte en el frontend) — y se agregó borrado permanente real (`deleteAccount`, `DELETE /channels/:id/permanent`), mismo guard que `ChatService.deleteChat`: rechaza si hay una card `scheduled` apuntando a esa cuenta (`CardsRepository.hasScheduledCardsForAccount`).

## Addendum (2026-09-06, F7.5 PR1) — el puerto no tenía scope de usuario

F7.5 conecta un segundo proveedor (Upload-Post) por dos motivos concretos: la cuenta de PostFast de Jose se quedó sin suscripción y devuelve `subscription.required` en cada llamada — no se puede probar publicación real —, y Upload-Post es gratuito. Pero el valor real de la fase es otro: **es la primera vez que esta abstracción se ejercita con un proveedor que no la inspiró**, y no aguantó tal cual.

**Lo que no encajaba.** `listAccounts()` y `createConnectLink({expiryDays})` no recibían a QUIÉN pertenecen las cuentas. Eso no era una omisión: era el workspace único de PostFast filtrándose al puerto. Upload-Post tiene un **perfil por usuario** (`POST /uploadposts/users`), así que `listAccounts` tiene que saber de qué perfil hablamos, y no hay forma de expresarlo con la firma vieja.

**El cambio.** El puerto gana un `WorkspaceRef` opaco y un método para resolverlo:

```ts
ensureWorkspace(userId: string): Promise<WorkspaceRef>;
listAccounts(ws: WorkspaceRef): Promise<ProviderAccount[]>;
createConnectLink(input: { ws: WorkspaceRef }): Promise<{ connectUrl: string; expiresAt: Date }>;
```

`ensureWorkspace` es idempotente y **puede hacer red** (con Upload-Post crea el perfil si falta), así que `ChannelsService` lo llama siempre fuera de `runWithTenant`. PostFast lo implementa devolviendo una constante sin tocar la red, e ignora el `WorkspaceRef` que recibe: su API key ya determina el único workspace que existe.

**Por qué `schedule`, `cancel` y `getPostStates` NO llevan `WorkspaceRef`.** No es un olvido ni una mitad del refactor: los tres ya llegan con la información que necesitan, y agregarles el scope sería ruido.

- `schedule` recibe `accountProviderRef`, que es el id de la cuenta **dentro** del proveedor. En PostFast es el `socialMediaId`; en Upload-Post es `` `${perfil}:${plataforma}` `` — el adapter lo parsea y saca de ahí tanto el `user` como el `platform[]` del upload. La cuenta ya implica el perfil.
- `cancel` y `getPostStates` operan sobre ids de post (`job_id` en Upload-Post). Los endpoints que los atienden — `DELETE /uploadposts/schedule/{job_id}`, `GET /uploadposts/schedule`, `GET /uploadposts/history` — están scopeados por la API key y **no aceptan un parámetro de perfil**: el `job_id` ya es único en toda la cuenta.

La regla que sale de esto: el scope se pide solo donde el proveedor lo exige para **descubrir** cosas (qué cuentas hay, a dónde mandar al usuario a conectar). Donde el caller ya trae un identificador emitido por el proveedor, ese identificador es el scope.

**Consecuencia sobre el diff de `social_connect_intents`.** El diff antes/después sigue siendo el mecanismo — funciona con cualquier proveedor — pero deja de ser _la única forma posible_: con un proveedor de perfiles, `listAccounts(ws)` ya devuelve solo las cuentas de ese usuario y el diff pasa a ser correcto-pero-innecesario. Se mantiene un solo camino a propósito (YAGNI): bifurcar `ChannelsService` por capacidad del proveedor sería exactamente el tipo de fuga que este puerto existe para evitar. El límite de atribución cruzada documentado más arriba es, entonces, **un límite de PostFast**, no del dominio.

**`expiryDays` sale del puerto.** El JWT de conexión de Upload-Post dura 48 h fijas: no es un parámetro que todo proveedor deje elegir. El puerto ahora devuelve el `expiresAt` resultante y cada adapter decide su política (PostFast conserva sus 7 días, ahora como constante privada suya). El TTL de 30 min del `connect_intent` es independiente y no cambia: acota cuánto vale el snapshot `known_account_refs`, no la vigencia del link.

**Lo que este PR NO hace:** no agrega el adapter de Upload-Post (PR2), ni `reschedule` (PR3), ni `post_url` (PR4). Es solo el puerto, para que el adapter nuevo se lea después como "un adapter más" y no como "un adapter más un refactor del puerto".

## Addendum (2026-09-06, F7.5 PR2) — `UploadPostProvider`, y lo que la API real desmintió

Segundo adapter detrás del mismo puerto. `PUBLISHING_PROVIDER` ahora acepta `fake | postfast | upload_post`, cada uno con su propia key exigida al boot por el `superRefine` de `env.ts`. Base `https://api.upload-post.com/api` (el `/api` es parte de la base: todas las rutas cuelgan de ahí), auth `Authorization: Apikey <KEY>` — **no** Bearer.

**El mapeo, método por método.** `ensureWorkspace` → `GET /uploadposts/users/{username}` y, solo si da 404, `POST /uploadposts/users` (ver más abajo por qué en ese orden); `listAccounts` → `GET /uploadposts/users/{username}`; `createConnectLink` → `POST /uploadposts/users/generate-jwt` (48 h fijas, `language:"es"` forzado por la regla dura #1); `schedule` → `POST /upload_text` multipart; `cancel` → `DELETE /uploadposts/schedule/{job_id}`; `getPostStates` → `GET /uploadposts/schedule` + `GET /uploadposts/history`.

**El perfil se deriva, no se persiste.** `username = presencia-<users.id>`. Sin columna nueva ni migración: el mismo usuario siempre resuelve al mismo perfil, y `ensureWorkspace` es idempotente contra el 409. `social_accounts.provider_ref` guarda `` `${perfil}:${plataforma}` ``, que es globalmente único (el índice único global sigue válido) y le da a `schedule()` el `user` y el `platform[]` sin necesitar un parámetro nuevo en el puerto.

### Tres cosas que solo se supieron llamando a la API de verdad

La spec de máquina alcanzó para diseñar, pero no para tener razón. Verificado contra la cuenta real de Jose el 2026-09-06:

1. **`GET /uploadposts/status` NO devuelve `post_url`**, al revés de lo que decía el ticket que abrió esta fase. Devuelve `{status, results:[{platform, success, message, upload_timestamp}]}`. La URL del post vive en `GET /uploadposts/history` → `HistoryItem`, que sí trae `job_id`, `post_url`, `platform_post_id` y `error_message`. Por eso `getPostStates` **no usa `/status`**: resuelve el batch entero con dos llamadas (`/schedule` para los que siguen en cola, `/history` para los que ya corrieron) en vez de una por ref, y de paso deja `post_url` a mano para PR4. Confirmado con un post real: `post_url` = `https://www.facebook.com/<page>_<post>`.

2. **La respuesta de `/history` trae un `in_progress` que el openapi no documenta.** Son los jobs que ya dispararon pero siguen subiendo: no están en `/schedule` (salieron de la cola) ni todavía en `history` (no terminaron). Sin mirarlo, `getPostStates` los habría omitido y `reconcileDueCards` habría marcado como **fallida una publicación viva** — el peor error posible de esta capa, y uno que ningún test contra la spec habría encontrado. Como su forma tampoco está documentada, el adapter acepta tanto un array de job_ids sueltos como uno de objetos con `job_id`.

3. **La pregunta abierta del ticket ("no encontré forma documentada de saber si el token expiró") tiene respuesta:** `social_accounts[plataforma].reauth_required`. El shape real confirma además lo que el openapi declaraba como un `oneOf` incómodo: el valor es un objeto (`username`, `handle`, `display_name`, `social_images`, `reauth_required`) cuando la cuenta está conectada, y un **string vacío** cuando la conexión quedó a medias. Igual que en PostFast, esas cuentas **no se omiten**: se listan con `connected:false`.

### Dos consecuencias en código común

**El cliente HTTP se compartió.** `ProviderHttpClient` (`publishing/http-client.ts`) concentra la traducción de códigos a errores de dominio: 429 → `PublishingRateLimitError`, 5xx y error de red → `PublishingUnavailableError`, otro 4xx → `PublishingRejectedError`. Eso **es un concepto del puerto**, no un detalle de cada adapter (regla dura #5): es la distinción que decide si una card vuelve a `draft` o se queda en `failed`, y tenerla duplicada en dos archivos casi idénticos era garantía de que se desincronizaran. Lo que cada adapter conserva es lo suyo: cómo se autentica (`pf-api-key` vs `Authorization: Apikey`) y los shapes. `buildPostText` también salió a su propio módulo, por lo mismo.

**El snapshot del `connect_intent` ahora guarda solo las cuentas conectadas.** Antes guardaba todas. Con PostFast casi no se notaba, porque sus `providerRef` son ids por cuenta y el self-heal de `claimConnectIntent` rescataba el caso. Con Upload-Post era un agujero real: el `providerRef` es `perfil:plataforma`, o sea que **existe desde que la plataforma aparece como clave** en `social_accounts` — incluso con la conexión a medias, que el proveedor representa con string vacío (visto en la cuenta real: `tiktok: ""`). Sin el filtro, un usuario que reintenta una conexión que falló a la mitad se quedaba sin poder conectar esa red **nunca**: el ref no cambia, el diff no ve nada nuevo, y como no hay fila local tampoco existe "Reconectar" para recuperarla.

La regla que sale, tercera cara de la lección de PostFast: el `.md` combinado no bastaba, las páginas HTML de Upload-Post tampoco (no mencionan PATCH ni DELETE de programados), el `openapi.json` sí — **leído entero**, porque `components.schemas` está al final y es lo primero que se pierde en un resumen — y ni así alcanza: `in_progress` solo apareció llamando al endpoint.

### Límites conocidos y aceptados

- **Una cuenta por red y por perfil.** `social_accounts` viene keyed por plataforma, así que un perfil no puede tener dos LinkedIn. PostFast sí lo admite. No afecta a V1 (solo-founder).
- **Solo texto, y solo en cuatro redes.** `POST /upload_text` acepta linkedin, x, facebook y threads de las nuestras; instagram, tiktok y youtube exigen media. Ese corte **no es el mismo** que el de `CardsService.assertHasMedia`, y conviene no confundirlos: aquel rechaza esas tres redes solo cuando la card viene **sin assets**, así que una card de Instagram **con** imagen lo pasa y llega hasta el adapter. Ahí se rechaza igual, pero el mensaje dice lo que de verdad pasa — subir el archivo al proveedor es trabajo de F10/F11 —, no "te falta una imagen", que sería mentirle al usuario justo cuando sí la tiene.
- **Facebook con más de una página conectada.** `POST /upload_text` documenta `facebook_page_id` como requerido cuando la plataforma incluye facebook, y lo auto-detecta solo si hay **una** página. El puerto no tiene por dónde pasar una, así que un usuario con dos o más páginas verá rechazado cada programado a Facebook (→ `resetToDraft`). Falla ruidosamente, no en silencio, pero es un caso sin resolver.
- **`getPostStates` pagina `/history` hasta 5 páginas de 100.** No hay filtro por `job_id`; se pagina de más reciente a más viejo. Los dos endpoints están scopeados por API key y no por perfil, así que devuelven jobs de todos los usuarios — no hay fuga (solo se mira lo que matchea con los refs que el caller ya trae de sus propias cards), pero sí un riesgo: como el orden es por recencia **global**, con varios usuarios activos el item de una card puede quedar más allá del tope. Por eso, si al agotar las páginas quedan refs sin resolver **y** el `total` dice que el historial se cortó antes del final, esos refs se reportan como `scheduled` en vez de omitirse: "no lo vi" no es "no existe", y omitirlos haría que `reconcileDueCards` marcara como fallida una publicación real. El siguiente pase vuelve a preguntar.
- **El plan gratis da 2 perfiles**, y un perfil por usuario de Presencia significa 2 usuarios. Sirve para validar, no para producción. Con el tope alcanzado, `POST /uploadposts/users` responde **403 con el body vacío** (verificado contra la cuenta real): sin traducirlo, el segundo usuario que intentara conectar vería un `Upload-Post rechazó la solicitud (403)` que no explica nada, así que `ensureWorkspace` lo convierte en un mensaje que se entiende.
- **El 409 de "el perfil ya existe" resultó ser una suposición equivocada**, y costó un incidente. Ver el addendum de PR2.1.

## Addendum (2026-09-06, F7.5 PR2.1) — incidente: preguntar antes de crear el perfil

`ensureWorkspace` creaba el perfil de entrada y toleraba el `409` que, según el openapi de Upload-Post, significa "ya existe". PR2 dejó anotado que ese 409 **no se había podido confirmar** contra la API real. Se confirmó a las pocas horas, y resultó falso.

**Qué pasó.** Jose conectó LinkedIn y Facebook: dio "Conectar red" (el perfil se creó bien), reinició el server, y al volver y dar "Ya conecté mi cuenta" recibió un 500. En los logs:

```
PublishingRejectedError: No se pudo crear tu perfil en Upload-Post...
  at UploadPostProvider.ensureWorkspace
  at async ChannelsService.claimConnectIntent
detail: { status: 403, body: { error_code: 'PROFILE_LIMIT_REACHED',
                               current_profiles: 2, profile_limit: 2 } }
```

**Por qué.** Tres cosas se alinearon:

1. La memoización de `ensuredProfiles` vive **en memoria del proceso**, así que el reinicio la borró.
2. Sin memo, el segundo paso del flujo de conexión volvió a intentar crear un perfil que **ya existía**.
3. **Upload-Post evalúa el límite del plan ANTES de "ya existe"**: con los perfiles llenos responde `403 PROFILE_LIMIT_REACHED` aunque el perfil que pides sea tuyo y exista. El `409` nunca llega en ese caso.

El resultado era un callejón sin salida: el usuario tenía sus redes conectadas del lado del proveedor y ninguna forma de confirmarlas del nuestro.

**El arreglo: `ensureWorkspace` PREGUNTA antes de crear.** `GET /uploadposts/users/{username}` (200 = existe, 404 = no) y solo se crea cuando de verdad falta. Parece un viaje de red de más y es lo contrario: "crear y tolerar el conflicto" depende de que el proveedor distinga _"ese perfil ya existe"_ de _"no puedes crear más"_, y este no lo hace. Preguntar primero no depende de esa distinción.

Se conservan los dos casos del POST, ahora con el significado correcto: un `409` es la carrera entre nuestro GET y nuestro POST (éxito), y un `PROFILE_LIMIT_REACHED` sí significa lo que dice — el perfil no existe y no se puede crear —, con un mensaje que lo explica en vez de un "rechazó la solicitud (403)".

**La lección, distinta de la de la spec de máquina.** Acá el openapi no mentía: el 409 existe. Lo que no dice —y ninguna spec suele decir— es **en qué orden se evalúan los errores** cuando dos condiciones aplican a la vez. Un contrato verificado campo por campo puede seguir siendo insuficiente para las precondiciones que no están escritas: eso solo sale ejercitando el camino real, con la cuenta en el estado real.

- **El 409 de "el perfil ya existe" NO se pudo confirmar contra la API real**, precisamente porque el plan estaba lleno y no había forma de crear un perfil para después repetirlo. Viene del openapi. Si el proveedor respondiera otra cosa, `ensureWorkspace` falla ruidosamente en vez de seguir con un perfil que no existe — que es la degradación correcta, pero conviene confirmarlo en la corrida manual de PR5.

## Addendum (2026-09-06, F7.5 PR3) — `reschedule` en el puerto: el modo de falla era de PostFast, no del dominio

Hasta acá, "reprogramar = `cancel(ref viejo)` + `schedule(nuevo)`" figuraba como una regla del ciclo de vida de la card. No lo era: era **PostFast sin endpoint de update** filtrándose al dominio, igual que el workspace único se había filtrado al puerto (PR1). Upload-Post tiene `PATCH /uploadposts/schedule/{job_id}`, que mueve el post en su lugar.

El puerto gana entonces:

```ts
reschedule(previousProviderRef: string, req: SchedulePostRequest): Promise<{ providerRef: string }>;
```

Recibe el `req` completo y no solo la fecha porque un proveedor sin update tiene que **emularlo recreando** el post, y para eso necesita red, contenido y cuenta. Por lo mismo el `providerRef` que devuelve **puede ser distinto** del que recibió: el caller persiste el que vuelve, nunca asume que es el viejo.

- **Upload-Post:** `PATCH` real, mismo `job_id`. Se manda también el `title`, no solo la fecha — el contenido de la card pudo cambiar desde que se programó, y sin eso el proveedor publicaría el texto viejo. Un `404` (el job ya salió de la cola) no se devuelve como rechazo: se crea un post nuevo, porque no hay original que preservar.
- **PostFast:** emula con create + cancel, **en ese orden**. El cancel sigue siendo best-effort y el hueco sigue existiendo (puede quedar un post duplicado), pero ahora **vive en su adapter**, que es donde pertenece.
- **Fake:** conserva la ref, como un proveedor con update. Es deliberado aunque el resto del fake imite a PostFast: es la forma que el puerto prefiere y la que conviene tener en dev, porque la emulación es la degradada. Los tests que necesitan ejercitar la emulación traen su propio provider.

### Cuál de los dos caminos se toma

`CardsService.schedule()` va por `reschedule()` solo cuando es una **reprogramación pura**: la card ya está `scheduled`, tiene `provider_ref`, y la cuenta destino no cambia. Cambiar de cuenta no es "el mismo post movido" sino otro destino, y sigue por el camino largo de cancel + create.

Ese camino usa `markRescheduled`, que a diferencia de `markScheduling` **no anula `provider_ref`**. Ese null existe para el caso "puede que la llamada no llegue a crear nada"; acá el post ya existe. Anularlo abriría sin necesidad la misma ventana de card huérfana que este cambio permite cerrar.

### El contrato que hace posible todo lo anterior

`reschedule` promete algo, y el dominio depende de ello: **si lanza un rechazo explícito, el proveedor no cambió nada y el post original sigue vivo en su horario original.** Sin esa promesa, "devolver la card a donde estaba" sería una mentira.

Cumplirla no es gratis para el adapter que emula. La primera versión de `PostFastProvider.reschedule` cancelaba el post viejo y después creaba el nuevo — que es literalmente lo que hacía `CardsService` antes. Con eso, un create rechazado dejaba la card restaurada como `scheduled`, apuntando a un `provider_ref` de un post **ya borrado**: el calendario decía "programada" y no iba a publicar nunca, y `reconcileDueCards` recién lo notaba cuando pasara la hora vieja. Peor que el comportamiento anterior a F7.5, que al menos mandaba la card a `draft` y no mentía.

Invertir el orden lo arregla: **crear primero, cancelar después**. Un rechazo del create no llega a tocar el post viejo, y el hueco que queda es el de siempre y el ya aceptado — si el cancel falla, PostFast puede terminar con dos posts.

Un fallo **ambiguo** no promete nada, y está bien: ahí el caller ya asume que no sabe qué pasó.

### La semántica de fallo es distinta, y a propósito

En `schedule()`, un rechazo explícito manda la card a `draft`: nunca se creó nada, y la card no tenía una programación previa que perder. En `reschedule()` **sí la tenía**, así que un rechazo la devuelve exactamente a donde estaba — `scheduled`, en su horario viejo, con su `provider_ref` intacto. Reprogramar y fallar no debe costarte la programación que ya tenías.

Un fallo **ambiguo** sigue yendo a `failed` conservando horario, cuenta y `provider_ref`, por el mismo motivo de siempre: no sabemos si el post se movió del otro lado, y borrar el rastro dejaría sin forma de ubicarlo a mano.

La restauración lleva guardia `status='scheduled'` (misma familia que `attachProviderRefIfScheduled`, y por el mismo motivo): si el usuario le dio Cancelar mientras la llamada al proveedor seguía en vuelo, no hay nada que restaurar — sin la guardia se le resucitaría como `scheduled` una card que él acababa de mandar a `draft`, y encima sin cuenta ni `provider_ref`.

Un apunte sobre `markRescheduled`, que conserva el `provider_ref` en vez de anularlo: eso cierra la ventana de card huérfana, pero abre otra más chica. Si el proceso muere entre ese UPDATE y la llamada al proveedor, la fila dice el horario **nuevo** mientras el proveedor sigue con el **viejo**, y `listOrphanedScheduled` no lo detecta porque sí hay `provider_ref`. No se pierde nada: el post existe y se publica, y el primer pase de reconciliación posterior lo marca `published`. Lo que hay entremedio es un calendario que miente un rato, no una card rota.

## Addendum (2026-09-06, F7.5 PR4) — `post_url`: se enciende "Ver en la red"

Deuda de F6: la reconciliación solo guardaba `published_at`, así que los botones _"Ver en la red"_ (modal del Calendario) y _"Ver post"_ (toolbar del Chat) estaban apagados por una razón concreta — no había a dónde llevar al usuario.

`ProviderPostState` gana `postUrl: string | null` y la reconciliación lo persiste en `publication_cards.post_url` (migración `0015_cards_post_url`) junto con `published_at`.

**El null no es un caso de borde, es la mitad del diseño.** PostFast no devuelve la URL del post en ninguna de sus respuestas, así que con ese proveedor la columna se queda en null para siempre y los botones siguen apagados con su tooltip. El frontend mira `postUrl`, nunca qué proveedor está activo: **degrada solo, sin bifurcar la UI**. Es la misma disciplina que el resto del puerto — el proveedor no se filtra hacia arriba, ni siquiera como un `if`.

Detalles que valen la pena:

- **Sin backfill.** Las cards publicadas antes de esta migración se quedan sin enlace. Reconstruirlo pediría rastrear el historial del proveedor por un `provider_ref` que puede ya no existir, para una superficie que hasta hoy estaba apagada.
- **La caja no cambia.** Encendido es un `<a target="_blank" rel="noopener noreferrer">` y apagado un `<button disabled>` + `Tooltip`, con la MISMA clase base. Verificado midiendo geometría, no presencia: 134×37 px en los dos casos, contenido en el footer, sin scroll horizontal en modal ni documento.
- **La URL se estrecha en el adapter, no al renderizar.** `post_url` viaja sin escalas desde la respuesta del proveedor hasta un `href`, y `request<T>()` es un cast, no validación. Dos cosas no pueden pasar: un esquema que no sea http(s) — un `javascript:` en un `href` ejecuta script en el origen de la app y `rel="noopener"` no protege de eso —, y un valor que no sea string, que llegaría hasta el `UPDATE` de `markPublished` y **abortaría el batch entero de reconciliación**, incluidas las cards que ya estaban listas. `parseHttpUrl` corta las dos, con el mismo criterio que `parseTimestamp`: ante la duda, `null`, que el frontend ya sabe degradar.
- **`FakePublishingProvider` devuelve una URL falsa** en las cards que "publica", y `seed-dev` la pone en las publicadas. Sin eso, el camino encendido sería irrecorrible en dev: con el fake nada se publica de verdad y con PostFast la URL es null por diseño.

## Addendum (2026-09-06, F7.5 PR5) — la corrida real, y qué quedó sin cubrir

Cierre de F7.5. El ciclo completo se ejercitó contra la API real de Upload-Post con la cuenta de Jose, y la abstracción aguantó: `CardsService` no cambió una línea entre correr con `fake`, con `postfast` o con `upload_post`.

**Lo que se verificó contra el proveedor real:**

- **Perfil y conexión.** `ensureWorkspace` creó `presencia-<users.id>` desde el botón "Conectar red", el JWT abrió la página de conexión en español, y el claim reclamó LinkedIn y Facebook por diff.
- **Programar.** `POST /upload_text` devolvió un `job_id` real y el job apareció en `GET /uploadposts/schedule` con el perfil, la fecha y el tipo correctos.
- **Reprogramar, que era la razón de peso de la fase.** El `PATCH` movió la fecha **conservando el mismo `job_id`** — verificado listando la cola antes y después. Con PostFast eso habría sido un post borrado y otro creado.
- **Cancelar.** El `DELETE` sacó el job de la cola; la card volvió a `draft`.
- **Publicar y `post_url`.** Dos publicaciones reales, una en LinkedIn y una en Facebook. `getPostStates` las encontró en `/uploadposts/history`, la reconciliación las pasó a `published` y guardó el enlace, y los botones se encendieron.

**Dos cosas que solo esta corrida podía demostrar:**

1. **El post que se publicó es el que se movió de hora, no uno recreado.** El `job_id` que aparece en el historial de LinkedIn es exactamente el mismo que existía antes del `PATCH`. Con la emulación de PostFast habría sido un id distinto — y un post borrado por el camino.
2. **El margen de gracia hace lo que promete.** Al consultar 90 s después de la hora programada, la card de Facebook ya estaba `published` y la de LinkedIn seguía `scheduled` a propósito: su `scheduled_at` aún no cumplía los 2 min de `RECONCILE_GRACE_MS`. No se declara publicado nada que el proveedor podría estar procesando todavía. Un minuto después pasó a `published` con su `publishedAt` igual, al milisegundo, al `upload_timestamp` del proveedor.

Y se cerró el hueco que PR4 había dejado anotado: el botón **"Ver post" de la toolbar del Chat**, que no se pudo verificar entonces porque ninguna card publicada del seed colgaba de un chat. Acá la card se creó **desde el Chat**, así que al publicarse el botón quedó ejercitado con datos reales — enlace correcto, misma caja que su hermano, sin desborde.

**Lo que NO cubre esta corrida, y conviene tenerlo escrito:**

- **PostFast no se ejercitó contra su API real en toda la fase.** La suscripción de Jose venció durante F7 — que es justamente lo que motivó traer un segundo proveedor. Así que `PostFastProvider`, incluida la **emulación nueva de `reschedule`** (donde el code-review encontró el fallo alto del orden create/cancel), tiene cobertura de tests unitarios con `fetch` stubeado pero **cero corridas reales desde F6**. No es algo que esta fase pudiera resolver; queda como riesgo conocido para el día que esa cuenta vuelva.
- **Media.** Instagram, TikTok y YouTube siguen fuera: `/upload_text` no las acepta y subir el archivo al proveedor es trabajo de F10/F11.
- **Facebook con varias páginas.** La cuenta de prueba tiene una sola, así que la autodetección de `facebook_page_id` funcionó y el hueco documentado en el addendum de PR2 no se pudo ejercitar.

## Addendum (2026-09-07, F7.5 seguimiento) — hallazgos del review sobre el rango completo

Al cerrar la fase se corrió `/code-review medium` sobre el diff acumulado de los seis PRs, no solo PR a PR. Encontró siete cosas que los reviews individuales no podían ver, porque solo aparecen al mirar cómo interactúan piezas que llegaron en PRs distintos. Vale la pena la costumbre.

**El fallback de 404 reintroducía por otra puerta el fallo que PR3 arregló.** `UploadPostProvider.reschedule`, ante un `404` del `PATCH`, recrea el post. Si esa recreación se rechazaba, el error subía como `PublishingRejectedError` — y el contrato del puerto dice que un rechazo deja el post original vivo, así que `CardsService` "restauraba" la card como `scheduled` apuntando a un job que el propio 404 acababa de probar inexistente. Ahora ese caso se envuelve en `PublishingUnavailableError`: ambiguo es lo honesto, y la card va a `failed` con su rastro.

**El mensaje del tope de perfiles no llegaba al usuario.** `ensureWorkspace` puede rechazar con una frase escrita para que se entienda, pero `ChannelsService` no traducía errores del proveedor a HTTP — solo `CardsService` lo hacía — y no hay filtro global de excepciones. Salía un 500 genérico. La traducción se extrajo a `publishing/to-http-exception.ts` y ahora la usan los dos.

**Un 403 cualquiera decía "límite de perfiles".** El respaldo por código HTTP convertía una key revocada o degradada —que Upload-Post también responde con 403— en "compra más capacidad". Ahora el tope exige su `error_code` y el resto habla de permisos.

**El guard de esquema de `post_url` vivía en un solo adapter.** El valor termina en un `href`, así que el invariante tiene que valer para la fila, no para el camino por el que llegó: `parseHttpUrl` se compartió y se aplica también en `toDto`, que es donde el valor se consume.

Y dos de robustez: la cola de programados se consume sin paginar aunque devuelve `total`, así que ahora su truncamiento se detecta igual que el del historial; y un `200` con cuerpo vacío —plausible en `DELETE`/`PATCH`— lanzaba un `SyntaxError` crudo que se escapaba de la clasificación de errores y salía como un 500 sin explicar.

### Una ventana que se documenta en vez de cerrarse

`markRescheduled` conserva el `provider_ref` a propósito. Con un proveedor que emula (PostFast: create + cancel), la ref que vuelve es de un post **nuevo** y la vieja ya se borró. Si el proceso muere entre que `reschedule()` retorna y el `UPDATE` que estampa la ref, la fila queda `scheduled` apuntando al post borrado: `listOrphanedScheduled` no la ve —hay `provider_ref`— y la reconciliación la marcará `failed` mientras el post nuevo sí publica.

Se deja **documentada y no resuelta**, con el mismo criterio que el resto de huecos de PostFast. Cerrarla pide un protocolo de dos fases para un caso que solo existe en el proveedor que emula, que hoy además no tiene ninguna cobertura real. Es infra "por si acaso" (regla dura #6) hasta que haya evidencia de que ocurre.

## Addendum (2026-09-08, F8 PR2) — el disparador cambió, y el pase también

El addendum de F6 decía que F8 solo cambiaría el disparador de `reconcileDueCards`, no su lógica. La primera mitad se cumple; la segunda no del todo, y conviene decir por qué en vez de dejar la frase vieja mintiendo.

**Las reglas no cambiaron.** Qué es una huérfana, el margen de gracia de 2 minutos, los lotes de 100 refs, el mapeo `published`/`failed`, el no-op de "sigue en cola", los mensajes de error: idénticos.

**El orden sí.** Antes el pase era por usuario: para cada uno, sus huérfanas, sus vencidas, y una llamada a `getPostStates` con sus refs. Ahora el cron recoge las cards reconciliables de **todos** los tenants en una query, aplana los refs de todos en un solo lote, hace **una** llamada al proveedor y recién ahí separa las escrituras por usuario, cada una en su `runWithTenant`.

**El motivo es que `getPostStates` nunca estuvo scopeado por usuario.** Lo dice el addendum de PR1 de F7.5: `cancel` y `getPostStates` operan sobre ids de post, y sus endpoints están scopeados por la API key, no por perfil. O sea que llamarlo una vez por usuario baja **la misma lista global** tantas veces como usuarios haya. Con diez creators publicando a la misma hora, eso son diez descargas idénticas por minuto contra una API cuyo rate limit no conocemos — el `openapi.json` de Upload-Post documenta un solo límite (100 req / 5 min) y es para los endpoints de analíticas, no para estos.

**Y de regalo corrige un hueco que este mismo ADR ya tenía documentado.** `/uploadposts/history` pagina por recencia **global** con tope de 5 páginas, así que con varios usuarios activos la card de alguien puede quedar fuera del tope; por eso existe la salvaguarda que reporta esos refs como `scheduled` en vez de darlos por fallidos. Llamar por usuario no ayudaba: son las mismas 5 páginas cada vez, gastadas en resolver los refs de uno solo. Una sola consulta resuelve los de todos con esas mismas páginas.

**Lo que se pierde, para que quede escrito:** con un pase por usuario, un fallo del proveedor afectaba solo a ese usuario. Ahora aborta el pase completo. En la práctica cambia poco —una caída del proveedor los afecta a todos de todos modos, y `getPostStates` no falla por ref individual—, y el tick siguiente reintenta 60 segundos después. Las **escrituras** sí conservan aislamiento por usuario: cada `runWithTenant` va en su propio `try/catch`, así que un error escribiendo lo de uno no deja sin reconciliar a los demás.

**El cron le puso timeout al cliente HTTP, y no es un detalle suelto.** `ProviderHttpClient` no tenía ninguno: una llamada podía quedarse colgada indefinidamente. Con el disparador perezoso eso era tolerable; con el barrido corriendo cada minuto pasó a ser un daño concreto. `schedule()` deja la card `scheduled` con `provider_ref` en null mientras la llamada está en vuelo — si tarda más que el margen de gracia de 2 minutos, el barrido la ve como huérfana y la marca `failed`; cuando el proveedor por fin contesta, `persistProviderRef` encuentra que ya no está `scheduled` y **cancela un post que sí se había creado bien**. La guardia `status='scheduled'` estaba pensada para significar "el usuario canceló", y sin timeout pasaba a significar también "el barrido se cansó de esperarte". Con 30s de corte, el fallo entra por la puerta correcta: ambiguo, la card va a `failed` conservando el rastro y avisándole al usuario que revise en el proveedor.

**El disparador perezoso no se elimina, se degrada a respaldo.** `maybeReconcile` sigue colgado de `listByChat` y `listByRange`, con el cooldown subido de 60s a 5 min: el cron es la fuente primaria y esto solo cubre el hueco de que el worker esté caído. Cuando el worker corre, el usuario que abre el calendario casi nunca dispara nada.
