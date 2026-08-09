# ADR-012 · Créditos: ledger contable transaccional

**Decisión:** Tabla de asientos (movimientos +/−) con decremento transaccional. Nunca un contador simple.

**Razón:** Un contador se corrompe con race conditions. El ledger da auditabilidad (qué acción costó qué) — independiente de cómo se presente el saldo al usuario.

## Addendum (2026-08-09) — modelo de presentación: suscripción + %, no contador visible

Decisión tomada en conversación con Jose (fuera de esta sesión), aplicada aquí tras detectar que nunca se había documentado: se descarta el modelo prepago de créditos visibles ("te quedan X créditos") — genera ansiedad de consumo y fricción de recompra. Modelo real: **suscripción con cuota incluida** (tiers Creator / Pro / Agencia) + top-up opcional, igual que Claude/Codex.

Esto **no cambia el diseño del ledger**, lo aterriza en tres capas independientes:

| Capa         | Qué es                                                                                                                                                                                        | Quién la ve                      |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Medición     | Crudo del proveedor (`provider`, `model`, `tokens_in`, `tokens_out`, ...) — vive en `ai_usage_events` (ADR-004, F4.5)                                                                         | Nadie directamente, solo queries |
| Asignación   | La cuota del plan, en **unidades normalizadas enteras** (nunca tokens directos — no expresan el costo de una imagen; nunca dólares directos — los precios de proveedor cambian bajo los pies) | Nadie directamente               |
| Presentación | % de cuota restante, traducido a objeto contable ("te alcanza para ~N publicaciones más")                                                                                                     | El usuario                       |

El monto del ledger va en la capa de Asignación, con **rate card versionado**: al cambiar tarifas, los asientos viejos siguen cuadrando con la tarifa vigente cuando se registraron. La lista exacta de qué cuenta como 1 unidad y su costo por acción es trabajo de F5 con valores provisionales; se calibra después con datos reales (Backlog · Calibrar rate card, bloqueada por consumo real).

**Por qué importa seguir definiendo la unidad aunque ya no sea visible:** cuando el crédito era visible, un usuario molesto era la señal de que algo estaba mal calibrado. Con el porcentaje, la única persona que puede detectar que el rate card está sangrando margen es el founder, en una query — silencioso no es lo mismo que inexistente.

## Addendum (2026-08-09) — implementación (F5)

- **Anti-race:** `pg_advisory_xact_lock(hashtextextended(user_id, 0))` serializa lecturas-luego-escrituras del ledger de un mismo usuario dentro de la transacción — es el mecanismo real detrás del DoD ("una acción concurrente doble no produce saldo negativo"), no el CHECK `delta <> 0` ni el índice único de idempotencia. Verificado con un test de race condition real contra Postgres (`credits/credits.service.spec.ts`): dos `spend()` concurrentes con saldo para una sola acción, exactamente uno gana.
- **Política de sobregiro:** `CreditsService` distingue dos verbos. `spend()` (imagen, multi-adapt, calendario semanal — costo conocido antes de ejecutar) rechaza si no alcanza, nunca deja saldo negativo. `charge()` (turno de chat — costo solo se conoce al terminar el stream) registra el costo real del turno aunque deje saldo negativo; el asiento nunca miente ni se recorta al saldo disponible. El gate `assertHasQuota` (bloqueo suave antes de arrancar un turno) es lo que evita que el sobregiro sea frecuente, no un tope duro en `charge()`. La UI nunca muestra negativo — se clampea a 0%.
- **Ciclo mensual perezoso:** hasta que F8 traiga el job de pg-boss, `CreditsService.ensureCurrentCycle` calcula y otorga el ciclo en el primer acceso a la cuota tras el aniversario mensual de `users.created_at`, bajo el mismo advisory lock. Mismo cálculo que usará el job — F8 solo cambia el disparador (cron en vez de "alguien pidió su saldo").
- **Rate card versionado:** `credits/rate-card.ts`, `credit_ledger.rate_card_version` (migración `0007_credits`). Valores hoy provisionales (ver "Backlog · Calibrar rate card con datos reales de consumo").
- **Append-only por el motor:** migración `0008_credits_ledger_append_only` revoca `UPDATE`/`DELETE` a `presencia_app`/`presencia_worker` — mismo patrón que `ai_usage_events` (F4.5).
