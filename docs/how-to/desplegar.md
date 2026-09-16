# Desplegar en el VPS

Receta operativa del deploy de V1. El **por qué** de esta forma está en
[ADR-020](../explanation/decisions/adr-020-topologia-de-deploy.md); la máquina y los puertos, en
[infraestructura.md](../reference/infraestructura.md).

Resumen: CI construye la imagen y la publica en GHCR; el VPS solo hace `pull`. El nginx que administra
CloudPanel expone `presencia.josetejero.com` y habla con el contenedor `app` por loopback.

## Qué vive dónde

| Pieza                | Dónde                        | Versionado                                          |
| -------------------- | ---------------------------- | --------------------------------------------------- |
| `docker-compose.yml` | `/opt/presencia` en el VPS   | **Sí**, viene del repo — no editarlo allá           |
| `.env`               | `/opt/presencia` en el VPS   | **No**: tiene secretos. Su índice es `.env.example` |
| Imagen               | `ghcr.io/jata-imk/presencia` | La publica `release.yml`                            |

Cada stack en su propia carpeta: `env_file: .env` del compose se resuelve **relativo a la carpeta del
archivo**, así que dos stacks en la misma carpeta compartirían el `.env`. El stack de dev (Postgres en 5434) vive aparte del de prod (5435 + `app` + `worker`).

Para comprobar que el compose del VPS está al día:

```bash
cd /opt/presencia
curl -fsSL https://raw.githubusercontent.com/jata-imk/presencia/main/docker-compose.yml \
  | diff - docker-compose.yml && echo "IGUAL al repo"
```

## Alta del entorno (una vez)

### 1. Postgres

```bash
sudo mkdir -p /opt/presencia && cd /opt/presencia
sudo curl -fsSLO https://raw.githubusercontent.com/jata-imk/presencia/main/docker-compose.yml
```

`.env` inicial (los passwords con `openssl rand -hex 24`: en base64 los `/`, `+` y `=` rompen las URLs
de conexión):

```
POSTGRES_USER=presencia
POSTGRES_PASSWORD=...
POSTGRES_DB=presencia
POSTGRES_PORT=5435
APP_PORT=3001
```

```bash
chmod 600 .env
sudo docker compose -p presencia-prod up -d
sudo docker compose -p presencia-prod ps
```

**Siempre `-p presencia-prod`.** Sin `-p`, compose usa el nombre de la carpeta, y si coincide con el del
stack de dev recrea sus contenedores con el `.env` equivocado.

### 2. Migraciones y roles

Las migraciones corren **desde la laptop** por túnel SSH: `drizzle-kit` es `devDependency` y no viaja en
la imagen de producción.

```bash
ssh -N -L 5435:localhost:5435 usuario@vps
```

En el repo, con el rol owner (la variable de la shell gana sobre el `.env` local):

```bash
DATABASE_URL=postgres://presencia:...@localhost:5435/presencia \
  pnpm --filter @presencia/api db:migrate
```

Las migraciones crean `presencia_app`, `presencia_worker` y `presencia_jobs` **sin password** (un
password en SQL versionado sería un secreto commiteado). Se asignan en el VPS y se escriben en el `.env`
como URLs completas. El host es `postgres:5432`, el nombre del servicio dentro de la red de compose, no
`localhost:5435`:

```bash
cd /opt/presencia
APP_PW=$(openssl rand -hex 24)
JOBS_PW=$(openssl rand -hex 24)
SQL="ALTER ROLE presencia_app PASSWORD '$APP_PW';"
SQL="$SQL ALTER ROLE presencia_jobs PASSWORD '$JOBS_PW';"
sudo docker compose -p presencia-prod exec -T postgres \
  psql -U presencia -d presencia -v ON_ERROR_STOP=1 -c "$SQL"
H="@postgres:5432/presencia"
echo "APP_DATABASE_URL=postgres://presencia_app:$APP_PW$H" | sudo tee -a .env >/dev/null
echo "JOBS_DATABASE_URL=postgres://presencia_jobs:$JOBS_PW$H" | sudo tee -a .env >/dev/null
unset APP_PW JOBS_PW H SQL
```

`presencia_worker` se queda **sin password** a propósito: hoy nadie conecta con ese rol (el contenedor
`worker` usa `APP_DATABASE_URL`), y un rol sin password no puede iniciar sesión.

### 3. El resto del `.env`

La API valida su entorno al arrancar (`apps/api/src/env.ts`) y se mata si falta algo. Además de lo de
arriba:

```
BETTER_AUTH_SECRET=<openssl rand -base64 32>
BETTER_AUTH_URL=https://presencia.josetejero.com
WEB_URL=https://presencia.josetejero.com

AI_MODEL=google:gemini-3.6-flash
GOOGLE_GENERATIVE_AI_API_KEY=...

ZEPTOMAIL_TOKEN=...
MAIL_FROM=no-reply@josetejero.com

PUBLISHING_PROVIDER=upload_post
UPLOAD_POST_API_KEY=...
```

