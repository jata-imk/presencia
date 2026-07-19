# Presencia — Guía del proyecto

## Qué es

Presencia es un SaaS conversacional para creators mexicanos: un asistente de contenido que genera, adapta, programa y analiza publicaciones para redes sociales manteniendo la voz del creator. El diferenciador NO es el multi-canal ni la programación (commodity vía PostFast): es la **profundidad cultural** — habla español mexicano (tutea, nunca "vos/querés"), conoce el mercado y el registro del usuario. Beachhead: Mérida/sureste de México.

V1: web app (React) + bot de Telegram, 5 módulos (Chats, Calendario, Ritmo, Analíticas, Biblioteca) + Configuración con Voz de marca. Monetización por créditos (ledger). Producto solo-founder (Jose): decisiones bien razonadas > opciones sin criterio; si algo parece mal pensado, dilo.

## Mapa de documentación (Diátaxis)

| Dónde                         | Qué hay                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `docs/explanation/product/`   | Lore docs: overview (leer primero), chat, calendario, ritmo, configuración/voz de marca |
| `docs/explanation/decisions/` | ADRs 001–012 — fuente de verdad de arquitectura                                         |
| `docs/reference/`             | Contratos: modelo de datos + RLS, infraestructura, design tokens, (futuro) API          |
| `docs/how-to/`                | Recetas operativas: entorno, trabajar con IA, (futuro) deploy y backups                 |
| `docs/tutorials/`             | Vacío hasta que exista código que recorrer                                              |

La gestión de proyecto (roadmap F0–F13) vive en Notion (página "Presencia"). La verdad técnica vive en este repo.

## Stack (ver ADRs para el porqué)

- **Monorepo:** pnpm workspaces + Turborepo. `apps/web` (React + Vite + TS), `apps/api` (NestJS), `packages/shared` (schemas Zod).
- **Datos:** Postgres, multi-tenant por `user_id` + RLS (ADR-003). Jobs con pg-boss (ADR-008).
- **IA:** Vercel AI SDK multi-proveedor — Gemini/OpenAI/MiniMax (ADR-004). Cards por tool call con schema Zod por arquetipo (ADR-005). Streaming por SSE (ADR-006).
- **Auth:** Better Auth, UI propia (ADR-007).
- **Publicación:** PostFast detrás de interfaz `PublishingProvider` (ADR-009). Telegram con grammY detrás de adapter de canal (ADR-010).
- **Infra:** Docker Compose (caddy/app/worker/postgres), Contabo VDS + Object Storage S3 (ADR-011). Dev/prod parity: staging corre el mismo compose que prod.

## Reglas duras (no negociables)

1. **Registro cultural:** todo copy de producto en español mexicano neutro-profesional. Tutear. Nunca "vos/querés".
2. **Tokens, no hex:** ningún color/espaciado hardcodeado en componentes; siempre design tokens (CSS variables / theme de Tailwind).
3. **PostFast es plomería:** nunca llamar su API directo desde lógica de negocio; siempre a través del adapter.
4. **Créditos = ledger:** nunca un contador simple; todo movimiento es un asiento transaccional (ADR-012).
5. **Una sola fuente de verdad por concepto:** voz de marca, conversación canónica, ledger. Los canales (web/Telegram) son adapters sobre el mismo store.
6. **YAGNI:** nada de infra "por si acaso". La lista de lo que NO va en V1 está en el overview §8 — respetarla.
7. **Cambio de arquitectura ⇒ actualizar su ADR** en el mismo PR.

## Convenciones

- Conventional Commits (commitlint lo exige). Código y nombres en inglés; docs de producto en español.
- **NestJS: inyección con `@Inject(X)` explícito** en todo constructor. El runner dev (tsx/esbuild) no emite `emitDecoratorMetadata`, así que Nest no puede inferir tipos: sin el decorator, la dependencia llega `undefined` en dev (y explota en el primer request).
- `pnpm lint && pnpm typecheck` deben pasar antes de commit (husky lo fuerza vía lint-staged).
- Node 22 (`.nvmrc`), pnpm como único package manager.
