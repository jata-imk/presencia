# ADR-007 · Auth: Better Auth (rodar el flujo, no los primitivos)

**Decisión:** Better Auth para plomería (sesiones, argon2, verificación de email, OAuth futuro). UI 100% propia (las 8 pantallas ya diseñadas en Claude Design).

**Razón:** Rodar hashing/tokens/crypto propios es la receta clásica del desastre.

**Descartado:**

- Clerk y similares — UI impuesta, vendor lock-in.
- Crypto artesanal.
