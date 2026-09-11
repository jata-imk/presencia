# Infraestructura V1

> Actualizado en F8.5 (2026-09-10), el primer despliegue real. La versión anterior venía del Design
> Doc de Notion (2026-07-14) y describía un plan —Contabo, Caddy, staging + prod— que no sobrevivió al
> contacto con la máquina que existe. Lo que sigue es lo que hay.

## El servidor

Un solo VPS **OVH**: 4 vCores, 8 GB RAM, Debian 12, con **CloudPanel** administrando nginx y los
certificados de Let's Encrypt. Dominio de la app: `presencia.josetejero.com`.

Hospeda **dos stacks de Docker Compose** con el mismo `docker-compose.yml` (regla de parity: lo que
cambia es el `.env`, el nombre del proyecto y el profile):

| Stack            | Servicios                   | Puertos del host (solo loopback) |
| ---------------- | --------------------------- | -------------------------------- |
| `presencia-dev`  | `postgres`                  | 5434                             |
| `presencia-prod` | `postgres`, `app`, `worker` | 5435, 3001                       |

```
docker compose -p presencia-dev  up -d                  # solo Postgres
docker compose -p presencia-prod --profile app up -d    # Postgres + app + worker
```

El desarrollo diario de Jose es **local en Windows, sin engine de Docker**: `pnpm dev` contra el
Postgres de `presencia-dev` por túnel SSH al 5434 (ver `docs/how-to/levantar-entorno.md`, modo B).

**Puertos del host ya ocupados, para no pisarlos:** el 3000 lo usa una aplicación Next.js ajena a este
proyecto, y el 5434 el Postgres de dev. Prod toma 3001 y 5435.

## Contenedores (por servicio, NO por cliente)

```
app        → NestJS: API, SSE del chat, webhook Telegram, y el SPA de apps/web
worker     → misma imagen, otro comando: consume pg-boss (ADR-008)
postgres   → datos de TODOS, aislados por user_id + RLS (ADR-003)
```

No hay contenedor de reverse proxy: ese papel lo hace el nginx de CloudPanel (**ADR-020**). El vhost
necesita `proxy_buffering off` y un `proxy_read_timeout` largo, o el streaming del chat (ADR-006) se
corta o llega de golpe al final.

## Cómo llega el código

CI construye la imagen y la publica en **GHCR** (`ghcr.io/jata-imk/presencia`); el VPS hace `pull`. El
paquete es público porque el repo lo es (ADR-019), así que el `pull` no necesita credenciales. El
deploy en sí es manual en V1: SSH al VPS, `docker compose pull`, `up -d`.

## Object Storage — ~€0/mes hoy

**Cloudflare R2** (API S3, free tier de 10 GB y egress $0). Buckets: backups y, cuando exista
Biblioteca, assets con prefijo por usuario. Ver ADR-011.

## Backups y riesgos aceptados

- **SPOF aceptado en V1:** un solo VPS. Mitigación obligatoria: snapshots del proveedor + `pg_dump`
  diario (job de pg-boss) hacia R2. _El backup que vive en el mismo servidor no es backup, es
  decoración._
- Un backup que no se restauró no cuenta como backup. La verificación es `pg_restore` en una base
  scratch, no que el objeto aparezca en el bucket.
- El cuello de botella esperado NO es el fierro: son los rate limits de los proveedores de IA. Camino
  de escala: resize del VPS → Postgres a caja propia/managed. Nunca microservicios/K8s por reflejo.
- 8 GB con dos Postgres encima da holgura hoy, no para siempre. Si aprieta: bajarle `shared_buffers`
  al de dev, o apagar el stack de dev mientras no se use.

## Lo que queda para F13 (hardening + launch)

Firewall y fail2ban, límites de recursos por contenedor, rotación de secretos, deploy automático
(llave SSH como secreto de GitHub), y la decisión de si prod se muda a una máquina más grande.

## Principios de ejecución

1. **Prioridad por dependencia y frecuencia de uso**, no por afinidad.
2. **YAGNI hasta que duela.**
3. **Una sola fuente de verdad por concepto.**
