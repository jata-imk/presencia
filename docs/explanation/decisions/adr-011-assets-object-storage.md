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
siguiente `up -d`. Eso incluye el stack de dev del VPS, que también corre con `NODE_ENV=production`.

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
