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
