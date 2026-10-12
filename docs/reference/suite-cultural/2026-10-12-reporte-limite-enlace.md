# Suite de regresión cultural — 2026-10-12

System prompt: el de producción (`apps/api/src/chat/system-prompt.ts`), sin voz de marca (`buildSystemPrompt(null)` === prompt base).
Modelos: `openai:gpt-6-luna@high`, `google:gemini-3.8-flash@medium`, `anthropic:claude-sonnet-5-5`.

Criterio de juicio: tuteo natural, cero voseo, modismos mexicanos bien usados,
registro cercano sin caer en caricatura. Lo que suene a "español de aeropuerto" pierde.

## limite-enlace

> Échale un ojo a este artículo y hazme un resumen para sacar ideas de posts: https://www.diariodeyucatan.com/merida/2026/10/05/la-marquesita-cumple-80-anos

### openai:gpt-6-luna@high

No puedo abrir el enlace. Si pegas aquí el texto del artículo o me cuentas de qué trata, te hago un resumen y saco ideas de posts a partir de él.

- Tokens: input 1055 / output 81 (razonamiento 40) / total 1136
- Primer token visible: 3.4 s · total 3.8 s · costo $0.0001

### google:gemini-3.8-flash@medium

No puedo abrir enlaces ni ver páginas web. ¿Podrías copiar y pegar el texto del artículo aquí o contarme los puntos principales?

Con eso te ayudo con gusto a hacer el resumen y a sacar muy buenas ideas para tus posts.

- Tokens: input 1274 / output 320 (razonamiento 269) / total 1594
- Primer token visible: 3.5 s · total 3.8 s · costo $0.0022

### anthropic:claude-sonnet-5-5

No puedo abrir enlaces, así que no tengo forma de leer ese artículo. Prefiero no adivinar de qué trata por la dirección.

Para ayudarte con el resumen y las ideas de posts, puedes hacer una de estas dos cosas:

- **Pegar aquí el texto del artículo**, completo o las partes que más te interesen.
- **Contarme con tus palabras de qué trata**, por ejemplo los datos principales, las fechas o las citas que te llamaron la atención.

Con eso te armo un resumen corto y una lluvia de ideas de posts. Si ya sabes para qué red las quieres (Instagram, TikTok, LinkedIn, etc.) o qué tono buscas, dímelo y las ajusto desde el principio.

- Tokens: input 2420 / output 262 (razonamiento 0) / total 2682
- Primer token visible: 0.9 s · total 3.0 s · costo $0.0075

---

## Consumo de tokens por proveedor (1 prompts)

Primer token visible: mediana y peor caso. Costo: promedio por turno, con los precios de `apps/api/src/ai/model-prices.ts`.

| Modelo                           | Input | Output | Razonamiento | % razonamiento | Primer token (mediana / peor) | Costo por turno |
| -------------------------------- | ----- | ------ | ------------ | -------------- | ----------------------------- | --------------- |
| `openai:gpt-6-luna@high`         | 1055  | 81     | 40           | 49%            | 3.4 s / 3.4 s                 | $0.0001         |
| `google:gemini-3.8-flash@medium` | 1274  | 320    | 269          | 84%            | 3.5 s / 3.5 s                 | $0.0022         |
| `anthropic:claude-sonnet-5-5`    | 2420  | 262    | 0            | 0%             | 0.9 s / 0.9 s                 | $0.0075         |

## Veredicto (juicio humano)

| Modelo                           | Registro cultural (1-5) | Tool calling | Notas |
| -------------------------------- | ----------------------- | ------------ | ----- |
| `openai:gpt-6-luna@high`         |                         |              |       |
| `google:gemini-3.8-flash@medium` |                         |              |       |
| `anthropic:claude-sonnet-5-5`    |                         |              |       |

**Conclusión:**

_Pendiente de llenar por Jose tras leer el reporte._
