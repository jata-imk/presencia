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
