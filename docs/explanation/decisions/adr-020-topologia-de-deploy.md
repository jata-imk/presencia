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
