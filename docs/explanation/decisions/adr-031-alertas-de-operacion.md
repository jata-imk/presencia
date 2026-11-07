# ADR-031 · Alertas de operación: Telegram directo, vigilante externo

> **Aceptado (2026-11-06, F12.8).** Se construye en cuatro PRs: canal, estado y jobs fallidos (PR1); backup, `/api/health` y vigilante externo (PR2); cards degradadas y señal pasiva de los proveedores (PR3); prueba activa diaria (PR4). Las secciones de cada pieza dicen en qué PR llega.

**Decisión:** lo que corre solo avisa solo. Un job `ops.watch` en el worker revisa cada 5 minutos lo que puede fallar en silencio, guarda el estado de cada alerta en `ops_alerts` y le manda **al founder** un solo mensaje por pase con lo que cambió. Va por **Telegram, directo desde el worker**; si Telegram falla, por correo. Lo que un job no puede ver de sí mismo —que no corrió, que el worker o el VPS están caídos— lo vigila **un servicio de afuera** (Healthchecks.io y UptimeRobot). Regla corta: **la ausencia se vigila afuera, el fallo adentro.**

## Contexto

F8.5 dejó corriendo solos el backup diario a R2 (08:00 UTC), la reconciliación de cards (cada minuto), el ciclo de créditos y las métricas. Hasta esta fase, la única señal de un fallo era una fila `failed` en `pgboss.job`, que solo se ve abriendo la base. El modo de fallo peligroso no es que algo truene: es enterarse dos semanas tarde de que no hay respaldo. El 2026-10-31 pasó algo parecido con otro sistema: la cuenta de Anthropic se quedó sin saldo a media suite y nada avisó. En el chat, Sonnet es el último eslabón de la cadena y solo contesta cuando OpenAI y Google caen a la vez, así que un saldo en cero ahí se descubre el día que más se necesita.

Spec: página de Notion "F12.8 · Alertas de operación" (incluida la nota del 2026-11-05 sobre usar el bot de Telegram).

## El canal: Telegram directo desde el worker (PR1)

Las alertas nacen en el worker y el bot de Telegram vive solo en `app` (addendum F11 de ADR-008). Había dos formas de cruzar:

- **`pg_notify` a `app`**, que las manda con `TelegramBotService.notify`. Descartada: un aviso que depende de que `app` esté viva se pierde justo cuando `app` es lo que se cayó, y NOTIFY no es durable (sin nadie escuchando, el mensaje se pierde).
- **La API de Telegram directo desde el worker, con el mismo token.** Elegida. `new Api(token)` de grammY es la API suelta, sin `Bot`: `sendMessage` no consume updates, así que no choca con el webhook de `app` ni con el polling de dev.

El destino es `OPS_TELEGRAM_CHAT_ID` del `.env`: un chat_id fijo, no un vínculo de cuenta, porque las alertas son para operación y no para los creators. Si el envío por Telegram falla (token revocado, red), el aviso sale por correo a `OPS_ALERT_EMAIL` con ZeptoMail. En producción el arranque exige al menos uno de los dos; en dev, sin canal, el aviso queda en el log.

## El estado y el anti-spam (PR1)

`cards.reconcile` corre cada minuto y `ops.watch` cada cinco: avisar en cada pase serían docenas de mensajes por hora del mismo fallo. Por eso hay estado (`ops_alerts`, migración 0064) y la regla es:

- **se avisa al cambiar de estado**: cuando una alerta se prende y cuando se apaga ("Resuelto … duró 25 min");
- **mientras siga prendida, un recordatorio cada 24 h**, nada más;
- **un pase manda un solo mensaje** con todas sus transiciones, nuevas primero;
- **un aviso que no salió por ningún canal se reintenta** en el pase siguiente (`last_sent_at` null);
- **un "resuelto" de algo que nunca se avisó no se manda.**

