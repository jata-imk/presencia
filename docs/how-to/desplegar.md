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
- **No definir `WORKER_INLINE`.** El compose lo fija en `false` en los dos servicios.

### 4. El vhost de CloudPanel

Sitio tipo **Reverse Proxy** hacia `http://127.0.0.1:3001`, y certificado de Let's Encrypt (el DNS tiene
que resolver antes de pedirlo).

**El bloque que no es opcional.** nginx acumula la respuesta por default, y el chat es streaming
(ADR-006): sin esto, la respuesta del modelo aparece completa de golpe al final, o se corta.

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
}
```

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
```

El `ps` debe mostrar `app` como `healthy` y el `worker` sin reinicios. La ruta profunda tiene que
devolver 200, no 404: es el fallback del SPA.

El streaming se comprueba con el chat abierto en el navegador: el texto aparece palabra por palabra. Si
sale completo de golpe, falta el `proxy_buffering off`.

El estado de los jobs vive en tablas, y se consulta con el rol owner o con `presencia_jobs`
(`presencia_app` no tiene acceso al schema `pgboss`):

```sql
select name, cron, timezone from pgboss.schedule;
select name, state, created_on, output from pgboss.job order by created_on desc limit 20;
```

## Cuando algo falla

| Síntoma                         | Dónde mirar                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------- |
| 502 en el navegador             | El contenedor `app` no está arriba o no escucha en 3001: `ps` y `logs app`      |
| `app` reinicia en bucle         | Falta una variable del `.env`: `logs app` la nombra (fail-fast de `env.ts`)     |
| `worker` reinicia en bucle      | La cola no arrancó. Casi siempre `JOBS_DATABASE_URL` mal, o su rol sin password |
| El chat llega de golpe al final | Falta `proxy_buffering off` en el vhost                                         |
| `manifest unknown` en el `pull` | Ese tag no existe: revisar el run de _Release_ en Actions                       |
