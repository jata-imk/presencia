# ADR-011 · Assets (Biblioteca): Object Storage externo desde día 1

**Decisión:** Cloudflare R2 u Object Storage de Contabo (API S3). NO MinIO local en el VDS. Buckets: assets de Biblioteca (prefijo por usuario) + backups.

**Razón:** Las imágenes generadas son el devorador de disco (1–3 MB × usuarios × iteraciones). Fuera del VDS: el disco dura años, un contenedor menos, y los assets sobreviven si el servidor arde. El SDK S3 hace el cambio de proveedor trivial.

## Addendum (2026-09-16, F8.5 PR5) — primera implementación: el backup diario

El ADR de arriba decidió el Object Storage en F0 para los assets de Biblioteca. Lo primero que lo usa
no es Biblioteca sino el **respaldo de la base**, y conviene dejar escrito lo que se resolvió al
construirlo.

**Proveedor: Cloudflare R2.** Free tier de 10 GB y egress $0. El `pg_dump` de hoy pesa megabytes: el
respaldo va a ser gratis por mucho tiempo. Bucket `presencia-backups`, privado.

**Un rol propio para leer, `presencia_backup`** (migración `0021`), con `pg_read_all_data` y nada más.
El dump necesita leer **todo**, y ese poder no tiene por qué vivir en el rol que sirve requests
—`presencia_app`, sujeto a RLS— ni obligar a meter el password del superusuario en el contenedor del
worker. `pg_read_all_data` es un rol predefinido desde Postgres 14: `SELECT` sobre todo lo presente y
futuro, sin escritura ni DDL.

**Y hace falta `BYPASSRLS` encima, que no viene con él.** La primera versión de la migración daba por
hecho que `pg_read_all_data` eximía de las policies. No lo hace —la documentación de Postgres lo dice y
recomienda justamente poner `BYPASSRLS` a los roles a los que se le otorga—, y `pg_dump` corre con
`row_security = off`, así que habría abortado en la primera tabla con RLS. Toda tabla de dominio la tiene
desde `0001` con `ENABLE` + `FORCE`. Lo atrapó el `/code-review` y se comprobó contra la base de dev
antes de mergear: el mismo `SELECT` falla sin `BYPASSRLS` y pasa con él.

Un dump que respetara RLS no sería un respaldo de la base, sería el de un tenant vacío. Y el permiso es
de solo lectura: el rol no tiene `INSERT`/`UPDATE`/`DELETE` ni DDL.

**Sin archivo intermedio.** `pg_dump --format=custom` escribe a stdout y el SDK sube por partes conforme
llega. El disco del VPS es chico y el dump crece con los datos; además, un fallo a la mitad no deja medio
archivo tirado ocupando espacio.

**La retención la hace el bucket, no el código.** Una lifecycle rule de R2 borra lo que pase de 30 días.
Borrar objetos viejos es configuración del almacenamiento: así sigue limpiándose aunque la app se apague
un mes, y no hay que escribir —ni probar— un job de limpieza.

**Con dueños y permisos, no sin ellos.** La primera versión hacía el dump con `--no-owner
--no-privileges`, suponiendo que las migraciones recrearían los permisos tras restaurar. No lo hacen: el
dump incluye la tabla de migraciones de drizzle, así que `db:migrate` sobre una base restaurada ve todo
aplicado y no corre ningún `GRANT`. La base volvía con todos sus datos y la app recibía `permission denied`
en cada request; la cola quedaba a nombre del superusuario. **La verificación de restauración no lo vio,
porque corría como superusuario**, que se salta permisos y RLS. Lo encontró el `/code-review` sobre el
rango completo de la fase. Desde entonces, la receta comprueba los permisos **de los roles de la app** en
la base restaurada, y un servidor nuevo necesita crear los roles antes del `pg_restore`.

**Una clave por día, sobreescribible** (`backups/presencia-<fecha>.dump`, fecha UTC). Un reintento el
mismo día pisa el objeto en vez de acumular basura.

