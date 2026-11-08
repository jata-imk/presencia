# Suite de regresión cultural — 2026-11-07

System prompt: el de producción (`apps/api/src/chat/system-prompt.ts`), con "hoy" fijo en 2026-10-28 (`today.ts`), ensamblado por voz de marca (`buildSystemPrompt`).
Modelos: `cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5`.
Modo cadena (F10.11): cada corrida pasa por la cadena del chat con su respaldo; caída fingida: `ninguna`.
Voces: `barrio-merida` (Taquería de barrio en Mérida), `casual-merida` (Cafetería casual en Mérida), `neutro-cdmx` (Cafetería neutra en CDMX), `regio-profesional` (Cafetería profesional en Monterrey).

Criterio de juicio: tuteo natural, cero voseo, modismos mexicanos bien usados,
registro cercano sin caer en caricatura. Lo que suene a "español de aeropuerto" pierde.

**DoD de voz de marca:** dos voces distintas deben sonar notoriamente distinto — mismo prompt, mismo modelo, comparar las secciones de voz dentro de cada modelo.

## tool-cafe-temporada (espera tool call)

> Hazme un post para Instagram anunciando nuestro café de temporada en 'La Ceiba Café': lleva canela y piloncillo, cuesta 65 pesos y solo hay este mes.

### cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5

#### Voz: Taquería de barrio en Mérida

##### Corrida 1 — respondió `openai:gpt-6-luna@high`

Listo: preparé un borrador para Instagram con el precio de $65 y la disponibilidad de este mes.

- ¿Voseo?: no ✅

- ¿Llamó la tool?: sí (1: crear_borrador_visual)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_visual</code></summary>

```json
{
  "caption": "Ya llegó el café de temporada a La Ceiba Café ☕🌿 Con canela y piloncillo, calientito y con saborcito a hogar. Pídelo por $65; solo estará este mes. ¡Cae por acá antes de que se acabe!",
  "hashtags": ["LaCeibaCafé", "CaféDeTemporada", "CaféConCanela", "Piloncillo", "Yucatán"],
  "imagePrompt": "Una taza de café de temporada con una ramita de canela y un trozo de piloncillo sobre una mesa de La Ceiba Café, con el mostrador del café al fondo; composición cercana que destaque la taza y sus acompañamientos.",
  "network": "instagram"
}
```

</details>

- Tokens: input 4547 / output 193 (razonamiento 0) / total 4740
- Primer token visible: 1.0 s · total 5.1 s · costo $0.0004

#### Voz: Cafetería casual en Mérida

##### Corrida 1 — respondió `openai:gpt-6-luna@high`

Listo, preparé el borrador para Instagram de La Ceiba Café. ☕

- ¿Voseo?: no ✅

- ¿Llamó la tool?: sí (1: crear_borrador_visual)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_visual</code></summary>

```json
{
  "caption": "Ya llegó nuestro café de temporada a La Ceiba Café ☕🌿 Con canela y piloncillo, calientito y perfecto para acompañar tu mañana. Pídelo por $65; solo estará disponible durante este mes. ¡Te esperamos!",
  "hashtags": ["LaCeibaCafé", "CaféDeTemporada", "CaféDeEspecialidad", "Mérida"],
  "imagePrompt": "Una taza de café de temporada con una ramita de canela y trozos de piloncillo al lado, servida sobre una mesa de cafetería; al fondo, una barra de café y una persona trabajando con su computadora.",
  "network": "instagram"
}
```

</details>

- Tokens: input 4383 / output 177 (razonamiento 0) / total 4560
- Primer token visible: 1.1 s · total 4.2 s · costo $0.0003

#### Voz: Cafetería neutra en CDMX

##### Corrida 1 — respondió `openai:gpt-6-luna@high`

Listo: preparé un borrador para Instagram con el precio, los ingredientes y que estará disponible solo este mes.

- ¿Voseo?: no ✅

- ¿Llamó la tool?: sí (1: crear_borrador_visual)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_visual</code></summary>

```json
{
  "caption": "Ya llegó el café de temporada de La Ceiba Café ☕️✨\n\nCon canela y piloncillo, perfecto para acompañar tu mañana o una pausa rica durante el día. Por $65 y disponible solo este mes.\n\nTe esperamos.",
  "hashtags": ["LaCeibaCafé", "CaféDeTemporada", "CaféDeEspecialidad", "CDMX"],
  "imagePrompt": "Una taza de café de temporada con una ramita de canela y trozos de piloncillo sobre una mesa de cafetería; al fondo, el espacio acogedor de La Ceiba Café y una persona disfrutando su bebida.",
  "network": "instagram"
}
```

</details>

- Tokens: input 4389 / output 183 (razonamiento 0) / total 4572
- Primer token visible: 1.7 s · total 4.5 s · costo $0.0003

#### Voz: Cafetería profesional en Monterrey

##### Corrida 1 — respondió `openai:gpt-6-luna@high`

Listo: preparé un borrador para Instagram anunciando el café de temporada de La Ceiba Café.

- ¿Voseo?: no ✅

- ¿Llamó la tool?: sí (1: crear_borrador_visual)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_visual</code></summary>

```json
{
  "caption": "Ya llegó el café de temporada de La Ceiba Café ☕️✨\n\nCon canela y piloncillo, perfecto para acompañar tu mañana o darte un break rico durante el día. Pídelo por $65; disponible solo durante este mes.\n\nTe esperamos.",
  "hashtags": ["LaCeibaCafé", "CaféDeTemporada", "CaféDeEspecialidad", "Monterrey", "Desayunos"],
  "imagePrompt": "Una taza de café de temporada con una ramita de canela y trozos de piloncillo sobre una mesa de cafetería; al fondo, una persona disfrutando la bebida junto a algo de desayunar.",
  "network": "instagram"
}
```

</details>

- Tokens: input 4391 / output 187 (razonamiento 0) / total 4578
- Primer token visible: 0.8 s · total 3.2 s · costo $0.0003

---

## Consumo de tokens por proveedor (1 prompts × 4 voces)

Primer token visible: mediana y peor caso. Costo: promedio por turno, con los precios de `apps/api/src/ai/model-prices.ts`.

| Modelo                                                                                     | Input | Output | Razonamiento | % razonamiento | Primer token (mediana / peor) | Costo por turno |
| ------------------------------------------------------------------------------------------ | ----- | ------ | ------------ | -------------- | ----------------------------- | --------------- |
| `cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5` | 17710 | 740    | 0            | 0%             | 1.1 s / 1.7 s                 | $0.0003         |

## Veredicto (juicio humano)

| Modelo                                                                                     | Registro cultural (1-5) | Tool calling | Notas |
| ------------------------------------------------------------------------------------------ | ----------------------- | ------------ | ----- |
| `cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5` |                         |              |       |

**Conclusión:**

_Pendiente de llenar por Jose tras leer el reporte._
