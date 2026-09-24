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

## Addendum (2026-09-08, F8 PR3) — el job diario, y por qué NO reemplaza a la ruta perezosa

`credits.cycle`, cron diario (09:00 UTC). Recorre a todos los usuarios y llama `CreditsService.refreshCycle`, que es `lockUser` + `ensureCurrentCycle` — el mismo cálculo de siempre, con el mismo advisory lock.

**La frase que había que corregir** es la de este ADR y la de `cycle.ts`: decían que F8 cambiaría el disparador, "cron en vez de alguien pidió su saldo". Se agregó el cron, pero el perezoso **no se va**, y no por conservadurismo: `charge()` y `spend()` llaman a `ensureCurrentCycle` dentro de SU transacción y bajo el mismo lock, y eso es lo que garantiza que un cobro nunca ocurra sobre un ciclo sin liquidar. Un cron que corre una vez al día no puede dar esa garantía — entre dos corridas hay 24 horas en las que alguien puede cruzar su aniversario y gastar.

Entonces el job no es la fuente de verdad del ciclo, es un **adelanto**: hace que el `monthly_grant` de alguien que no abre la app en dos meses exista igual. Que las dos rutas puedan convivir sin pisarse es consecuencia de que `ensureCurrentCycle` sea idempotente bajo lock, que ya era su diseño desde F5.

**Por qué recorre a todos los verificados y no solo a quienes les toca renovar hoy:** filtrar en SQL por aniversario exigiría reimplementar en la query el cálculo que vive en `cycle.ts`, y duplicar esa regla es peor que un pase de más al día — `ensureCurrentCycle` no escribe nada cuando el ciclo ya está otorgado.

**Pero sí filtra por `email_verified`, y eso no es cosmético.** Sin ese filtro, cada cuenta sin verificar acumularía **dos asientos por mes para siempre**: para un usuario dormido con saldo del ciclo anterior, `ensureCurrentCycle` escribe el `cycle_expiration` del viejo y el `monthly_grant` del nuevo. Antes del job esas filas no existían hasta que el usuario volviera; con el cron existirían para cuentas que nunca van a entrar. Y el ledger es append-only por el motor desde la migración `0008`, así que no se limpian después. Una cuenta sin verificar no puede entrar (gate de F1); si algún día verifica, la ruta perezosa le otorga su ciclo en el primer acceso.

**El techo del pase son 15 minutos, no un día — y hay que declararlo.** pg-boss expira los jobs a los 15 minutos por default, y al expirar marca el job `failed` **con el handler todavía corriendo**; como la policy `exclusive` solo cuenta los jobs en `created`/`active`, el slot queda libre y el tick siguiente puede arrancar un segundo pase concurrente sobre los mismos usuarios. Por eso `RecurringJob.expireInSeconds` es obligatorio y no tiene default: cada job declara su techo (este, una hora). El límite real del pase serial —una transacción y un advisory lock por usuario— es esa ventana, no la del cron.

**Lo que los tests cubren y lo que no.** Se prueban `refreshCycle` (otorga el ciclo de un usuario dado de alta hace dos meses que nunca entró, y correrlo dos veces no lo duplica) y `listAllUserIds`. **No** se ejercita `refreshAllCycles()` entero: toma un advisory lock sobre cada usuario de la base, y la suite corre en paralelo con specs que crean y borran usuarios todo el tiempo — probarlo ahí medía la contención, no el job (se comió los 20s de timeout en el primer intento). Queda sin cubrir el `for` con su `try/catch`, que es la parte sin reglas.

## Addendum (2026-09-16, F8.6) — un rol menos

`0022_drop_presencia_worker` eliminó `presencia_worker`, que nunca se usó. El `REVOKE UPDATE, DELETE` de
`0008` sigue vigente sobre `presencia_app`, el único rol de datos que queda (API y worker).

## Addendum (2026-09-20, F9 PR7) — el segundo call site de `charge()`

Hasta F9, `charge()` **hardcodeaba** `reason: "chat_message"`. Con un solo call site eso era invisible; con el segundo se vuelve un asiento que miente sobre su origen, y el ledger no tiene cómo notarlo. Ahora `reason` es un campo obligatorio de `ChargeInput`, sin default: un call site nuevo tiene que declarar por qué cobra o no compila.

