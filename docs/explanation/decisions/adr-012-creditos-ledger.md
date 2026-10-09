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

**`voice_preview` (F9.7) cobra por tokens y sin referencia.** Es el "Ver ejemplo de tu voz" de Configuración: un post de muestra con el mismo modelo y el mismo system prompt que el chat, así que se cobra con `charge()` y la tarifa del chat (`perThousandTokens.voice_preview = CHAT_RATE`). A diferencia de la narración, **no se deduplica**: el ejemplo es efímero y no hay fila a la que apuntar, y cada click es una llamada nueva al modelo que de verdad se paga. Un texto vacío no cobra, pero su fila de `ai_usage_events` se escribe igual. El botón no anuncia precio: el costo se ve en la cuota.

**`trend_refresh` sí tiene tarifa fija**, al revés que `ritmo_narration`, y la distinción vuelve a ser la de F5: se cobra fijo lo que cuesta lo mismo siempre. Acá el grueso del costo ni siquiera son tokens — el fee del grounding se cobra **por consulta de búsqueda** (medidas, cuatro por refresco), y los dos modelos que intervienen aportan unos pocos miles de tokens entre ambos. Cobrarlo con `charge()` subestimaría justo la parte cara.

**El `reference_id` obligó a una tabla, otra vez.** `user_trends` es un upsert: una fila por usuario cuyo id no cambia entre refrescos. Apuntar el asiento ahí habría hecho que el segundo cobro chocara contra `ledger_dedup` y se perdiera **en silencio** — cobrado una vez, gratis para siempre. `trend_refreshes` da un uuid nuevo por refresco, y de paso el candado contra el doble click y el registro de si ese refresco era cobrable.

**El 402 se armaba en tres lugares.** `InsufficientQuotaError` → `HttpException({ code: "quota_exhausted", quota })` estaba copiado en el chat y en la narración de Ritmo, y el comentario del primero seguía afirmando que era "un solo lugar". El refresco habría sido la tercera copia, así que se movió a `CreditsService.assertQuotaOr402`. Tres copias de una puerta de cobro es como se llega a que una devuelva otro código y el front deje de reaccionar.

**Y el precio se anuncia antes de gastarse.** `flatActionPercentOfQuota` traduce la tarifa a porcentaje de la cuota del mes, porque el objeto contable que ya existía no alcanza: `unitsToPublications` redondea hacia abajo contra 1.000 unidades, así que todo lo que cuesta menos de una publicación se muestra como "0". El porcentaje distingue, y nunca se redondea a cero — "0%" en un botón que cobra es mentira, aunque sea de redondeo. La regla se mantiene: la web nunca ve la unidad cruda.

**`spend` aprende a sobregirar, con llave.** `allowOverdraft` es opt-in y solo para **costos ya incurridos**. El default sigue siendo rechazar, porque el caso normal de `spend` es cobrar antes de producir el efecto y ahí negarse no cuesta nada. El refresco de tendencias es al revés: se cobra al terminar una búsqueda de ~40 segundos, y para entonces el gasto con el proveedor ya ocurrió. Negarse no devuelve ese dinero — solo tira el resultado y lo deja sin asentar. Con esto, `spend` y `charge` quedan alineados en la doctrina de siempre: **el asiento registra el costo real, y lo que evita que el sobregiro pase seguido es el gate, no el asiento.**

## Addendum (2026-09-27, F10 PR1) — la imagen se cobra por imagen

**`image_generation` es tarifa fija por imagen** (`RATE_CARDS.flat.image_generation`). Es el caso que la doctrina de F5 ya nombraba: una imagen cuesta lo mismo siempre. Por eso las tareas `image_generate` e `image_edit` quedan fuera de `TokenBilledTaskKind`, aunque el proveedor reporte tokens por imagen (Gemini, ~1.500 de salida a 1K). Esos tokens van a `ai_usage_events` como telemetría, con `images_count` al lado, y no se cobran.

**Misma tarifa para los dos generadores (ADR-025).** Gemini cuesta ~$0.067 y `gpt-image-1.5` en calidad media ~$0.034–0.05. Cobrarlos distinto le pondría precio a "Probar con otro generador", y el usuario elegiría por costo algo que es una pregunta de gusto.

**El valor se queda en 700 unidades por imagen, sin subir de versión.** No hay contra qué calibrarlo todavía: la unidad no tiene precio en dólares, y el resto del rate card sigue esperando datos reales ("Backlog · Calibrar rate card"). Con 700, un click de "Generar" —dos variantes— son 1.400 unidades, ~4.7% del mes del plan creator; una edición, ~2.3%. **Desde F10.7 (2026-10-07) un click es una imagen:** 700 unidades, ~2.3%, lo mismo que una edición; la tarifa por imagen no cambió. Recalibrar pasa por subir `CURRENT_RATE_CARD_VERSION` como siempre.