**Cada chequeo es dueño de un prefijo de llaves** (`job:`, `cards:`, `saldo:`, `probe:`…). Toda alerta prendida con ese prefijo que el chequeo ya no ve se da por resuelta. Si el chequeo mismo truena, no se resuelve nada de su prefijo (no poder mirar no es ver que está bien) y se prende `chequeo:<nombre>`: un vigilante ciego también se avisa. Así `ops.watch` y la prueba diaria comparten tabla sin pisarse. Un prefijo que termina en `:` cubre las llaves que empiezan así; sin `:` es una llave exacta (`chequeo:jobs` no se come a `chequeo:jobs-lentos`). Y un chequeo que no alcanza a ver todo su prefijo dice qué llaves sí miró (`evaluadas`): la cola de un job que falló hace más de 7 días, y que pg-boss ya borró, sigue prendida en vez de darse por resuelta sin que nada se haya arreglado.

**Leer, mandar y guardar van en una sola transacción, con un candado** (`pg_advisory_xact_lock`). Dos pases que se crucen —`ops:vigilar` a mano mientras el worker corre el suyo— se serializan en vez de mandar el mismo aviso dos veces, y un estado que no se pudo guardar se vuelve a decidir entero en el pase siguiente. Para que el envío no deje la transacción colgada, cada canal tiene un techo de 20 s (grammY trae 500 s por default), muy por debajo de los 4 minutos en que expira `ops.watch`.

La lógica de decidir es pura (`ops/alert-state.ts`) y tiene su spec.

## Jobs fallidos (PR1)

Por cola, de la última semana de `pgboss.job` (pg-boss borra los terminados a los 7 días): la alerta `job:<cola>` está prendida si **el último job terminado falló, o si alguno falló en los últimos 30 minutos**. Lo primero cubre a los diarios: el backup que falla a las 08:00 sigue prendido hasta que el de mañana salga bien, no media hora. Lo segundo evita que una cola puntual que falla para un usuario y sale bien para el siguiente prenda y apague la alerta en cada pase.

Ningún job tiene que hacer nada para quedar vigilado: basta con que falle lanzando, como ya fallan todos (addendum F12.8 de ADR-008).

## ¿Quién vigila al vigilante? (PR1 y PR2)

Si el worker está caído, un job que corre dentro del worker no puede avisar. Tampoco puede avisar de un backup que **no corrió**: si el worker no arrancó, `backups.daily` ni siquiera crea su fila. Esas ausencias se vigilan afuera, con dos servicios gratuitos:

- **Healthchecks.io** ("dead man's switch"): `ops.watch` le hace ping al terminar cada pase (`HEALTHCHECK_WORKER_URL`, periodo 5 min) y el backup al subir el dump (periodo 1 día con 2 h de gracia, que da las ~26 h de la spec; en PR2). Si un ping no llega, avisa Healthchecks. El backup que truena además le pega a `/fail`, que avisa de inmediato. El latido de `ops.watch` dice a la vez "el worker, pg-boss y el vigilante están vivos". Plan gratis: 20 checks, sin restricción de uso comercial ([healthchecks.io/pricing](https://healthchecks.io/pricing/), consultado 2026-11-06).
- **UptimeRobot** sobre `/api/health`, que en PR2 pasa a revisar la base (hoy contesta `ok` sin mirar nada). Desde junio de 2026 sus términos permiten el uso comercial en cualquier plan ("UptimeRobot is available for any use, including commercial and business use", [uptimerobot.com/terms](https://uptimerobot.com/terms/), modificados el 2026-06-24); la restricción de 2024 al plan gratis ya no aplica.

Se evaluó y se descartó **un endpoint público de "último backup exitoso"** para que UptimeRobot lo vigile: es superficie pública nueva para algo que el ping a Healthchecks resuelve sin exponer nada.

## Saldo de los proveedores (PR3 y PR4)

**Saldo por API, verificado en la documentación de cada proveedor (2026-11-06):**

| Proveedor (cadenas de prod) | ¿Expone el saldo?                                                                                       | Fuente                                                                                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI                      | No. `GET /organization/costs` da el gasto, no el saldo                                                  | Foro oficial, 2026 ([community.openai.com](https://community.openai.com/t/access-billing-balance-costs-via-admin-api/1383654))                                                    |
| Anthropic                   | No para organizaciones de Console. `cost_report` da el gasto; la Spend Limits API es solo de Enterprise | [cost_report](https://platform.claude.com/docs/en/api/beta/organization/cost_report/retrieve), [spend limits](https://platform.claude.com/docs/en/manage-claude/spend-limits-api) |
| Google (Gemini)             | No: el saldo prepagado solo se ve en la pestaña Billing de AI Studio                                    | [ai.google.dev/gemini-api/docs/billing](https://ai.google.dev/gemini-api/docs/billing)                                                                                            |
| Brave                       | Sí, indirecto: el header `X-RateLimit-Remaining` trae lo que queda del mes                              | [docs de Brave](https://api.search.brave.com/app/documentation/suggest/response-headers)                                                                                          |
| Groq                        | No aplica: plan gratis con límites de tasa                                                              | —                                                                                                                                                                                 |

DeepSeek (`/user/balance`), xAI (management API) y OpenRouter (`/api/v1/credits`, con management key) sí lo exponen, pero ninguno está en una cadena de producción: no se construye nada para ellos.

Por eso el "antes de llegar a cero" de OpenAI, Anthropic y Google **no es una alerta: es la auto-recarga de cada consola** (en el doc de deploy, PR2). Lo que sí hace el código:

- **Señal pasiva (PR3):** los intentos fallidos ya quedan en `ai_usage_events.provider_raw.attempts`. Un eslabón caído por saldo (402, o el cuerpo que reconoce `QUOTA_BODY` en `ai/fallback.ts`) prende `saldo:<proveedor>`; un respaldo que empieza a cargar con el tráfico (`fallback_from` en la mitad de los eventos de la última hora) prende `respaldo:<principal>`.
- **Señal activa (PR4):** una prueba diaria con una llamada mínima a cada eslabón de cada cadena, sin pasar por el respaldo. Es la única forma de saber que Sonnet tiene saldo sin esperar a una caída.

## La prueba activa (PR4)

Diaria a las 14:00 UTC (08:00 en Mérida). Cada `proveedor:modelo` de las cadenas de texto una sola vez (con el esfuerzo más bajo), el modelo de embeddings, la cadena de transcripción y una búsqueda de Brave. **Las imágenes, solo los lunes**: son lo caro (~US$0.03 gpt-image-2 y ~US$0.067 Nano Banana 2 por corrida), y el saldo de esas cuentas ya lo prueba a diario el texto del mismo proveedor; lo semanal atrapa un modelo de imagen retirado. Costo estimado: ~US$0.5 al mes.

**El gasto de la prueba no entra al ledger ni a `ai_usage_events`.** El ledger es por usuario (ADR-012) y la prueba no es de nadie; `ai_usage_events.user_id` es `NOT NULL`, y abrirlo para centavos al mes tocaría una tabla append-only con RLS. El costo estimado queda en el log del job y aquí. Consecuencia aceptada: `pnpm gasto` lo subestima por centavos.

## Consecuencias

- **Producción no arranca sin canal de alertas** (`OPS_TELEGRAM_CHAT_ID` u `OPS_ALERT_EMAIL`). Hay que agregarlo al `.env` de prod **antes** del pull de la imagen que trae F12.8.
- **Lo que no va aquí:** la vista de negocio (usuarios, gasto por modelo) y un panel `/admin`. Siguen en _Backlog · Panel de founder_: para operación, una alerta vale más que un tablero.
- **`pnpm --filter @presencia/api ops:vigilar`** corre un pase a mano; con `-- --fallar` / `-- --sanar` simula un job de la cola `ops.simulacro` para probar la cadena completa sin romper uno de verdad.