**Configuración de todo o nada.** Las cinco variables del backup son opcionales como grupo: sin ellas el
job no se registra y la API arranca igual (en dev nadie tiene bucket). Pero **media configuración es un
error de arranque**, no un job que se salta en silencio — el modo de fallo peligroso es el operador
creyendo que hay respaldo. Verificado por mutación: sin esa regla, el test correspondiente pasa en verde.

**Lo que este addendum NO cubre:** los assets de Biblioteca, que siguen sin implementarse (F10). Cuando
lleguen, reusan el mismo bucket con prefijo por usuario o uno propio; la decisión se toma ahí.

## Addendum (2026-09-27, F10 PR2) — los assets de Biblioteca, por fin

**Bucket propio, `presencia-assets`, privado.** No el de backups: aquel tiene una lifecycle rule que
borra a los 30 días y los assets viven lo que viva la cuenta. Reusa el endpoint y las credenciales
(`S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`), así que el token de R2 necesita permiso
sobre los dos buckets; solo el nombre es aparte (`ASSETS_S3_BUCKET`). Con eso, "tener credenciales" ya
no significa "quiero backup": el todo-o-nada del backup ahora lo dispara `S3_BUCKET` o
`BACKUP_DATABASE_URL`, no el endpoint.

**Un puerto, dos implementaciones** (`apps/api/src/assets/asset-storage.ts`, `ASSETS_STORAGE`):
`r2` para producción y `local` (disco, `ASSETS_LOCAL_DIR`) para dev y tests, donde nadie tiene bucket.
Con `NODE_ENV=production`, `local` **es un error de arranque**: es justo lo que este ADR prohíbe, y un
deploy que olvidara la variable guardaría las imágenes en el disco del contenedor, que se pierde en el
siguiente `up -d`. El stack de dev del VPS no corre la app (solo Postgres): la API de dev corre en
la laptop, sin `NODE_ENV=production`, y guarda en disco.

**La llave es `userId/assetId.ext`.** El prefijo por usuario de arriba, y nada más. No lleva la card: un
asset sobrevive a su card (`assets.card_id` es `ON DELETE SET NULL`), Biblioteca va a dejar subir sin
card (diseño de F12), y una llave de objeto no se puede renombrar.

**El navegador nunca ve el bucket.** `GET /api/assets/:id/content` pasa por el guard de sesión y por el
RLS (un id ajeno no existe) y responde un **302 a una URL firmada de 10 minutos**; el `302` se cachea 5
minutos, menos que la firma. Así el bucket sirve los bytes y Node no carga con megas por cada card que
se pinta. Con `local`, la API sirve los bytes ella misma, con caché larga: un asset nunca cambia, una
imagen nueva es un asset nuevo.

**Subir: body crudo, 10 MB, y sharp decide qué es.** `POST /api/cards/:id/assets` recibe el archivo
tal cual (sin multer ni multipart), con tope de 10 MB —el menor entre los proveedores de publicación—
contado mientras se lee, no confiando en el `Content-Length`. El tipo lo decide `sharp` decodificando
los bytes, no el `Content-Type` ni la extensión: solo JPG, PNG y WebP. sharp trae su binario nativo
como dependencia opcional por plataforma; el Dockerfile lo carga al construir para que un binario
faltante truene en CI y no en la primera subida.

**Dos pasos, y el orden importa.** Primero los bytes al storage (red, lento, fuera de transacción);
después, en una sola transacción, la fila de `assets` y la imagen elegida en la card. Una imagen nunca
aparece en una card sin su fila ni una fila sin sus bytes. Lo inverso sí puede pasar —bytes sin fila si
la transacción falla— y se acepta: es basura de centavos que no se ve en ningún lado. El día que pese,
se limpia con un barrido.

**Sin lifecycle en este bucket, y no se borra lo descartado.** Biblioteca es el repositorio total (una
variante que no se eligió se guarda), y a ~1.5 MB por imagen, cien imágenes al mes son ~$0.002 por
usuario al mes en R2. El borrado llega con la pantalla de Biblioteca (F12).

## Addendum (F10.9, 2026-10-18) — los adjuntos del chat

