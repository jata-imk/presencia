# Suite de regresión cultural — 2026-11-07

System prompt: el de producción (`apps/api/src/chat/system-prompt.ts`), con "hoy" fijo en 2026-10-28 (`today.ts`), ensamblado por voz de marca (`buildSystemPrompt`).
Modelos: `cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5`.
Modo cadena (F10.11): cada corrida pasa por la cadena del chat con su respaldo; caída fingida: `ninguna`.
Voces: `barrio-merida` (Taquería de barrio en Mérida), `casual-merida` (Cafetería casual en Mérida), `neutro-cdmx` (Cafetería neutra en CDMX), `regio-profesional` (Cafetería profesional en Monterrey).

Criterio de juicio: tuteo natural, cero voseo, modismos mexicanos bien usados,
registro cercano sin caer en caricatura. Lo que suene a "español de aeropuerto" pierde.

**DoD de voz de marca:** dos voces distintas deben sonar notoriamente distinto — mismo prompt, mismo modelo, comparar las secciones de voz dentro de cada modelo.

## registro-barrio

> ¿Cómo le hago para que mi contenido no suene bien fresa? Mi público es más de barrio y siento que mis posts parecen de agencia.

### cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5

#### Voz: Taquería de barrio en Mérida

##### Corrida 1 — respondió `openai:gpt-6-luna@high`

No tienes que llenar todo de “wey” para sonar de barrio. La clave es escribir como le hablarías a alguien que ya ubica la taquería: directo, cercano y sin frases de folleto.

Prueba esto:

- **Cambia frases formales por algo que sí dirías en persona.**  
  “Te invitamos a disfrutar nuestros deliciosos tacos” → “¿Ya te dio hambre? Cae por acá.”
- **Usa frases cortas.** Una idea por oración.
- **Habla del antojo y del día a día:** qué se te antoja, qué hay para comer, cómo anda el ambiente.
- **Invita sin dar tantas vueltas:** “Cae por acá” o “Mándanos DM”.
- **Lee el post en voz alta.** Si no lo dirías así frente a un cliente, cámbialo.
- **Usa los modismos con medida.** Si salen natural, chido; si se sienten pegados a la fuerza, mejor quítalos.

Una fórmula sencilla: **antojo + dato real del día + invitación**. Por ejemplo: “¿Se te antojaron unos tacos? Hoy tenemos [lo que sí hay]. Cae por acá.”

- ¿Voseo?: no ✅

- Tokens: input 2359 / output 495 (razonamiento 231) / total 2854
- Primer token visible: 5.0 s · total 7.9 s · costo $0.0005

#### Voz: Cafetería casual en Mérida

##### Corrida 1 — respondió `openai:gpt-6-luna@high`

No necesitas meter slang a fuerza. Para que suene más cercano, hazlo menos pulido y más como le hablarías a alguien que entra por un café. “De barrio” no significa caricaturizar a tu público ni llenarlo de frases que no usarías.

Prueba esto:

- **Di las cosas directo.** Quita frases como “una experiencia única” o “el lugar ideal para conectar”.
- **Habla de algo concreto.** El café de temporada, el desayuno, una pausa antes de volver al trabajo.
- **Usa frases cortas y palabras que sí dirías en persona.**
- **Invita sin sonar a anuncio.** “Te esperamos” funciona mejor que una llamada a la acción muy producida.
- **Lee el texto en voz alta.** Si no te imaginas diciéndolo así en el local, cámbialo.

Por ejemplo:

**Suena a agencia:** “Regálate una experiencia única y disfruta de una mañana llena de sabor.”  
**Más natural:** “¿Ya desayunaste? Pásate por un café y algo rico antes de seguir con el día. Te esperamos.”

La idea es que suene a tu cafetería, no a que estás intentando hablar como alguien más.

- ¿Voseo?: no ✅

- Tokens: input 2266 / output 449 (razonamiento 186) / total 2715
- Primer token visible: 4.2 s · total 5.6 s · costo $0.0005

#### Voz: Cafetería neutra en CDMX

##### Corrida 1 — respondió `openai:gpt-6-luna@high`

No necesitas meter más slang para sonar menos “fresa”. Muchas veces lo que suena a agencia es el lenguaje demasiado pulido, genérico o lleno de frases publicitarias. Puedes acercarte con palabras más directas y escenas cotidianas, sin forzar una forma de hablar ni asumir que todo tu público se expresa igual.

Prueba esto:

- **Cambia frases abstractas por situaciones concretas.**  
  “Una experiencia única para comenzar tu día” → “¿Buscas café y algo de desayunar antes de volver al trabajo?”
