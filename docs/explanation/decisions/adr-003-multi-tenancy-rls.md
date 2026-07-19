# ADR-003 · Multi-tenancy: shared schema + Row-Level Security

**Decisión:** Una sola base Postgres, aislamiento lógico por columna `user_id` en cada tabla + políticas RLS como defensa en profundidad.

**Razón:** Los tenants son creators individuales (SaaS de consumo). Es el estándar de la industria. RLS hace que la base rebote fugas aunque un query olvide el `WHERE`.

**Descartado:**

- VPS por cliente — caro (~$30/cliente/mes), infierno operativo, nada del producto requiere cómputo aislado.
- Schema/DB por tenant — para B2B enterprise, no aplica.

**Ver también:** [`docs/reference/modelo-de-datos.md`](../../reference/modelo-de-datos.md) — dónde muerde el RLS tabla por tabla.