**`ritmo_narration` cobra por tokens, no con tarifa fija**, y por eso no está en `RATE_CARDS.flat`. Es la misma distinción de F5 entre `spend()` y `charge()`: una imagen cuesta lo mismo siempre, un texto cuesta lo que ocupa. Narrar usa el tier `AI_MODEL_UTILITY` (`MODEL_BY_TASK.analytics_narration`), así que un cobro típico es de unas pocas unidades contra las 30.000 del tier más chico.

**La deduplicación por día no la hace un `if`, la hace una tabla.** El índice `ledger_dedup` necesita un `reference_id` **uuid**, así que la llave `'<userId>:<YYYY-MM-DD>'` que se había anotado en el plan no cabía en la columna. La narración se guarda en `ritmo_narrations`, única por `(user_id, day)`, y el asiento apunta a esa fila. Esto resuelve además un problema que la llave sintética no resolvía: sin guardar el texto, el segundo click del día habría pagado la llamada al modelo para después descubrir que no debía cobrarla — el usuario no lo nota y el gasto sí.

Dos clicks simultáneos chocan contra el índice único, no contra una condición que puede perder la carrera: el que pierde devuelve la narración del ganador y **no cobra**. Se pierde una llamada al modelo en ese caso raro, que es preferible a cobrar dos veces el mismo día.

**El `day` es el día local del usuario** (`users.timezone`), no UTC. Con UTC, a alguien en Mérida la ventana de cobro se le cortaría a las 18:00 y el botón volvería a cobrarle esa misma tarde.

**El gate es de 1 unidad, no de `minimumTurnUnits`.** Ese piso es de un turno de chat, que cuesta un orden de magnitud más; acá la pregunta no es "¿te alcanza?" sino "¿te queda algo?". Sin ningún gate, una cuenta agotada seguiría generando texto gratis, una vez por día, indefinidamente.

## Addendum (2026-09-24, F9.6 PR2) — `trend_refresh`, y una puerta de cobro en un solo lugar

**`trend_refresh` sí tiene tarifa fija**, al revés que `ritmo_narration`, y la distinción vuelve a ser la de F5: se cobra fijo lo que cuesta lo mismo siempre. Acá el grueso del costo ni siquiera son tokens — el fee del grounding se cobra **por consulta de búsqueda** (medidas, cuatro por refresco), y los dos modelos que intervienen aportan unos pocos miles de tokens entre ambos. Cobrarlo con `charge()` subestimaría justo la parte cara.

**El `reference_id` obligó a una tabla, otra vez.** `user_trends` es un upsert: una fila por usuario cuyo id no cambia entre refrescos. Apuntar el asiento ahí habría hecho que el segundo cobro chocara contra `ledger_dedup` y se perdiera **en silencio** — cobrado una vez, gratis para siempre. `trend_refreshes` da un uuid nuevo por refresco, y de paso el candado contra el doble click y el registro de si ese refresco era cobrable.

**El 402 se armaba en tres lugares.** `InsufficientQuotaError` → `HttpException({ code: "quota_exhausted", quota })` estaba copiado en el chat y en la narración de Ritmo, y el comentario del primero seguía afirmando que era "un solo lugar". El refresco habría sido la tercera copia, así que se movió a `CreditsService.assertQuotaOr402`. Tres copias de una puerta de cobro es como se llega a que una devuelva otro código y el front deje de reaccionar.

**Y el precio se anuncia antes de gastarse.** `flatActionPercentOfQuota` traduce la tarifa a porcentaje de la cuota del mes, porque el objeto contable que ya existía no alcanza: `unitsToPublications` redondea hacia abajo contra 1.000 unidades, así que todo lo que cuesta menos de una publicación se muestra como "0". El porcentaje distingue, y nunca se redondea a cero — "0%" en un botón que cobra es mentira, aunque sea de redondeo. La regla se mantiene: la web nunca ve la unidad cruda.

**`spend` aprende a sobregirar, con llave.** `allowOverdraft` es opt-in y solo para **costos ya incurridos**. El default sigue siendo rechazar, porque el caso normal de `spend` es cobrar antes de producir el efecto y ahí negarse no cuesta nada. El refresco de tendencias es al revés: se cobra al terminar una búsqueda de ~40 segundos, y para entonces el gasto con el proveedor ya ocurrió. Negarse no devuelve ese dinero — solo tira el resultado y lo deja sin asentar. Con esto, `spend` y `charge` quedan alineados en la doctrina de siempre: **el asiento registra el costo real, y lo que evita que el sobregiro pase seguido es el gate, no el asiento.**