- **Usa palabras que dirías en persona.** Si una frase te daría pena decirle así a alguien en la cafetería, probablemente se siente demasiado de anuncio.
- **Baja los superlativos y las promesas grandotas.** Menos “el mejor”, “imperdible” o “eleva tu rutina”; más información clara sobre lo que ofreces.
- **Mantén el tono cercano, no caricaturesco.** No tienes que llenar los textos de “banda”, “chido” o “rifado” si no son expresiones tuyas.
- **Conserva lo profesional.** Ser directo y cálido puede funcionar mejor que intentar sonar “de barrio” a la fuerza.

Una guía rápida: escribe como si le contaras a alguien que trabaja cerca qué puede encontrar en tu cafetería. Si quieres, pega aquí uno de tus posts y te muestro cómo hacerlo sonar menos de agencia sin perder la voz de tu marca.

- ¿Voseo?: no ✅

- Tokens: input 2259 / output 595 (razonamiento 276) / total 2854
- Primer token visible: 6.6 s · total 7.7 s · costo $0.0005

#### Voz: Cafetería profesional en Monterrey

##### Corrida 1 — respondió `openai:gpt-6-luna@high`

No necesitas meter slang ni imitar cómo habla tu público. Para que suene menos a agencia, hazlo más **directo, concreto y cercano**, sin perder el cuidado de una cafetería de especialidad.

Prueba esto:

- **Cambia frases abstractas por cosas que la gente reconoce.**  
  “Una experiencia para tus sentidos” → “Un buen café y algo de comer antes de volver al trabajo”.
- **Quita palabras de marketing** como _imperdible_, _experiencia única_ o _eleva tu rutina_, salvo que de verdad aporten.
- **Habla de momentos reales:** pasar antes de entrar a trabajar, hacer una pausa o desayunar cerca.
- **Usa frases más cortas** y un llamado sencillo, como “Te esperamos”.
- **Sé específico solo con datos reales:** qué café o desayuno tienen, cuándo está disponible y qué lo hace distinto. No hace falta adornarlo.

Una prueba útil: léelo en voz alta. Si no se lo dirías así a alguien que entra a tu cafetería, probablemente está demasiado producido. Evita también forzar expresiones “de barrio”; puede sonar más artificial que cercano.

- ¿Voseo?: no ✅

- Tokens: input 2254 / output 431 (razonamiento 185) / total 2685
- Primer token visible: 5.4 s · total 6.3 s · costo $0.0004

## tool-cafe-temporada (espera tool call)

> Hazme un post para Instagram anunciando nuestro café de temporada en 'La Ceiba Café': lleva canela y piloncillo, cuesta 65 pesos y solo hay este mes.

### cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5

#### Voz: Taquería de barrio en Mérida

##### Corrida 1 — respondió `openai:gpt-6-luna@high`

Listo, preparé el borrador para Instagram.

- ¿Voseo?: no ✅

- ¿Llamó la tool?: sí (1: crear_borrador_visual)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_visual</code></summary>

```json
{
  "caption": "Ya llegó el café de temporada a La Ceiba Café ☕🌿 Con canela y piloncillo, calientito y listo para acompañar tu antojo. Cuesta $65 y solo estará este mes. ¡Cae por acá antes de que se acabe!",
  "hashtags": ["LaCeibaCafé", "CaféDeTemporada", "CanelaYPiloncillo", "AntojoDeCafé"],
  "imagePrompt": "Una taza de café de temporada con una ramita de canela y trozos de piloncillo sobre una mesa de La Ceiba Café, con el nombre del negocio visible en el entorno; encuadre cercano con la taza como protagonista.",
  "network": "instagram"
}
```

</details>

- Tokens: input 4928 / output 180 (razonamiento 0) / total 5108
- Primer token visible: 0.9 s · total 4.1 s · costo $0.0002

#### Voz: Cafetería casual en Mérida

##### Corrida 1 — respondió `openai:gpt-6-luna@high`

Te preparé el borrador para Instagram. **La Ceiba Café** anuncia su café de temporada con canela y piloncillo por **$65**, disponible solo este mes.

- ¿Voseo?: no ✅

- ¿Llamó la tool?: sí (1: crear_borrador_visual)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_visual</code></summary>

```json
{
  "caption": "Ya llegó nuestro café de temporada ☕️ Lleva canela y piloncillo, cuesta $65 y solo estará disponible durante este mes. Te esperamos en La Ceiba Café.",
  "hashtags": ["LaCeibaCafé", "CaféDeTemporada", "CaféDeEspecialidad", "Mérida"],
  "imagePrompt": "Una taza de café de temporada con una rama de canela y trozos de piloncillo sobre una mesa de cafetería; al fondo, el espacio de La Ceiba Café y una persona disfrutando la bebida.",
  "network": "instagram"
}
```

