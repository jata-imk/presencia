# Suite de regresión cultural — 2026-10-12

System prompt: el de producción (`apps/api/src/chat/system-prompt.ts`), sin voz de marca (`buildSystemPrompt(null)` === prompt base).
Modelos: `openai:gpt-6-luna@high`, `google:gemini-3.8-flash@medium`, `anthropic:claude-sonnet-5-5`.

Criterio de juicio: tuteo natural, cero voseo, modismos mexicanos bien usados,
registro cercano sin caer en caricatura. Lo que suene a "español de aeropuerto" pierde.

## limite-enlace

> Échale un ojo a este artículo y hazme un resumen para sacar ideas de posts: https://www.diariodeyucatan.com/merida/2026/10/05/la-marquesita-cumple-80-anos

### openai:gpt-6-luna@high

No puedo abrir enlaces desde aquí. Pega el texto del artículo —o los fragmentos principales— y te hago un resumen con ideas de posts.

- Tokens: input 1082 / output 104 (razonamiento 68) / total 1186
- Primer token visible: 2.3 s · total 2.7 s · costo $0.0002

### google:gemini-3.8-flash@medium

No puedo abrir enlaces ni navegar en internet, por lo que no puedo ver el artículo directamente.

¿Podrías copiar y pegar aquí el texto o los puntos más importantes de la nota? Con eso te armo con gusto el resumen y una buena lista de ideas para tus posts.

- Tokens: input 1302 / output 276 (razonamiento 217) / total 1578
- Primer token visible: 3.1 s · total 3.5 s · costo $0.0020

### anthropic:claude-sonnet-5-5

No puedo abrir enlaces, así que no tengo forma de leer ese artículo ni de resumírtelo. Prefiero no adivinar su contenido a partir de la dirección.

Para ayudarte, puedes hacer una de estas dos cosas:

- **Pegar aquí el texto del artículo** (completo o los párrafos principales). Yo te lo resumo y te saco ideas de posts.
- **Contarme de qué trata** con tus palabras: los datos clave, las fechas, los personajes y lo que te llamó la atención.

También me sirve que me digas **qué vendes o a qué te dedicas** y **en qué red quieres publicar**. Así las ideas salen aterrizadas a tu negocio y a tu tono, y no genéricas.

- Tokens: input 2462 / output 259 (razonamiento 0) / total 2721
- Primer token visible: 0.9 s · total 3.2 s · costo $0.0075

## tool-post-con-enlace (espera tool call)

> Hazme un post para LinkedIn invitando a mi taller de fotografía de comida en Mérida, el 25 de octubre. Que se inscriban aquí: https://lenteysazon.mx/taller

### openai:gpt-6-luna@high

Listo, preparé el borrador para LinkedIn.

- ¿Llamó la tool?: sí (1: crear_borrador_texto)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_texto</code></summary>

```json
{
  "body": "¿Te gustaría que tus fotos de comida cuenten una historia y se antojen desde el primer vistazo? 📸🍽️\n\nTe invito a mi taller de fotografía de comida en Mérida este 25 de octubre. Será un espacio para explorar cómo capturar los platillos y compartirlos con más intención.\n\nInscríbete aquí: https://lenteysazon.mx/taller",
  "hashtags": [],
  "network": "linkedin"
}
```

</details>

- Tokens: input 2360 / output 196 (razonamiento 69) / total 2556
- Primer token visible: 3.7 s · total 6.0 s · costo $0.0001

### google:gemini-3.8-flash@medium

¡Listo! Ya quedó preparado tu borrador para LinkedIn enfocado en emprendedores, chefs y profesionales de la industria gastronómica en Mérida.

Incluye el llamado a la acción con tu enlace y una propuesta de imagen detrás de cámaras para acompañar la publicación. Puedes revisarlo y ajustar cualquier detalle si lo requieres.

- ¿Llamó la tool?: sí (1: crear_borrador_texto)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_texto</code></summary>

