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

**Una clave por día, sobreescribible** (`backups/presencia-<fecha>.dump`, fecha UTC). Un reintento el
mismo día pisa el objeto en vez de acumular basura.

**Configuración de todo o nada.** Las cinco variables del backup son opcionales como grupo: sin ellas el
job no se registra y la API arranca igual (en dev nadie tiene bucket). Pero **media configuración es un
error de arranque**, no un job que se salta en silencio — el modo de fallo peligroso es el operador
creyendo que hay respaldo. Verificado por mutación: sin esa regla, el test correspondiente pasa en verde.

**Lo que este addendum NO cubre:** los assets de Biblioteca, que siguen sin implementarse (F10). Cuando
lleguen, reusan el mismo bucket con prefijo por usuario o uno propio; la decisión se toma ahí.