El creator adjunta imágenes, archivos de texto y PDF a un mensaje del chat. Van al **mismo bucket**, en la carpeta del usuario (`userId/adjuntos/id.ext`), pero **no a la tabla `assets`**: tienen la suya, `message_attachments` (modelo-de-datos.md).

- **Por qué otra tabla.** Un adjunto es de la conversación y muere con ella (borrar el chat lo borra); un asset es material publicable que sobrevive a su chat y que Biblioteca va a mostrar. Mezclarlos obligaría a cada consulta de assets (historial de la card, Biblioteca) a filtrar adjuntos, y a cada borrado de chat a distinguir qué assets se van. Usar una imagen adjunta en una card la **copia** a `assets` (F10.9 PR7): un objeto más en el bucket, a cambio de una sola fuente de verdad por concepto.
- **Se sube al adjuntar** (`POST /api/attachments`, cuerpo crudo como "Subir propia", tope de 25 MB): el envío sale inmediato y el chip muestra el progreso. Un adjunto que nunca se envía lo borra el cron `attachments.cleanup` (cada hora, los de más de 24 h sin mensaje). Es el primer borrado del bucket: `AssetStorage` gana `delete`, idempotente.
- **El tipo lo decide el contenido**: sharp para imágenes (JPG, PNG, WebP, GIF → su primer cuadro en PNG), `%PDF-` para PDF, y UTF-8 válido para `.md`/`.txt`/`.csv`/`.json`. Lo demás es 415; un PDF escaneado de más de 20 páginas o un texto que no es UTF-8, 422 con el motivo.
- **Las imágenes se guardan sin metadata.** Las fotos del celular traen EXIF con la ubicación GPS; sharp la tira al recodificar, después de aplicar la orientación. Se guarda a ≤2048 px (alcanza para publicar en cualquier red) y, si es más grande, una variante de ≤1568 px para el modelo (donde Anthropic deja de reescalar; más píxeles cuestan tokens sin leerse mejor). Una imagen sin metadata que ya cabe se guarda tal cual: recodificar le sumaría una generación de compresión. Desde aquí, **"Subir propia" de la card también quita el EXIF** (sin reescalar, y solo si lo trae): antes guardaba los bytes tal cual, ubicación incluida.
- **PDF con `unpdf`** (pdf.js en su build sin worker, ESM, sin binarios). Se extrae el texto página por página y solo hasta el tope de 100k caracteres: el parseo corre en el proceso de la API, el mismo de los streams del chat, y cada página le devuelve el turno al resto. Una página con menos de 50 caracteres es una imagen; si más del 20% de las páginas lo son, el PDF es escaneado y viaja nativo al modelo (con tope de 20 páginas). Debajo de eso (la portada con foto de un menú) se lee como texto, que cuesta mucho menos. pdf.js no reconstruye tablas ni encabezados: el texto sale en orden de lectura, sin estructura; alcanza para menús, cotizaciones y artículos, que son el caso común.
- **Borrar el chat borra los bytes al instante**, después del commit, con la fila del chat bloqueada (`FOR UPDATE`) para que una subida a media transacción no se cuele entre la lectura de las llaves y el DELETE. Una subida cuyo insert falla (el chat se borró mientras subía) borra sus propios bytes. Si el bucket falla en ese momento, el error se registra y quedan bytes sin fila: la misma basura barata que ya se acepta arriba, sin cola de reintentos (YAGNI).
- **Límite del proxy.** El nginx de CloudPanel tiene que aceptar cuerpos de al menos 26 MB (`client_max_body_size`, docs/how-to/desplegar.md). Si el servidor rechaza antes de leer todo el cuerpo, Chrome muestra un error de red en vez del 413: por eso la web valida el peso antes de subir, y el servidor drena lo que sobra en vez de cortar.

## Addendum (F12 PR2, 2026-11-14) — Biblioteca lee: listado, subida sin card y descarga

La pantalla de Biblioteca (`presencia-biblioteca.md`) necesitaba tres cosas que F10 dejó dichas y no hechas.