</details>

- Tokens: input 4712 / output 176 (razonamiento 0) / total 4888
- Primer token visible: 1.0 s · total 4.3 s · costo $0.0002

#### Voz: Cafetería neutra en CDMX

##### Corrida 1 — respondió `openai:gpt-6-luna@high`

Listo: preparé un borrador para Instagram anunciando el café de temporada de La Ceiba Café, a $65 y disponible solo durante octubre.

- ¿Voseo?: no ✅

- ¿Llamó la tool?: sí (1: crear_borrador_visual)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_visual</code></summary>

```json
{
  "caption": "Ya llegó el café de temporada de La Ceiba Café ☕ Preparado con canela y piloncillo, por $65. Disponible solo durante octubre. Te esperamos.",
  "hashtags": ["LaCeibaCafé", "CaféDeTemporada", "CaféDeEspecialidad", "CDMX"],
  "imagePrompt": "Una taza de café de temporada con una rama de canela al lado y un pequeño trozo de piloncillo, servida sobre una mesa de cafetería; la taza es el centro de la composición y al fondo se distingue sutilmente el espacio de una cafetería.",
  "network": "instagram"
}
```

</details>

- Tokens: input 4875 / output 348 (razonamiento 166) / total 5223
- Primer token visible: 5.2 s · total 8.0 s · costo $0.0003

#### Voz: Cafetería profesional en Monterrey

##### Corrida 1 — respondió `openai:gpt-6-luna@high`

Listo: preparé el borrador para Instagram de La Ceiba Café, con el precio de $65 y disponibilidad durante octubre.

- ¿Voseo?: no ✅

- ¿Llamó la tool?: sí (1: crear_borrador_visual)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_visual</code></summary>

```json
{
  "caption": "Descubre nuestro café de temporada en La Ceiba Café: una combinación de canela y piloncillo por $65. Disponible solo durante octubre. Te esperamos.",
  "hashtags": ["LaCeibaCafé", "CaféDeTemporada", "CaféDeEspecialidad", "Monterrey"],
  "imagePrompt": "Una taza de café de temporada con una rama de canela y trozos de piloncillo junto a ella, sobre una mesa de cafetería; composición cercana que destaque la taza y los ingredientes, con el espacio de La Ceiba Café al fondo.",
  "network": "instagram"
}
```

</details>

- Tokens: input 4691 / output 238 (razonamiento 67) / total 4929
- Primer token visible: 0.9 s · total 5.2 s · costo $0.0002

---

## Consumo de tokens por proveedor (2 prompts × 4 voces)

Primer token visible: mediana y peor caso. Costo: promedio por turno, con los precios de `apps/api/src/ai/model-prices.ts`.

| Modelo                                                                                     | Input | Output | Razonamiento | % razonamiento | Primer token (mediana / peor) | Costo por turno |
| ------------------------------------------------------------------------------------------ | ----- | ------ | ------------ | -------------- | ----------------------------- | --------------- |
| `cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5` | 28344 | 2912   | 1111         | 38%            | 5.0 s / 6.6 s                 | $0.0003         |

## Veredicto (juicio humano)

| Modelo                                                                                     | Registro cultural (1-5) | Tool calling | Notas |
| ------------------------------------------------------------------------------------------ | ----------------------- | ------------ | ----- |
| `cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5` |                         |              |       |

**Conclusión:**

_Pendiente de llenar por Jose tras leer el reporte._

**Lectura de Claude (F12.5 PR1, una sola corrida, indicio y no prueba):** comparado con el mismo caso y las mismas voces con el prompt de antes (`2026-11-07-reporte-voces-antes.md`):

- **Profesional se separa.** Antes, la regia profesional y la neutra de CDMX salían casi idénticas («Ya llegó… ☕️✨ … Te esperamos»), y la profesional hasta decía «break». Ahora: «Descubre nuestro café de temporada… una combinación de canela y piloncillo», sin emoji ni coloquialismos.
- **De barrio no cambia**, y está bien: ya traía modismos permitidos y CTAs de barrio.
- **Casual y neutro siguen cerca.** Son zonas vecinas del slider; la diferencia más fina vendrá de las muestras del creator (F12.5 PR3/PR4).
- **Ojo:** la corrida es anterior a dos ajustes de la revisión del PR1: «de barrio» dejó de decir «de su ciudad», y la guía cierra con «sus modismos permitidos y prohibidos mandan sobre esta guía». Ninguno cambia los casos de arriba, porque las voces de cafetería no traen modismos.
- **Región sin caricatura.** La cafetería de Mérida no metió «uay» ni «bomba» sin que el creator los usara. Ninguna de las 8 respuestas voseó.
