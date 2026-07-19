# ADR-013 · ORM y migraciones: Drizzle ORM + drizzle-kit

**Decisión:** Drizzle ORM como capa de acceso a datos y drizzle-kit para generar migraciones SQL versionadas en el repo (aplicadas por el rol `presencia_migrator` en deploy).

**Razón:**

- SQL explícito — crítico para el modelo RLS (ADR-003): `SET LOCAL`, policies, índices parciales se escriben tal cual.
- Soporte de RLS de primera clase en el schema (`pgPolicy`, roles), que Prisma no modela.
- Schema en TS puro: los tipos fluyen gratis al monorepo y convive natural con Zod (`drizzle-zod`) — alineado con ADR-001.

**Descartado:**

- **Prisma** — RLS incómodo: el motor gestiona el pool y esconde la transacción donde iría el `SET LOCAL`; DSL de schema propio.
- **Kysely** — query builder excelente pero sin capa de schema/migraciones: más piezas a mano.

**Ver también:** [`docs/reference/modelo-de-datos.md`](../../reference/modelo-de-datos.md) — el modelo que esta herramienta implementa.