Tres cosas que se olvidan y muerden:

- **`PUBLISHING_PROVIDER` no puede ser `fake` en prod.** El provider falso guarda los posts programados
  en memoria del proceso, y el `worker` corre en OTRO proceso: su mapa estaría vacío y la reconciliación
  marcaría **fallida toda card programada** (ADR-008).
- **No definir `PORT`.** El contenedor tiene que seguir escuchando en 3000; el puerto del host lo fija
  `APP_PORT`.
- **No definir `WORKER_INLINE` ni `NODE_ENV`.** El compose los fija (`false` y `production`) en los dos
  servicios, y `environment` gana sobre `env_file`. `NODE_ENV` es lo que enciende el servido del SPA: con
  otro valor el sitio respondería 404 en `/` mientras `/api` sigue sano.

El `.env` del paso 1 debe terminar con salto de línea antes de los `tee -a` del paso 2, o la primera URL
se pega al final de `APP_PORT=3001`. Para asegurarlo: `printf '\n' | sudo tee -a .env >/dev/null`.

### 4. Backup diario (opcional, pero recomendado antes del primer usuario)

Crear en Cloudflare R2 un bucket privado (`presencia-backups`), una **lifecycle rule** que borre objetos
de más de 30 días, y un **API Token** con permiso _Object Read & Write_ acotado a ese bucket.

El rol de lectura lo crea la migración `0021` sin password. En el VPS:

```bash
cd /opt/presencia
BACKUP_PW=$(openssl rand -hex 24)
sudo docker compose -p presencia-prod exec -T postgres \
  psql -U presencia -d presencia -v ON_ERROR_STOP=1 \
  -c "ALTER ROLE presencia_backup PASSWORD '$BACKUP_PW';"
echo "BACKUP_DATABASE_URL=postgres://presencia_backup:$BACKUP_PW@postgres:5432/presencia" \
  | sudo tee -a .env >/dev/null
unset BACKUP_PW
```

Y las cuatro de R2 (el endpoint lleva tu Account ID):

```
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_BUCKET=presencia-backups
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

**Todo o nada:** con algunas de las cinco y otras no, la API **no arranca**. Es deliberado: el modo de
fallo peligroso es creer que hay respaldo y que el job nunca se haya registrado.

### 5. El vhost de CloudPanel

Sitio tipo **Reverse Proxy** hacia `http://127.0.0.1:3001`, y certificado de Let's Encrypt (el DNS tiene
que resolver antes de pedirlo).

Después hay que editar el vhost (**Sites → el sitio → Vhost**). CloudPanel no genera un `location /api/`:
manda todo a una _named location_ con placeholders que él rellena, y ahí van los dos ajustes. **No tocar
los `{{placeholders}}`**; los comentarios con `#` sí sobreviven a guardar y a renovar el certificado.

**1. Apagar el buffering.** nginx acumula la respuesta por default —la plantilla incluso trae
`proxy_buffers`—, y el chat es streaming (ADR-006): sin esto la respuesta del modelo aparece completa de
golpe al final, o se corta. Dentro de `location @reverse_proxy`, después de `proxy_http_version 1.1;`:

```nginx
    # Presencia: el chat es SSE; sin esto la respuesta llega de golpe al final.
    proxy_buffering off;
    proxy_cache off;
```

Los timeouts de la plantilla (900 s) alcanzan para un turno de chat: `proxy_read_timeout` cuenta entre
lecturas sucesivas, y los fragmentos del modelo llegan muy por debajo de eso. **No alcanzan para un
stream ocioso**: el SSE de notificaciones de F8.6 puede pasar 15 minutos sin un solo evento, y nginx lo
cortaría. Esa fase tendrá que traer su propio heartbeat (lo normal, cada ~20 s) o subir este timeout.

**2. Compresión.** nginx no comprime lo que viene de un `proxy_pass` salvo que se le diga (`gzip_proxied`
viene en `off`), y el SPA sale de ahí. A nivel de `server`:

```nginx
  # Presencia: text/javascript es obligatorio — así sirve Express los .js, y
  # con solo application/javascript el bundle viaja sin comprimir.
  gzip on;
  gzip_proxied any;
  gzip_min_length 1024;
  gzip_types text/css text/javascript application/javascript application/json image/svg+xml;
```

Medido en el primer deploy: el bundle pasa de 1,001 KB a 308 KB (70%), el CSS de 49.6 KB a 10.1 KB.

La app además emite `X-Accel-Buffering: no` en el stream del chat, así que el buffering queda apagado por
los dos lados. El mismo requisito vale para el SSE de notificaciones (F8.6).

## Desplegar una versión

```bash
cd /opt/presencia
sudo docker compose -p presencia-prod --profile app pull
sudo docker compose -p presencia-prod --profile app up -d
sudo docker compose -p presencia-prod --profile app ps
```

Si la versión trae migraciones, se aplican **antes** del `up`, con el túnel al 5435 y el comando del
paso 2.

