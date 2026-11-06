# Suite de regresión cultural — 2026-11-05

Los casos `telegram-*` corren **sin** el apéndice del canal (`AI_SUITE_CHANNEL=web`), para comparar.
System prompt: el de producción (`apps/api/src/chat/system-prompt.ts`), con "hoy" fijo en 2026-10-28 (`today.ts`), sin voz de marca (`buildSystemPrompt(null)` === prompt base).
Modelos: `anthropic:claude-sonnet-5-5`.
Corridas por caso: 3.

Criterio de juicio: tuteo natural, cero voseo, modismos mexicanos bien usados,
registro cercano sin caer en caricatura. Lo que suene a "español de aeropuerto" pierde.

## telegram-post-linkedin (Telegram) (espera tool call)

> me gusta la segunda, hazme un post de LinkedIn

### anthropic:claude-sonnet-5-5

#### Corrida 1

Va, antes de armar el post necesito unos datos tuyos para no inventar nada de tu historia:

1. **¿Qué pasó con ese cliente?** Por ejemplo: pedía cambios sin fin, pagaba tarde o escribía a cualquier hora. Con una o dos situaciones reales basta.
2. **¿Qué límites pusiste después?** Pueden ser anticipo, número de revisiones, horarios de respuesta o un contrato.
3. **¿Cómo terminó?** ¿Cerraste el proyecto, lo dejaste o cambiaste tu forma de trabajar?
4. **¿Qué tono prefieres?** Puede ser reflexivo, directo y con humor, o más profesional.

Con eso te armo el borrador de LinkedIn.

- ¿Llamó la tool?: no
- ¿Input Zod-válido?: n/a

- Tokens: input 4173 / output 416 (razonamiento 145) / total 4589
- Primer token visible: 2.2 s · total 4.6 s · costo $0.0125

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: debía crearla ❌ · voseo: no ✅

#### Corrida 2

Antes de armarlo necesito unos datos tuyos, porque esta historia funciona si es real y no quiero inventarte nada:

1. **¿Qué pasó con ese cliente?** Por ejemplo: pedía cambios sin fin, pagaba tarde, te escribía a cualquier hora o cambiaba el alcance a medias.
2. **¿Qué límites pusiste después?** Pueden ser contrato, anticipo, número de revisiones, horarios de respuesta u otros.
3. **¿Cómo terminó?** ¿Seguiste con el cliente, lo dejaste o cambiaste tu forma de trabajar?
4. **¿Qué tono prefieres?** Reflexivo, directo, con humor o más profesional.

Con eso te armo el borrador para LinkedIn. Si prefieres no dar nombres ni detalles del cliente, no hace falta. Con lo que aprendiste es suficiente.

- ¿Llamó la tool?: no
- ¿Input Zod-válido?: n/a

- Tokens: input 4173 / output 481 (razonamiento 160) / total 4654
- Primer token visible: 2.1 s · total 5.1 s · costo $0.0132

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: debía crearla ❌ · voseo: no ✅

#### Corrida 3

Para que el post suene a ti y no invente nada de tu historia, cuéntame lo siguiente:

1. **¿Qué pasó con ese cliente?** Por ejemplo, cambios sin fin, pagos tarde, mensajes a deshoras o alcance que crecía sin cobrarse. Con un par de detalles basta.
2. **¿Qué límites pones ahora desde el primer correo?** Pueden ser contrato, anticipo, número de revisiones, horarios de respuesta, etc.
3. **¿Cómo terminó?** ¿Cerraste el proyecto, lo dejaste o lo resolviste de otra forma?
4. **¿Qué tono prefieres?** Reflexivo, directo o con un toque de humor.

Con eso te armo el borrador listo para LinkedIn.

- ¿Llamó la tool?: no
- ¿Input Zod-válido?: n/a

- Tokens: input 4173 / output 414 (razonamiento 135) / total 4587
- Primer token visible: 2.2 s · total 4.6 s · costo $0.0125

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: debía crearla ❌ · voseo: no ✅

---

## Consumo de tokens por proveedor (1 prompts)

Primer token visible: mediana y peor caso. Costo: promedio por turno, con los precios de `apps/api/src/ai/model-prices.ts`.

| Modelo                        | Input | Output | Razonamiento | % razonamiento | Primer token (mediana / peor) | Costo por turno |
| ----------------------------- | ----- | ------ | ------------ | -------------- | ----------------------------- | --------------- |
| `anthropic:claude-sonnet-5-5` | 12519 | 1311   | 440          | 34%            | 2.2 s / 2.2 s                 | $0.0127         |

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