```json
{
  "body": "Una buena foto de comida no solo abre el apetito: vende, cuenta historias y eleva la percepción de cualquier proyecto gastronómico.\n\nSi eres restaurantero, creador de contenido, chef o simplemente te apasiona capturar la magia de la cocina, esto te interesa:\n\n📸 Taller de Fotografía Gastronómica en Mérida\n📅 25 de octubre\n\nVamos a ver desde composición y estilismo de platillos hasta el manejo de luz para lograr tomas irresistibles que destaquen en digital y medios impresos. Es un espacio totalmente práctico pensado para quienes buscan llevar su propuesta visual al siguiente nivel.\n\nEl cupo es limitado para asegurar una experiencia personalizada y práctica para cada participante.\n\nAparta tu lugar aquí: https://lenteysazon.mx/taller\n\n¿Nos vemos en Mérida? Etiqueta en comentarios a quien le pueda servir este taller.",
  "hashtags": [
    "FotografiaGastronomica",
    "Merida",
    "FoodStyling",
    "MarketingGastronomico",
    "TalleresMerida"
  ],
  "imagePrompt": "Detrás de cámaras de una sesión de fotografía gastronómica: una persona ajusta con pinzas los elementos de un platillo gourmet sobre una mesa rústica, mientras una cámara réflex sobre un tripié enfoca la escena.",
  "network": "linkedin"
}
```

</details>

- Tokens: input 3212 / output 666 (razonamiento 299) / total 3878
- Primer token visible: 6.9 s · total 9.1 s · costo $0.0049

### anthropic:claude-sonnet-5-5

Ya te dejé el borrador del post para LinkedIn con la fecha, la ciudad y tu enlace de inscripción.

Solo usé los datos que me diste. No inventé precio, horario, sede, cupo ni temario. Si me pasas alguno de esos datos, lo agrego. También puedo ajustar el tono (más cercano, más formal o más vendedor) o añadir qué van a aprender los asistentes, porque eso suele aumentar las inscripciones.

- ¿Llamó la tool?: sí (1: crear_borrador_texto)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_texto</code></summary>

```json
{
  "body": "Una buena foto puede hacer que alguien se antoje de un platillo antes de probarlo.\n\nPor eso quiero invitarte a mi taller de fotografía de comida en Mérida, el próximo 25 de octubre.\n\nSi tienes un restaurante, una marca de alimentos, un negocio gastronómico o simplemente quieres mejorar cómo fotografías lo que cocinas o vendes, este taller es para ti.\n\n📍 Mérida, Yucatán\n📅 25 de octubre\n\nInscríbete aquí: https://lenteysazon.mx/taller\n\nSi conoces a alguien a quien le pueda interesar, compártelo. ¡Nos vemos en Mérida!",
  "hashtags": [
    "FotografíaDeComida",
    "Mérida",
    "TallerDeFotografía",
    "FoodPhotography",
    "Gastronomía"
  ],
  "network": "linkedin"
}
```

</details>

- Tokens: input 5749 / output 946 (razonamiento 399) / total 6695
- Primer token visible: 4.0 s · total 9.5 s · costo $0.0210

---

## Consumo de tokens por proveedor (2 prompts)

Primer token visible: mediana y peor caso. Costo: promedio por turno, con los precios de `apps/api/src/ai/model-prices.ts`.

| Modelo                           | Input | Output | Razonamiento | % razonamiento | Primer token (mediana / peor) | Costo por turno |
| -------------------------------- | ----- | ------ | ------------ | -------------- | ----------------------------- | --------------- |
| `openai:gpt-6-luna@high`         | 3442  | 300    | 137          | 46%            | 3.7 s / 3.7 s                 | $0.0002         |
| `google:gemini-3.8-flash@medium` | 4514  | 942    | 516          | 55%            | 6.9 s / 6.9 s                 | $0.0035         |
| `anthropic:claude-sonnet-5-5`    | 8211  | 1205   | 399          | 33%            | 4.0 s / 4.0 s                 | $0.0142         |

## Veredicto (juicio humano)

| Modelo                           | Registro cultural (1-5) | Tool calling | Notas |
| -------------------------------- | ----------------------- | ------------ | ----- |
| `openai:gpt-6-luna@high`         |                         |              |       |
| `google:gemini-3.8-flash@medium` |                         |              |       |
| `anthropic:claude-sonnet-5-5`    |                         |              |       |

**Conclusión:**

_Pendiente de llenar por Jose tras leer el reporte._