Sin `APP_IMAGE` en el `.env` se despliega `latest`, que es la punta de `main` con CI en verde. Para
**volver a una versión anterior** no hace falta reconstruir: se fija el tag exacto y se repite `pull` +
`up -d`.

```
APP_IMAGE=ghcr.io/jata-imk/presencia:sha-3accbd5
```

## Verificar

```bash
sudo docker compose -p presencia-prod --profile app ps
sudo docker compose -p presencia-prod logs --tail=30 worker

curl -s https://presencia.josetejero.com/api/health
curl -sI https://presencia.josetejero.com/calendario | head -1

# El bundle tiene que viajar comprimido (debe imprimir "content-encoding: gzip")
curl -sI -H 'Accept-Encoding: gzip' https://presencia.josetejero.com/ | grep -i content-encoding
```

El `ps` debe mostrar `app` como `healthy` y el `worker` sin reinicios. La ruta profunda tiene que
devolver 200, no 404: es el fallback del SPA.

El streaming se comprueba con el chat abierto en el navegador: el texto aparece palabra por palabra. Si
sale completo de golpe, falta el `proxy_buffering off`.

**El backup no está verificado hasta que se restaura — y no alcanza con que vuelvan los datos.**
Restaurar como superusuario prueba que los datos están; no prueba que **la app pueda usarlos**. El
superusuario se salta permisos y RLS, así que una base restaurada sin sus `GRANT` pasa esa prueba y
después devuelve `permission denied` a cada request. Por eso la comprobación de abajo pregunta por los
permisos **de los roles de la app**. Una vez, y después de cada cambio que toque el dump:

```bash
cd /opt/presencia

# 1. Bajar el dump desde R2 y meterlo al contenedor (/tmp de adentro no es /tmp del host)
sudo docker compose -p presencia-prod cp presencia-<fecha>.dump postgres:/tmp/prueba.dump

# 2. Restaurar en una base desechable, CON dueños y permisos
sudo docker compose -p presencia-prod exec -T postgres \
  psql -U presencia -d postgres -c "CREATE DATABASE restore_test;"
sudo docker compose -p presencia-prod exec -T postgres \
  pg_restore -U presencia -d restore_test /tmp/prueba.dump

# 3. ¿Puede usarla la app? Cada línea tiene que decir t
sudo docker compose -p presencia-prod exec -T postgres psql -U presencia -d restore_test -tA -c \
  "select has_table_privilege('presencia_app', 'public.chats', 'SELECT, INSERT');"
sudo docker compose -p presencia-prod exec -T postgres psql -U presencia -d restore_test -tA -c \
  "select pg_get_userbyid(nspowner) = 'presencia_jobs' from pg_namespace where nspname = 'pgboss';"

# 4. Limpiar (el archivo es una copia completa de producción)
sudo docker compose -p presencia-prod exec -T postgres \
  psql -U presencia -d postgres -c "DROP DATABASE restore_test;"
sudo docker compose -p presencia-prod exec -T postgres rm -f /tmp/prueba.dump
rm -f presencia-<fecha>.dump
```

Si el paso 3 da `f`, el dump no trae permisos y un restore real dejaría la app sin acceso.

**Restaurar en un servidor nuevo.** El dump guarda **a quién** pertenece cada objeto y **quién** tiene
permiso, pero no crea los roles: esos son del cluster, no de la base. Si faltan, `pg_restore` falla al
asignarlos. Antes de restaurar, con el superusuario:

```sql
CREATE ROLE presencia_app LOGIN;
CREATE ROLE presencia_worker LOGIN;
CREATE ROLE presencia_jobs LOGIN;
CREATE ROLE presencia_backup LOGIN BYPASSRLS;
GRANT pg_read_all_data TO presencia_backup;
```

Y después, los passwords como en el paso 2 del alta del entorno. **No correr `db:migrate` para esto:** la
base restaurada ya trae su historial de migraciones y no volvería a crear nada.

El estado de los jobs vive en tablas, y se consulta con el rol owner o con `presencia_jobs`
(`presencia_app` no tiene acceso al schema `pgboss`):

```sql
select name, cron, timezone from pgboss.schedule;
select name, state, created_on, output from pgboss.job order by created_on desc limit 20;
```

## Cuando algo falla

| Síntoma                                | Dónde mirar                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 502 en el navegador                    | El contenedor `app` no está arriba o no escucha en 3001: `ps` y `logs app`                       |
| `app` reinicia en bucle                | Falta una variable del `.env`: `logs app` la nombra (fail-fast de `env.ts`)                      |
| `worker` reinicia en bucle             | La cola no arrancó. Casi siempre `JOBS_DATABASE_URL` mal, o su rol sin password                  |
| El chat llega de golpe al final        | Falta `proxy_buffering off` en el vhost                                                          |
| `manifest unknown` en el `pull`        | Ese tag no existe: revisar el run de _Release_ en Actions                                        |
| `denied` / `unauthorized` en el `pull` | El paquete quedó privado: _Packages → presencia → Package settings → Change visibility → Public_ |
