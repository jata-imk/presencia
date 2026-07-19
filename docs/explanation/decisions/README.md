# Architecture Decision Records (ADRs)

Registro del QUÉ y el POR QUÉ de cada decisión de arquitectura de Presencia V1. Migrados del Design Doc de Notion (2026-07-14); **este directorio es la fuente de verdad** — si una decisión cambia, se actualiza aquí (nuevo ADR que reemplaza al viejo, nunca se borra historia).

Formato: **Decisión** → **Razón** → **Descartado**.

| ADR                                              | Tema                                                      |
| ------------------------------------------------ | --------------------------------------------------------- |
| [001](./adr-001-stack-typescript.md)             | Stack: TypeScript de punta a punta (Node.js + NestJS)     |
| [002](./adr-002-monolito-modular.md)             | Arquitectura: monolito modular                            |
| [003](./adr-003-multi-tenancy-rls.md)            | Multi-tenancy: shared schema + Row-Level Security         |
| [004](./adr-004-ia-multi-proveedor.md)           | IA: multi-proveedor vía Vercel AI SDK                     |
| [005](./adr-005-cards-tool-call.md)              | Cards de publicación: salida estructurada vía tool call   |
| [006](./adr-006-streaming-sse.md)                | Streaming: SSE sobre HTTP                                 |
| [007](./adr-007-auth-better-auth.md)             | Auth: Better Auth                                         |
| [008](./adr-008-jobs-pg-boss.md)                 | Jobs programados: pg-boss sobre Postgres                  |
| [009](./adr-009-publicacion-postfast-adapter.md) | Publicación: PostFast detrás de patrón adapter            |
| [010](./adr-010-canales-telegram-adapter.md)     | Canales de mensajería: Telegram primero, adapter de canal |
| [011](./adr-011-assets-object-storage.md)        | Assets: Object Storage externo desde día 1                |
| [012](./adr-012-creditos-ledger.md)              | Créditos: ledger contable transaccional                   |
| [013](./adr-013-orm-drizzle.md)                  | ORM y migraciones: Drizzle + drizzle-kit                  |

Decisiones pendientes de cerrar: proveedor(es) de generación de imágenes; modelo default por acción (según suite de regresión cultural).
