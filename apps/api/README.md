# apps/api

Backend NestJS. En F0: health endpoint (`GET /health`) + schema Drizzle del modelo aprobado.

```bash
pnpm dev                # tsx watch (puerto 3000)
pnpm db:generate        # genera migración desde src/db/schema.ts
pnpm db:migrate         # aplica migraciones (requiere DATABASE_URL)
```

- Schema: `src/db/schema.ts` — implementa `docs/reference/modelo-de-datos.md`.
- Migraciones: `drizzle/` — `0000` (tablas/enums), `0001` (roles + RLS: ENABLE/FORCE + policy `tenant_isolation` por tabla).
- Regla RLS: toda transacción de request fija `SET LOCAL app.user_id` antes de tocar tablas de dominio (llega con la capa de datos en F1).
