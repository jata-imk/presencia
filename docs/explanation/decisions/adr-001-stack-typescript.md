# ADR-001 · Stack: TypeScript de punta a punta (Node.js + NestJS)

**Decisión:** Backend en Node.js + TypeScript con NestJS. Monorepo con el frontend React/TS y tipos compartidos vía Zod (`packages/shared`).

**Razón:** El ecosistema de IA en TS es primera clase (SDKs de proveedores, Vercel AI SDK, MCP SDK, grammY). Un solo lenguaje = tipos compartidos frontend/backend, mata bugs de contrato. NestJS da estructura tipo ASP.NET/Spring que paga con 5+ dominios de negocio.

**Descartado:**

- Python — la carga "de datos" es un GROUP BY, no ML.
- Fastify/Hono a pelo — sin estructura impuesta para tantos dominios.
