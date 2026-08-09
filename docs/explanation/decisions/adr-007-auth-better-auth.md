# ADR-007 · Auth: Better Auth (rodar el flujo, no los primitivos)

**Decisión:** Better Auth para plomería (sesiones, argon2, verificación de email, OAuth futuro). UI 100% propia (las 8 pantallas ya diseñadas en Claude Design).

**Razón:** Rodar hashing/tokens/crypto propios es la receta clásica del desastre.

**Descartado:**

- Clerk y similares — UI impuesta, vendor lock-in.
- Crypto artesanal.

**Addendum (F4, 2026-08-08) — campos propios del usuario vía `additionalFields`, no tabla aparte.** `onboardingCompletedAt` y `timezone` (capturado en el paso 1 del onboarding) viven como `additionalFields` en `apps/api/src/auth/auth.ts`, no en una tabla `profiles` separada — son atributos del usuario, no un dominio propio. El servidor declara `input`/`required`/`type`/`defaultValue` por campo; el cliente (`apps/web/src/lib/auth-client.ts`) replica el mismo shape a mano vía el plugin `inferAdditionalFields` de `better-auth/client/plugins` (`apps/web` no depende de `@presencia/api`, así que no hay import compartido — es duplicación deliberada y acotada a un objeto de config). Ojo: el parser JSON del cliente de Better Auth revive strings ISO-8601 a `Date` automáticamente sin importar el `type` declarado — cualquier campo de fecha llega como `Date | null` al front pese a estar tipado `string` en el server. `ProtectedLayout` (`apps/web/src/routes/protected.tsx`) usa `onboardingCompletedAt === null` como el único gate de onboarding: cuentas viejas (pre-F4) tienen la columna NULL y por tanto SÍ ven onboarding en su próximo login — es el comportamiento esperado, no un bug.
