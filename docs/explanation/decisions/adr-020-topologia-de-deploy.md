# ADR-020 · Topología de deploy: CloudPanel + imagen única, sin Caddy

**Decisión:** el despliegue de V1 es **una sola imagen Docker** que sirve el SPA y la API en el mismo
origen, corriendo detrás del **nginx que ya administra CloudPanel** en el VPS. La imagen la construye
CI y se publica en **GHCR**; el VPS solo hace `pull`. Un único host hospeda dos stacks de compose
—`presencia-dev` y `presencia-prod`— con el mismo `docker-compose.yml` y distinto `.env`.

**Razón:**

- **Same-origin no es opcional.** `apps/web` no tiene ninguna variable de entorno y llama a la API con
  rutas relativas (`/api/...`). Web y API tienen que responder bajo el mismo host o no hay app. La
  forma más barata de garantizarlo es que el mismo proceso sirva las dos cosas.

  Lo implementa `apps/api/src/serve-spa.ts`: estáticos con caché inmutable para los assets con hash,
  `index.html` con `no-store`, y fallback de historial para las rutas de `react-router`. El fallback
  deja pasar `/api`, y también todo lo que tenga extensión: una ruta del SPA no la tiene y un archivo
  sí, así que un archivo que falta recibe su 404 en vez del índice — devolver el index a un chunk que
  ya no existe convierte un fallo de red en un error de MIME.

- **CloudPanel ya trae nginx y Let's Encrypt.** Meter un contenedor Caddy delante significa dos
  reverse proxies en cadena, dos lugares donde configurar el buffering del SSE, y dos sitios donde
  buscar cuando algo devuelve 502.
- **El build no cabe cómodo en el VPS.** 4 vCores / 8 GB con dos Postgres encima; un `pnpm build` de
  turbo compitiendo con ellos es un riesgo gratuito cuando CI lo hace igual de bien y deja la imagen
  versionada por SHA.
- **Un solo artefacto desplegable.** `docker compose pull && up -d` es todo el deploy. No hay un
  segundo paso de "copiar el `dist` del SPA al host" que se pueda olvidar y dejar la UI vieja contra
  una API nueva.

**Descartado:**

- **Contenedor `caddy` como pedía `infraestructura.md`** — se escribió antes de saber que el VPS venía
  con CloudPanel. Doble proxy sin beneficio.
- **nginx sirviendo los estáticos desde el host** (`root` al `dist`, solo `/api` al proxy) — más
  rápido para servir archivos, pero parte el deploy en dos mitades que pueden desincronizarse, obliga
  a editar el vhost por encima de lo que CloudPanel administra, y a esta escala el ahorro es
  invisible.
- **Construir la imagen en el VPS** (`git pull && docker compose build`) — menos piezas, pero gasta
  CPU y RAM de la máquina que además corre la base, y deja el artefacto sin identidad: no hay forma de
  decir "volvamos a lo que estaba ayer" sin reconstruir.
- **Entorno de staging aparte** — `infraestructura.md` planeaba staging (€5.50) + prod (€27.52). Con
  cero usuarios no hay servicio que proteger: una máquina es prod y QA a la vez. Se reevalúa en F13.
- **`docker-compose.prod.yml` como archivo aparte** — rompe la regla de parity. Los servicios de
  aplicación van detrás de un profile de compose, así que el archivo es uno solo y el entorno de dev
  sigue levantando únicamente Postgres.

**Consecuencias operativas:**

- El vhost de CloudPanel **necesita** `proxy_buffering off` y un `proxy_read_timeout` largo, o el chat
  (SSE, ADR-006) llega completo de golpe al final o se corta. Mismo requisito para el stream de eventos
  de F8.6 (`GET /api/stream`), que además manda un heartbeat cada 20 s para no chocar con los timeouts
  de 900 s de la plantilla.
- El deploy es manual en esta fase: SSH, `pull`, `up -d`. Automatizarlo pide una llave SSH como
  secreto de GitHub, y eso es superficie de F13.
- Las migraciones se aplican desde la laptop por túnel SSH con el rol owner (`drizzle-kit` es
  `devDependency` y no viaja en la imagen de producción).

**Contexto:** decidido el 2026-09-10 al planear F8.5, el primer despliegue real. El VPS es OVH
(4 vCores / 8 GB, Debian 12 + CloudPanel), no el Contabo que describía el design doc original.

## Addendum (2026-10-08, F10.8 PR3) — Postgres con pgvector, sobre la misma Alpine

La memoria entre chats (F10.8) necesita `pgvector`, y `postgres:17-alpine` no lo trae.

- **Imagen propia:** `docker/postgres/Dockerfile` arma `postgres:17.10-alpine` con pgvector 0.8.7 compilado (`with_llvm=no`, `OPTFLAGS=""` para no atar el binario al procesador del runner). La versión menor de Postgres queda fija: actualizarla es una decisión, no algo que llegue con el siguiente merge.
- **Tag inmutable, publicado una vez:** `presencia-postgres:pg17.10-pgvector0.8.7`, derivado de los `ARG` del Dockerfile (la única fuente).
  - Lo publica un job aparte de `release.yml` (`postgres-image`), **solo si el tag todavía no existe en GHCR**.
  - Así, un deploy normal de la app, que también hace `pull` de postgres, nunca ve una base "nueva" ni recrea el contenedor, y el tag anterior siempre queda para volver.
  - La app se publica **después** (`publish` tiene `needs: postgres-image`). Si el build de Postgres falla, la app no se publica y `latest` no se mueve, porque el `docker-compose.yml` de ese commit pediría un tag que no existe y el `pull` del deploy fallaría. Se arregla re-corriendo el workflow. (Corregido en el review de cierre de F10.8: antes corrían en paralelo y la app se publicaba igual.)
  - CI exige que el default de `docker-compose.yml` sea el tag que dictan los `ARG`.
  - `POSTGRES_IMAGE` fija otra imagen sin tocar el compose.
- **Healthcheck por TCP** (`pg_isready -h 127.0.0.1`): durante el initdb, el entrypoint levanta un servidor temporal solo por socket, y sin `-h` ya respondería "listo".
- **Por qué no la oficial `pgvector/pgvector`:** solo existe sobre Debian. Pasar los datos de Alpine (musl) a Debian (glibc) cambia las collations, y con ellas el orden de los índices de texto, así que habría que reindexar prod con respaldo y ventana de mantenimiento. Sobre la misma Alpine, el directorio de datos sirve tal cual: el cambio es recrear el contenedor.
- **CI** deja de usar un service container para Postgres: construye esta imagen, la arranca y comprueba que `CREATE EXTENSION vector` carga, antes de correr las migraciones y los tests contra ella. La máquina de Jose no tiene Docker, así que CI es el único lugar donde la imagen se ejercita antes del VPS.
- **Orden de despliegue:** primero la imagen, en dev y luego en prod (`docs/how-to/desplegar.md`, "Postgres con pgvector"). La migración que crea la extensión llega en el PR siguiente: mientras nadie la use, la imagen nueva no cambia nada.
