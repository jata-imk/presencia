# Suite de regresión cultural — 2026-10-20

System prompt: el de producción (`apps/api/src/chat/system-prompt.ts`), sin voz de marca (`buildSystemPrompt(null)` === prompt base).
Modelos: `openai:gpt-6-luna@high`, `google:gemini-3.8-flash@medium`, `anthropic:claude-sonnet-5-5`.

Segunda corrida de `adjunto-csv-recortado` (F10.9 PR8), con la nota de recorte nueva de `attachment-context.ts`. En la primera (`2026-10-20-reporte-parcial.md`), Luna y Gemini pedían "el archivo completo", que se volvería a cortar igual.

Criterio de juicio: tuteo natural, cero voseo, modismos mexicanos bien usados,
registro cercano sin caer en caricatura. Lo que suene a "español de aeropuerto" pierde.

## adjunto-csv-recortado

> Aquí van mis ventas del año. ¿Cuántas marquesitas de cajeta vendí en diciembre? Quiero presumir el cierre de año en un post.

Adjuntos: `ventas-2026.csv`.

### openai:gpt-6-luna@high

El archivo que recibí se corta el **7 de agosto**, así que no puedo ver las ventas de diciembre ni calcular el total de marquesitas de cajeta. Pega aquí solo las filas de diciembre con ese producto y te saco la suma.

¿En qué red quieres publicar el post: Instagram, Facebook, LinkedIn, Threads o X?

- Tokens: input 46527 / output 178 (razonamiento 102) / total 46705
- Primer token visible: 5.9 s · total 7.1 s · costo $0.0046

### google:gemini-3.8-flash@medium

El archivo que subiste se cortó y solo incluye registros del 1 de enero al 7 de agosto de 2026, por lo que no alcanzo a ver las ventas de diciembre.

Como subir el archivo completo de nuevo se volvería a cortar en el mismo punto, ¿me podrías compartir solo la parte que falta (los datos de diciembre) o directamente la cifra total de marquesitas de cajeta que vendiste ese mes?

En cuanto me pases ese dato y me digas en qué red social te gustaría publicarlo (Instagram, Facebook, TikTok, etc.), te armo el post para presumir el cierre de año.

- Tokens: input 62074 / output 586 (razonamiento 450) / total 62660
- Primer token visible: 5.0 s · total 5.9 s · costo $0.0083

### anthropic:claude-sonnet-5-5

Todavía no puedo darte ese dato. El archivo llegó cortado y lo que alcanzo a ver va del 1 de enero de 2026 al 7 de agosto de 2026, con la última fila incompleta. Diciembre no aparece, y no quiero inventarte una cifra para tu post.

Mandar el archivo completo otra vez no sirve, porque se corta en el mismo punto. Tienes dos opciones:

1. **Pega solo las filas de diciembre.** Con que pegues las de marquesita de cajeta de ambas sucursales (Centro y Montejo), yo hago la suma.
2. **Dime tú el total** de marquesitas de cajeta de diciembre, si ya lo tienes.

Para armarte el post también necesito saber:

- ¿En qué red lo quieres: Instagram, Facebook, TikTok, LinkedIn, Threads o X?
- ¿Qué tono prefieres: festivo y orgulloso, agradecido con tus clientes, o más directo y de números?
- ¿Quieres mencionar las dos sucursales, Centro y Montejo, o solo el total?

Con eso te dejo el borrador listo.

- Tokens: input 57276 / output 555 (razonamiento 155) / total 57831
- Primer token visible: 2.5 s · total 5.6 s · costo $0.1201

---

## Consumo de tokens por proveedor (1 prompts)

Primer token visible: mediana y peor caso. Costo: promedio por turno, con los precios de `apps/api/src/ai/model-prices.ts`.

| Modelo                           | Input | Output | Razonamiento | % razonamiento | Primer token (mediana / peor) | Costo por turno |
| -------------------------------- | ----- | ------ | ------------ | -------------- | ----------------------------- | --------------- |
| `openai:gpt-6-luna@high`         | 46527 | 178    | 102          | 57%            | 5.9 s / 5.9 s                 | $0.0046         |
| `google:gemini-3.8-flash@medium` | 62074 | 586    | 450          | 77%            | 5.0 s / 5.0 s                 | $0.0083         |
| `anthropic:claude-sonnet-5-5`    | 57276 | 555    | 155          | 28%            | 2.5 s / 2.5 s                 | $0.1201         |

## Veredicto (juicio humano)

| Modelo                           | Registro cultural (1-5) | Tool calling | Notas |
| -------------------------------- | ----------------------- | ------------ | ----- |
| `openai:gpt-6-luna@high`         |                         |              |       |
| `google:gemini-3.8-flash@medium` |                         |              |       |
| `anthropic:claude-sonnet-5-5`    |                         |              |       |

**Conclusión:**

_Pendiente de llenar por Jose tras leer el reporte._