**Lo que se cobra y cuándo (F10 PR3):** cada imagen entregada se cobra con `spend(..., allowOverdraft: true)` al volver del proveedor, porque ya se pagó. Antes de encolar se anuncia el % (`GET /api/images/config`, con `flatActionsPercentOfQuota`, que redondea una sola vez sobre las imágenes del click) y se valida con `assertQuotaOr402` por todas. Un bloqueo del proveedor, una falla, o una imagen que el proveedor dio pero no se pudo guardar **no cobran**. La referencia del asiento es la fila de `image_generations`, una por imagen, para que el dedup del ledger no pueda tragarse la segunda variante; y el asiento se escribe en la misma transacción que el asset y la liquidación de esa fila. Un job que pg-boss entregue dos veces no cobra dos: el segundo solo trabaja las filas que siguen `pending`. **Y lo que la card ya anunció como no cobrado se cumple:** pasado el corte de 5 min, la card muestra el trabajo como fallido ("no se cobró"); el cobro de cada imagen vuelve a preguntar, con la card bloqueada, si el lote sigue siendo el trabajo vivo, y si no, la imagen se guarda en sus versiones sin cobrar. Por lo mismo, subir o elegir otra imagen da por reemplazado un "generando" vencido, para que no termine tarde y pise la imagen elegida (review de la fase F10).

## Addendum (2026-09-29, F10.5 PR4) — `card_rewrite`, el cambio por IA sobre una card

"Pide un cambio a este borrador" se cobra **por tokens** con `charge()`, tarea `post_adapt` y motivo nuevo `card_rewrite` (migración 0041). Mismo caso que `voice_preview`: cuesta lo que ocupa la reescritura, así que no hay tarifa fija ni % en el botón.

- **Gate:** `assertQuotaOr402(minimumTurnUnits)` antes de llamar al modelo, como un turno de chat.
- **Mismo principio de "o se cobra y se produce, o ninguna de las dos":** el asiento va en la misma transacción que la versión nueva de la card.
- **Una respuesta que no pasa el schema** se registra en `ai_usage_events` y **se cobra** (el proveedor la facturó), pero no deja versión.
- **Detener no cobra.** El DELETE explícito aborta la llamada, y una abortada no deja versión. Detenida a media llamada, el SDK no entrega usage de lo que el proveedor alcanzó a generar: es el mismo hueco conocido que un turno de chat abortado (ADR-006), y se acepta igual.

## Addendum (2026-10-06, F10.7 PR2) — el razonamiento va en la tarifa, no aparte

Desde F10.7 el esfuerzo de razonamiento se elige por modelo (`openai:gpt-6-luna@high`, ADR-004), y el chat corre en `high`. El proveedor cobra lo que el modelo piensa como tokens de salida, y `outputTokens` del SDK los incluye. Con la v1, un turno en `high` le habría gastado al creator más % de cuota que el mismo pedido en `medium`, por algo que no ve y que no eligió.

- **Rate card v2** (`CURRENT_RATE_CARD_VERSION = 2`): mismas tarifas, con `outputBasis: "visible"`. La salida que se cobra es `outputTokens − reasoningTokens`. La v1 se queda con `"total"`: los asientos viejos se re-derivan con su fórmula, como pide el versionado de este ADR.
- **Lo habitual en productos de consumo.** Se cobra por uso visible o por mensaje, con el costo de pensar ya metido en la tarifa. Cobrar al creator el razonamiento token por token es cosa de las APIs.
- **Las unidades no suben.** En la suite cultural del 2026-10-06, un turno con `gpt-6-luna@high` costó $0.0003 contra $0.0077 de `gpt-5.6-terra@medium`, con el que se fijaron las tarifas provisionales. Pensar es el 32% de la salida de Luna, y aun así queda ~25× por debajo. La recalibración completa sigue en "Backlog · Calibrar rate card con datos reales de consumo".
- **Un solo armado del usage:** `chargeUsageOf()` (`credits/rate-card.ts`) convierte el usage del SDK en lo que cobra `charge()`, razonamiento incluido. Antes cada call site lo armaba a mano y cualquiera podía olvidar el campo nuevo.
- **Sin dato de razonamiento** (proveedores que no lo reportan), se cobra la salida completa, como en v1.

## Addendum (2026-10-07, F10.8 PR1) — `chat_title`: el título automático se cobra

Decisión de Jose: el título automático del chat **se cobra** con la tarifa utility (`perThousandTokens.chat_title = UTILITY_RATE`, que ya existía en el rate card), y no lo absorbe el negocio.

- **Una vez por chat:** la referencia del asiento es el chat (`reference_type = 'chat'`), así que el dedup del ledger impide un segundo cobro. Un título real ronda 330 tokens de entrada y 15 de salida: 1 unidad, el mínimo de `quoteChatTurn`.
- **Solo si el título quedó escrito**, en la misma transacción que el `UPDATE`. Si el modelo dice que todavía no hay tema, o el creator renombró mientras tanto, no se cobra. La llamada sí queda en `ai_usage_events`: se pagó igual.
- **Sin gate previo:** corre después de un turno que ya pasó por `assertQuotaOr402`, y cuesta 1 unidad.

## Addendum (2026-10-08, F10.8 PR2) — `history_compaction`: compactar se cobra

Decisión de Jose: compactar el historial **se cobra** con la tarifa utility (`perThousandTokens.history_compaction`, ya en el rate card). Las condiciones:

- **Un asiento por compactación.** La referencia es el último mensaje que cubre el resumen (`reference_type = 'message'`), así que dos jobs del mismo tramo no cobran dos veces.
- **Solo si el resumen quedó guardado y avanzó,** en la misma transacción que el resumen.

Medido en dev: ~750 tokens de entrada y ~310 de salida, 4 unidades. Se paga sola: cada turno siguiente manda el resumen en vez del tramo completo, y en un chat largo (40k+ tokens de contexto, ~320 unidades por mensaje) el ahorro por turno es varias veces su costo.