- **Una imagen ya no necesita card.** La columna y la llave lo permitían desde F10 PR2; lo que lo impedía era el código (`storeImage` pedía `cardId`). `POST /api/library` sube una imagen que no nace en ninguna card ni en ningún chat: mismo trato que "Subir propia" (cuerpo crudo, 10 MB, sin EXIF, GIF rechazado), sin ponerla en ningún lado.
- **`chat_id` y `card_id` dicen dónde nació, no dónde se usa.** Dónde se usa una imagen se **deriva** de `content.assetIds` de las cards, como ya se derivaba "elegida o descartada". Esa separación es lo que deja usar una imagen en una card distinta de la suya sin copiarla (siguiente PR): una fila por imagen, N usos. La excepción son los recortes de carrusel (`metadata.croppedFrom`), que sí son otro archivo: Biblioteca los oculta y cuenta su uso como uso de la original.
- **El listado es un modelo de lectura aparte** (`apps/api/src/library/`, `GET /api/library` y `/summary`), no parte de `AssetsModule`: eliminar una imagen tiene que mirar las cards que la usan, y `CardsModule` ya importa `AssetsModule`. Lee `assets` con su generación (`image_generations`), su chat y sus cards en una sola consulta; no escribe.
- **Los usos se calculan por consulta, sin índice.** Se desarman los `assetIds` de las cards del creator (cientos de filas, ya acotadas por RLS) y se agrupan por imagen. La alternativa era un GIN sobre `content -> 'assetIds'` consultado por imagen: más infraestructura para un problema que hoy no existe. Se agrega cuando una cuenta lo pida, igual que ADR-022 hizo con los agregados.
- **Paginación por cursor `(created_at, id)`**, la primera de la API. El cursor viaja opaco (base64url) y lleva la fecha con los microsegundos de Postgres: un `Date` de JS se queda en milisegundos, y con eso dos imágenes del mismo lote podían repetirse o saltarse entre páginas. El índice `assets_library (user_id, created_at, id)` va ascendente a propósito: Postgres lo recorre al revés, y el `DESC NULLS LAST` que emite drizzle con `.desc()` no coincide con el `order by … desc` de la consulta.
- **`image_generations.description`** (migración 0071): lo que pidió el creator, sin componer. `prompt` guarda lo que se le mandó al generador, con el estilo, el nicho y el encuadre; mostrado en Biblioteca sería ruido, y buscado encontraría todas las imágenes con la palabra "texto" (todas dicen "Sin texto, letras…"). La migración recorta la descripción de las filas existentes con el formato de F10.6 ("Qué se ve: …"); las anteriores se quedan en null y muestran su prompt completo.
- **Descargar** es `GET /api/assets/:id/content?download=1`, como en los adjuntos: con R2 el nombre va en la URL firmada, con disco local lo pone la API. El nombre es el original del creator con la extensión de lo que de verdad se guardó, o `presencia-<id>.<ext>` si la dibujó un generador.
- **Qué cuenta como uso.** Toda card que tenga la imagen puesta, menos una `canceled` (hoy nadie escribe ese estado: cancelar regresa a borrador). El filtro "Estado de la card" ofrece borrador, programado y publicado; una publicación que **falló** cuenta como borrador, porque regresó a manos del creator y se edita igual. Red y estado se evalúan sobre la misma card: una imagen en un borrador de Instagram y en una publicada de LinkedIn no pasa "Instagram + Publicado".
- **Un contenido roto no tumba la pantalla.** Los ids de `assetIds` viven en jsonb, sin tipo: la consulta solo desarma lo que es una lista y solo convierte a uuid lo que tiene forma de uuid. Sin eso, una sola card con `assetIds` en null dejaba a esa cuenta sin Biblioteca.
- **Sin tope de subidas por usuario**, igual que los adjuntos del chat: cualquier cuenta puede subir imágenes de 10 MB sin límite de cantidad. Con la card como requisito el riesgo era menor; sin ella queda anotado para F13 (hardening), junto con el de adjuntos.
- **Sigue sin borrarse nada.** El borrado, con su política por estado de la card, llega en el PR siguiente.

## Addendum (F12 PR4, 2026-11-18) — eliminar una imagen

