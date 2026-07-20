# Levantar el entorno de desarrollo

## Requisitos

- Node 22 (`nvm use` lee `.nvmrc`)
- pnpm 11 (`corepack enable` o instalar standalone)
- Git; `gh` CLI (`winget install GitHub.cli` + `gh auth login --web`)
- Docker — **en uno de los dos modos de abajo**, necesario a partir de F0

## Pasos

```bash
pnpm install        # instala workspaces + hooks de husky
pnpm lint           # ESLint en todos los packages
pnpm typecheck      # tsc --noEmit en todos los packages
pnpm format         # Prettier sobre todo el repo
pnpm --filter @presencia/api test   # tests de la API (requiere DB, ver abajo)
```

## Docker: dos modos

El proyecto usa Docker Compose (Postgres en dev; en staging/prod además caddy/app/worker). El engine puede vivir en dos lugares:

### Modo A — Engine local (máquinas con Docker Desktop)

```bash
docker compose up -d postgres
```

### Modo B — Engine remoto en VPS vía SSH (máquinas sin Docker, como la PC principal actual)

No se instala el engine local; los contenedores corren en el VPS y se controlan por SSH:

```bash
# Opción 1 (recomendada): CLI de Docker local apuntando al engine remoto
docker context create vps --docker "host=ssh://usuario@ip-del-vps"
docker context use vps
docker compose up -d          # los contenedores corren en el VPS

# Opción 2: sin CLI local — clonar el repo en el VPS y correr compose allá
ssh usuario@ip-del-vps "cd presencia && docker compose up -d"
```

Para que la app local (o un cliente SQL) alcance el Postgres remoto, túnel SSH:

```bash
# El puerto local debe coincidir con POSTGRES_PORT del .env (hoy 5434)
ssh -N -L 5434:localhost:5434 usuario@ip-del-vps
# ahora localhost:5434 apunta al Postgres del VPS
```

Notas del modo B:

- Requiere llave SSH configurada (`ssh-keygen` + `ssh-copy-id`).
- La Opción 1 solo necesita el CLI (`docker` + plugin compose), no el engine — en Windows se puede instalar standalone sin Docker Desktop.
- El VPS de staging cumple este rol naturalmente (dev/prod parity: mismo `docker-compose.yml`, distinto `.env`).

## Base de datos y variables (desde F1)

1. Copia `.env.example` a `.env` y llena las variables (las de F1: `APP_DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `WEB_URL`, `GOOGLE_GENERATIVE_AI_API_KEY`, `ZEPTOMAIL_TOKEN`, `MAIL_FROM`; desde F3 además las de IA multi-proveedor, ver abajo).
2. Aplica migraciones (rol owner): `pnpm --filter @presencia/api db:migrate`.
3. **Una sola vez por entorno**, asigna password al rol de runtime (la migración 0001 crea los roles sin password a propósito — un password en SQL versionado sería un secreto commiteado):

   ```sql
   ALTER ROLE presencia_app WITH PASSWORD 'el-password-de-tu-.env';
   ```

   `APP_DATABASE_URL` debe conectar con `presencia_app` (sujeto a RLS); `DATABASE_URL` (owner) queda solo para migraciones.

4. `pnpm dev` levanta api (puerto 3000) y web (5173, con proxy `/api` → 3000). La API lee `.env` de la raíz vía `tsx --env-file`.
5. `pnpm --filter @presencia/api test` corre los tests de la API (vitest). El test de RLS (`src/db/rls.spec.ts`, DoD de F2) conecta contra la base real como `presencia_app` usando el mismo `.env` — necesita la DB alcanzable (túnel o compose local).

## IA multi-proveedor (desde F3, ADR-004)

- El modelo activo se elige con `AI_MODEL` (formato `proveedor:modelo`, ej. `google:gemini-3.5-flash`, `openai:gpt-5-mini`, `minimax:MiniMax-M2`). Cambiar de proveedor = editar la variable y reiniciar el proceso (`pnpm dev` en local, reciclar contenedor en prod).
- Solo la API key del proveedor de `AI_MODEL` es obligatoria; `OPENAI_API_KEY` y `MINIMAX_API_KEY` son opcionales (sin key, ese proveedor no se registra y `resolveModel` truena con mensaje claro).
- Suite de regresión cultural: `pnpm --filter @presencia/api suite:cultural` corre los prompts de `apps/api/scripts/cultural-suite/` contra los modelos de `AI_SUITE_MODELS` (o el trío default) y deja el reporte en `docs/reference/suite-cultural/`.

## VS Code

Al abrir el repo, VS Code sugiere las extensiones de `.vscode/extensions.json` (ESLint, Prettier, Tailwind, Docker, GitLens, Error Lens, EditorConfig, Mermaid). Acepta instalarlas: format-on-save y fix-on-save ya están configurados en `.vscode/settings.json`.
