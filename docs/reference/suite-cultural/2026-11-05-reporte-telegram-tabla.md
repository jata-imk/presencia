# Suite de regresión cultural — 2026-11-05

Los casos `telegram-*` llevan además el apéndice del canal (`channelInstruction`), antes de la fecha, como en producción.
System prompt: el de producción (`apps/api/src/chat/system-prompt.ts`), con "hoy" fijo en 2026-10-28 (`today.ts`), sin voz de marca (`buildSystemPrompt(null)` === prompt base).
Modelos: `cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5`.
Modo cadena (F10.11): cada corrida pasa por la cadena del chat con su respaldo; caída fingida: `ninguna`.
Corridas por caso: 3.

Criterio de juicio: tuteo natural, cero voseo, modismos mexicanos bien usados,
registro cercano sin caer en caricatura. Lo que suene a "español de aeropuerto" pierde.

## telegram-tabla (Telegram)

> te paso lo que anoté de 5 cafeterías para trabajar, compáramelas para ver cuál me conviene: Café Créme, americano $45, de 7 a 22, wifi sí, estacionamiento no; Manifesto, $55, de 8 a 20, wifi sí, estacionamiento sí; Bengala Kafe, $40, de 8 a 21, wifi sí, estacionamiento no; Rossina, $60, de 9 a 23, wifi no, estacionamiento sí; Latte Lab, $50, de 7 a 21, wifi sí, estacionamiento sí

### cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5

#### Corrida 1 — respondió `openai:gpt-6-luna@high`

Si buscas **un buen equilibrio para trabajar**, elegiría **Latte Lab**: tiene wifi y estacionamiento, abre desde las 7 y cuesta $50.

- **Más económica:** Bengala Kafe — $40, wifi, sin estacionamiento; abre de 8 a 21.
- **Más horas con wifi:** Café Créme — $45, de 7 a 22; sin estacionamiento.
- **Wifi y estacionamiento:** Manifesto — $55, de 8 a 20; es la que cierra más temprano entre estas.
- **Cierra más tarde:** Rossina — hasta las 23, pero no tiene wifi y cuesta $60.

**En corto:** Latte Lab si necesitas estacionamiento; Café Créme si priorizas horario y precio; Bengala si quieres gastar lo menos.

- Tokens: input 2266 / output 341 (razonamiento 167) / total 2607
- Primer token visible: 4.2 s · total 5.0 s · costo $0.0002

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

#### Corrida 2 — respondió `openai:gpt-6-luna@high`

Con lo que anotaste, **Latte Lab parece la opción más equilibrada para trabajar**: tiene wifi y estacionamiento, abre desde las 7 y el americano cuesta $50.

- **Más barata:** Bengala Kafe ($40), con wifi, pero sin estacionamiento.
- **Más horas para trabajar:** Café Créme (7 a 22), con wifi; no tiene estacionamiento.
- **Con wifi y estacionamiento:** Latte Lab ($50) y Manifesto ($55). Latte Lab abre antes y cierra más tarde.
- **Rossina:** tiene estacionamiento y horario amplio, pero no wifi; para trabajar puede ser menos práctica.

**En corto:** Latte Lab para comodidad; Bengala para ahorrar; Café Créme para tener más margen de horario. Si me dices qué pesa más para ti —precio, estacionamiento u horario— te recomiendo una con más seguridad.

- Tokens: input 2266 / output 405 (razonamiento 218) / total 2671
- Primer token visible: 4.6 s · total 5.3 s · costo $0.0002

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

#### Corrida 3 — respondió `openai:gpt-6-luna@high`

**Comparación rápida** (precio del americano):

- **Latte Lab — $50:** wifi y estacionamiento; abre de 7 a 21. La opción más equilibrada.
- **Café Créme — $45:** wifi; abre de 7 a 22, pero no tiene estacionamiento. Buena si priorizas horario y ahorrar.
- **Bengala Kafe — $40:** la más barata, con wifi; abre de 8 a 21 y no tiene estacionamiento.
- **Manifesto — $55:** wifi y estacionamiento, pero abre más tarde y cierra más temprano: de 8 a 20.
- **Rossina — $60:** estacionamiento y horario hasta las 23, pero no tiene wifi; es la más cara.

**Mi recomendación:** Latte Lab si quieres trabajar con wifi y estacionarte. Si no necesitas estacionamiento, Café Créme te da más horas por menos dinero; Bengala es la opción más económica.

- Tokens: input 2266 / output 369 (razonamiento 162) / total 2635
- Primer token visible: 4.5 s · total 5.0 s · costo $0.0002

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

---

## Consumo de tokens por proveedor (1 prompts)

Primer token visible: mediana y peor caso. Costo: promedio por turno, con los precios de `apps/api/src/ai/model-prices.ts`.

| Modelo                                                                                     | Input | Output | Razonamiento | % razonamiento | Primer token (mediana / peor) | Costo por turno |
| ------------------------------------------------------------------------------------------ | ----- | ------ | ------------ | -------------- | ----------------------------- | --------------- |
| `cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5` | 6798  | 1115   | 547          | 49%            | 4.5 s / 4.6 s                 | $0.0002         |

## Telegram: la vara (F11)

0 voseo, card cuando se pide, 0 tablas de más de 3 columnas, ≥90% en un solo mensaje, HTML siempre válido y 0 errores con el respaldo forzado. Encabezados: aviso, no falla.

| Modelo                   | Un solo mensaje | Card cuando debía | Tablas anchas | Encabezados | HTML inválido | Con voseo | Errores |
| ------------------------ | --------------- | ----------------- | ------------- | ----------- | ------------- | --------- | ------- |
| `openai:gpt-6-luna@high` | 3/3 (100%)      | 3/3 (100%)        | 0             | 0           | 0             | 0         | 0       |

## Veredicto (juicio humano)

| Modelo                                                                                     | Registro cultural (1-5) | Tool calling | Notas |
| ------------------------------------------------------------------------------------------ | ----------------------- | ------------ | ----- |
| `cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5` |                         |              |       |

**Conclusión:**

_Pendiente de llenar por Jose tras leer el reporte._