`DELETE /api/library/:id` (una) y `POST /api/library/delete` (`{ ids }`, hasta 100). La política por estado de la card es de producto y vive en el lore doc (`presencia-biblioteca.md` §5); aquí, cómo se cumple sin dejar una card apuntando a la nada.

- **Borrado duro, con los recortes.** Se borra la fila de la imagen y las de sus recortes de carrusel (`metadata.croppedFrom`), que no tienen vida propia. `image_generations.asset_id` y `parent_asset_id` ya eran `ON DELETE SET NULL`: el asiento del ledger referencia la generación, no el asset, así que el cobro no se toca. Una edición cuyo padre se eliminó se queda sin linaje hacia arriba y encabeza su propio historial. Sin papelera: el porqué está en el lore doc §6.
- **Las cards se resuelven en la misma transacción.** En un borrador o en una que falló, la imagen se quita del contenido (`removeImages` en `packages/shared/src/carousel.ts`: en un carrusel el slide se queda con su prompt, sin imagen) y el cambio sale por el NOTIFY de siempre, así que el chat abierto en otra pestaña la pierde sin recargar. En una **publicada** el contenido no se toca: es el registro de lo que salió, y las vistas ya caen al ícono cuando el archivo no responde. En una **programada** no se elimina (409, decisión 5 de F12): los bytes ya se le entregaron al proveedor y el post saldría con ella de todos modos. Tampoco con una edición en curso que parte de ella (generación `pending` dentro de `IMAGE_JOB_STALE_MS`; una más vieja es un trabajo muerto y no bloquea).
- **Primero la imagen, después las cards.** El borrado bloquea la imagen y sus recortes con `for update` y solo entonces lee qué cards la usan, y las bloquea en orden de id. Del otro lado, todo lo que pone una imagen ya existente en una card la lee con `for key share` (`AssetsRepository.findForUse`): `selectImage` y el recorte de carrusel que regresa a la original. Los dos locks chocan: si el borrado llegó primero, el otro ya no encuentra la imagen (404); si llegó después, el borrado espera y ve el uso nuevo. Sin esto, "elegir esta versión" en una pestaña y "eliminar" en otra podían dejar la card con un id sin fila. Ajustar una imagen (la edición) también bloquea a su padre así antes de arrancar: si se eliminó, responde "No encontramos la imagen que quieres ajustar." y no un error de llave foránea. El orden imagen → card es el mismo en todos los caminos (`setSlidesAspect` y la edición bloquean la imagen antes que la card) para que no se esperen uno al otro. **Programar** lee la card con `lockById`: sin eso, un borrado que llegaba entre la lectura y el `UPDATE` a `scheduled` dejaba programada una card sin su imagen, con el post ya armado en el proveedor; con el lock, la lectura ve el borrado y el chequeo de "las imágenes cambiaron" la rechaza.
- **Una transacción por imagen.** En el borrado múltiple, una bloqueada no detiene a las demás (el resultado dice cuáles se quedaron y por qué), y dos borrados grandes a la vez no se cruzan locks. Un recorte pedido por su id no se elimina ni se cuenta como eliminado (404 en el `DELETE` de una): se va con su original.
- **Sin índices nuevos.** Cada imagen que se elimina busca sus recortes (`metadata ->> 'croppedFrom'`) y las cards que la usan (`content -> 'assetIds' ?| …`) recorriendo las filas del creator, igual que el historial de versiones. Son cientos de filas acotadas por RLS; el índice de expresión (o el GIN que el PR 2 ya decidió no poner) entra cuando una cuenta lo pida, con el mismo criterio de arriba.
- **Los bytes, después del commit.** Igual que los adjuntos (F10.9): `AssetsService.deleteObjects` borra de R2 con `Promise.allSettled` y nunca lanza. Un archivo que no se pudo borrar queda como bytes sin fila, la misma basura barata e invisible de siempre.
- **`GET /api/library/:id` trae el historial de versiones**: la original y todas sus ediciones (un árbol aplanado por fecha), con un CTE recursivo sobre `parent_asset_id` que pasa por los recortes sin mostrarlos (en un carrusel se edita la imagen que se ve, que puede ser un recorte).
