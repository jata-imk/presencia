# Suite de regresión cultural — 2026-11-05

Los casos `telegram-*` llevan además el apéndice del canal (`channelInstruction`), antes de la fecha, como en producción.
System prompt: el de producción (`apps/api/src/chat/system-prompt.ts`), con "hoy" fijo en 2026-10-28 (`today.ts`), sin voz de marca (`buildSystemPrompt(null)` === prompt base).
Modelos: `cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5`.
Modo cadena (F10.11): cada corrida pasa por la cadena del chat con su respaldo; caída fingida: `openai,google`.
Corridas por caso: 3.

Criterio de juicio: tuteo natural, cero voseo, modismos mexicanos bien usados,
registro cercano sin caer en caricatura. Lo que suene a "español de aeropuerto" pierde.

## telegram-tabla (Telegram)

> te paso lo que anoté de 5 cafeterías para trabajar, compáramelas para ver cuál me conviene: Café Créme, americano $45, de 7 a 22, wifi sí, estacionamiento no; Manifesto, $55, de 8 a 20, wifi sí, estacionamiento sí; Bengala Kafe, $40, de 8 a 21, wifi sí, estacionamiento no; Rossina, $60, de 9 a 23, wifi no, estacionamiento sí; Latte Lab, $50, de 7 a 21, wifi sí, estacionamiento sí

### cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5

#### Corrida 1 — respondió `anthropic:claude-sonnet-5-5`

Mi recomendación: **Latte Lab**, porque es la única que cumple con todo. Tiene wifi, estacionamiento, abre temprano (7:00) y el americano cuesta $50.

**Comparativa rápida**

- **Latte Lab:** $50, 7–21, wifi y estacionamiento. Es la más completa.
- **Café Créme:** $45, 7–22, wifi, sin estacionamiento. Es la que tiene el mejor horario (15 horas) por buen precio.
- **Bengala Kafe:** $40, 8–21, wifi, sin estacionamiento. Es la más barata.
- **Manifesto:** $55, 8–20, wifi y estacionamiento. Tiene el horario más corto y cuesta un poco más que Latte Lab.
- **Rossina:** $60, 9–23, estacionamiento, sin wifi. Es la más cara y, sin wifi, no sirve para trabajar. La descartaría, salvo que trabajes sin internet.

**Según lo que necesites**

- **Si vas en coche:** Latte Lab.
- **Si no manejas:** Café Créme, o Bengala Kafe si quieres ahorrar.
- **Si trabajas hasta tarde:** Café Créme (cierra a las 22:00).

Algo que no anotaste y que puede cambiar la decisión: la velocidad del wifi, los enchufes y el ruido. ¿Quieres que te arme una lista corta para evaluarlo en tu primera visita?

- Tokens: input 4523 / output 810 (razonamiento 294) / total 5333
- Primer token visible: 6.6 s · total 10.0 s · costo $0.0171

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

#### Corrida 2 — respondió `anthropic:claude-sonnet-5-5`

Mi recomendación: **Latte Lab**. Es la única que cumple con todo: wifi, estacionamiento, abre temprano (7:00) y el precio queda a la mitad ($50).

**Ranking rápido**

1. **Latte Lab**: $50, de 7 a 21, wifi y estacionamiento. Es la más completa.
2. **Café Créme**: $45, de 7 a 22, wifi, sin estacionamiento. Tiene el mejor horario, porque abre temprano y cierra tarde. Es buena opción si llegas sin coche o encuentras dónde estacionarte.
3. **Manifesto**: $55, de 8 a 20, wifi y estacionamiento. Cumple, pero tiene el horario más corto (12 h) y cuesta más que Latte Lab.
4. **Bengala Kafe**: $40, de 8 a 21, wifi, sin estacionamiento. Es la más barata. Conviene si cuidas el gasto y no manejas.
5. **Rossina**: $60, de 9 a 23, sin wifi, con estacionamiento. Es la más cara y no tiene wifi, así que solo te sirve si trabajas sin internet.

**Según lo que más te importe**

- Ahorrar: Bengala Kafe.
- Quedarte hasta tarde: Café Créme (hasta las 22) o Rossina (hasta las 23, pero sin wifi).
- Ir en coche: Latte Lab.

¿Vas en coche o en transporte? Con eso te digo si Latte Lab o Café Créme te conviene más.

- Tokens: input 4523 / output 845 (razonamiento 303) / total 5368
- Primer token visible: 6.3 s · total 9.8 s · costo $0.0175

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

#### Corrida 3 — respondió `anthropic:claude-sonnet-5-5`

**Mi recomendación: Latte Lab.** Es la única que cumple con todo: wifi, estacionamiento, abre temprano (7:00) y el precio es medio ($50).

**Comparativa rápida:**

- **Latte Lab:** $50, 7–21, wifi ✅, estacionamiento ✅
- **Manifesto:** $55, 8–20, wifi ✅, estacionamiento ✅. Tiene el horario más corto y es más cara que Latte Lab.
- **Café Créme:** $45, 7–22, wifi ✅, estacionamiento ❌. Es la mejor si no vas en coche: tiene el horario más amplio entre las que tienen wifi.
- **Bengala Kafe:** $40, 8–21, wifi ✅, estacionamiento ❌. Es la más barata y funciona bien para sesiones largas con poco gasto.
- **Rossina:** $60, 9–23, wifi ❌, estacionamiento ✅. Yo la descartaría para trabajar: es la más cara, abre tarde y no tiene wifi.

**Según tu caso:**

- Si vas en coche: Latte Lab, y Manifesto como segunda opción.
- Si no llevas coche y quieres ahorrar: Bengala Kafe.
- Si trabajas hasta tarde: Café Créme, que cierra a las 22:00.

¿Vas en coche o en transporte? Con eso te digo cuál elegir.

- Tokens: input 4523 / output 715 (razonamiento 215) / total 5238
- Primer token visible: 4.8 s · total 8.1 s · costo $0.0162

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

---

## Consumo de tokens por proveedor (1 prompts)

Primer token visible: mediana y peor caso. Costo: promedio por turno, con los precios de `apps/api/src/ai/model-prices.ts`.

| Modelo                                                                                     | Input | Output | Razonamiento | % razonamiento | Primer token (mediana / peor) | Costo por turno |
| ------------------------------------------------------------------------------------------ | ----- | ------ | ------------ | -------------- | ----------------------------- | --------------- |
| `cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5` | 13569 | 2370   | 812          | 34%            | 6.3 s / 6.6 s                 | $0.0169         |

## Telegram: la vara (F11)

0 voseo, card cuando se pide, 0 tablas de más de 3 columnas, ≥90% en un solo mensaje, HTML siempre válido y 0 errores con el respaldo forzado. Encabezados: aviso, no falla.

| Modelo                        | Un solo mensaje | Card cuando debía | Tablas anchas | Encabezados | HTML inválido | Con voseo | Errores |
| ----------------------------- | --------------- | ----------------- | ------------- | ----------- | ------------- | --------- | ------- |
| `anthropic:claude-sonnet-5-5` | 3/3 (100%)      | 3/3 (100%)        | 0             | 0           | 0             | 0         | 0       |

## Veredicto (juicio humano)

| Modelo                                                                                     | Registro cultural (1-5) | Tool calling | Notas |
| ------------------------------------------------------------------------------------------ | ----------------------- | ------------ | ----- |
| `cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5` |                         |              |       |

**Conclusión:**

_Pendiente de llenar por Jose tras leer el reporte._
