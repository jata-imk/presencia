# Presencia

**Tu marca personal, en automático.** Asistente conversacional de contenido para creators mexicanos: genera, adapta, programa y analiza publicaciones manteniendo la voz del creator — con profundidad cultural que las IA genéricas no tienen.

## Estructura del monorepo

```
apps/web         → Frontend React (Vite + TypeScript)
apps/api         → Backend NestJS (API, SSE del chat, webhook Telegram)
packages/shared  → Tipos y schemas Zod compartidos frontend/backend
docs/            → Documentación (framework Diátaxis) — fuente de verdad técnica
```

## Empezar

```bash
nvm use            # Node 22 (ver .nvmrc)
pnpm install
pnpm lint
pnpm typecheck
```

## Documentación

- Empieza por [`CLAUDE.md`](./CLAUDE.md) — índice del proyecto para humanos y agentes.
- Producto: [`docs/explanation/product/`](./docs/explanation/product/)
- Decisiones de arquitectura (ADRs): [`docs/explanation/decisions/`](./docs/explanation/decisions/)
- Modelo de datos: [`docs/reference/modelo-de-datos.md`](./docs/reference/modelo-de-datos.md)

La gestión de proyecto (roadmap F0–F13, tareas) vive en Notion; la verdad técnica vive aquí.
