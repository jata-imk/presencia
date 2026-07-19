# Levantar el entorno de desarrollo

## Requisitos

- Node 22 (`nvm use` lee `.nvmrc`)
- pnpm 11 (`corepack enable` o instalar standalone)
- Docker Desktop (para Postgres local — necesario a partir de F0)
- Git; `gh` CLI recomendado (`winget install GitHub.cli`)

## Pasos

```bash
pnpm install        # instala workspaces + hooks de husky
pnpm lint           # ESLint en todos los packages
pnpm typecheck      # tsc --noEmit en todos los packages
pnpm format         # Prettier sobre todo el repo
```

A partir de F0: `docker compose up -d postgres` y `pnpm dev` (por definir en el scaffolding).

## VS Code

Al abrir el repo, VS Code sugiere las extensiones de `.vscode/extensions.json` (ESLint, Prettier, Tailwind, Docker, GitLens, Error Lens, EditorConfig, Mermaid). Acepta instalarlas: format-on-save y fix-on-save ya están configurados en `.vscode/settings.json`.
