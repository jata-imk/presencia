# Suite de regresión cultural — 2026-11-05

Los casos `telegram-*` llevan además el apéndice del canal (`channelInstruction`), antes de la fecha, como en producción.
System prompt: el de producción (`apps/api/src/chat/system-prompt.ts`), con "hoy" fijo en 2026-10-28 (`today.ts`), sin voz de marca (`buildSystemPrompt(null)` === prompt base).
Modelos: `anthropic:claude-sonnet-5-5`.
Corridas por caso: 3.

Criterio de juicio: tuteo natural, cero voseo, modismos mexicanos bien usados,
registro cercano sin caer en caricatura. Lo que suene a "español de aeropuerto" pierde.

## telegram-post-linkedin (Telegram) (espera tool call)

> me gusta la segunda, hazme un post de LinkedIn

### anthropic:claude-sonnet-5-5

#### Corrida 1

Va. Para que no invente nada de tu historia, cuéntame rápido (puede ser en nota de voz):

1. **¿Qué pasó con ese cliente?** Por ejemplo: cambios sin fin, pagos tarde, mensajes a deshoras.
2. **¿Qué límites pones ahora desde el primer correo?** Por ejemplo: rondas de revisión, anticipo, horarios.
3. **¿Qué tono prefieres?** Reflexivo, directo o con humor.

Con eso te armo el borrador.

- ¿Llamó la tool?: no
- ¿Input Zod-válido?: n/a

- Tokens: input 4511 / output 308 (razonamiento 122) / total 4819
- Primer token visible: 2.4 s · total 3.7 s · costo $0.0121

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: debía crearla ❌ · voseo: no ✅

#### Corrida 2

Para que suene real y no genérico, cuéntame (puedes mandar nota de voz):

1. **¿Qué pasó con ese cliente?** Por ejemplo: cambios sin fin, pagos tarde o mensajes a toda hora.
2. **¿Qué límites pones ahora desde el primer correo?** Por ejemplo: rondas de revisión, anticipo, horarios o contrato.
3. **¿Cómo quieres sonar?** Reflexivo, directo o con humor.

Con eso te armo el borrador.

- ¿Llamó la tool?: no
- ¿Input Zod-válido?: n/a

- Tokens: input 4511 / output 339 (razonamiento 155) / total 4850
- Primer token visible: 1.8 s · total 3.3 s · costo $0.0124

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: debía crearla ❌ · voseo: no ✅

#### Corrida 3

Va. Para que sea tuyo y no suene genérico, necesito unos datos. Puedes mandarlos por nota de voz:

1. **¿Qué pasó con ese cliente?** Por ejemplo, cambios sin fin, pagos tarde o mensajes a toda hora.
2. **¿Cómo lo resolviste?** ¿Pusiste un límite, cerraste el proyecto o dejaste de trabajar con él?
3. **¿Qué límites pones ahora desde el primer correo?** Pueden ser rondas de revisión, anticipo o contrato.
4. **¿Qué tono prefieres?** Puede ser reflexivo, con humor o más directo.

Con eso te armo el borrador.

- ¿Llamó la tool?: no
- ¿Input Zod-válido?: n/a

- Tokens: input 4511 / output 361 (razonamiento 113) / total 4872
- Primer token visible: 1.8 s · total 3.7 s · costo $0.0126

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: debía crearla ❌ · voseo: no ✅

---

## Consumo de tokens por proveedor (1 prompts)

Primer token visible: mediana y peor caso. Costo: promedio por turno, con los precios de `apps/api/src/ai/model-prices.ts`.

| Modelo                        | Input | Output | Razonamiento | % razonamiento | Primer token (mediana / peor) | Costo por turno |
| ----------------------------- | ----- | ------ | ------------ | -------------- | ----------------------------- | --------------- |
| `anthropic:claude-sonnet-5-5` | 13533 | 1008   | 390          | 39%            | 1.8 s / 2.4 s                 | $0.0124         |

## Telegram: la vara (F11)

0 voseo, card cuando se pide, 0 tablas de más de 3 columnas, ≥90% en un solo mensaje, HTML siempre válido y 0 errores con el respaldo forzado. Encabezados: aviso, no falla.

| Modelo                        | Un solo mensaje | Card cuando debía | Tablas anchas | Encabezados | HTML inválido | Con voseo | Errores |
| ----------------------------- | --------------- | ----------------- | ------------- | ----------- | ------------- | --------- | ------- |
| `anthropic:claude-sonnet-5-5` | 3/3 (100%)      | 0/3 (0%)          | 0             | 0           | 0             | 0         | 0       |

## Veredicto (juicio humano)

| Modelo                        | Registro cultural (1-5) | Tool calling | Notas |
| ----------------------------- | ----------------------- | ------------ | ----- |
| `anthropic:claude-sonnet-5-5` |                         |              |       |

**Conclusión:**

_Pendiente de llenar por Jose tras leer el reporte._
