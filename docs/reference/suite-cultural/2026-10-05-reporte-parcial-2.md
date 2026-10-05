# Suite de regresión cultural — 2026-10-05

System prompt: el de producción (`apps/api/src/chat/system-prompt.ts`), sin voz de marca (`buildSystemPrompt(null)` === prompt base).
Modelos: `google:gemini-3.6-flash`.

Criterio de juicio: tuteo natural, cero voseo, modismos mexicanos bien usados,
registro cercano sin caer en caricatura. Lo que suene a "español de aeropuerto" pierde.

## tool-carrusel-libre (espera tool call)

> Hazme un carrusel para Instagram con tips para preparar mejor café en casa, para mi cafetería 'La Canela'.

### google:gemini-3.6-flash

¡Listo! Ya creé el borrador del carrusel para Instagram de **La Canela**.

El post incluye un gancho llamativo para los amantes del café, 4 tips prácticos para mejorar su preparación en casa y llamados a la acción para guardar la publicación y visitar la cafetería. También incluye las descripciones de las imágenes para cada slide.

Puedes revisarlo y editarlo cuando gustes directamente en tus borradores.

- ¿Llamó la tool?: sí (1: crear_borrador_visual)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_visual</code></summary>

```json
{
  "caption": "¿Quieres que tu café de las mañanas se sepa como de barra profesional? ☕✨\n\nNo necesitas ser un barista experto ni tener equipo supercostoso para mejorar drásticamente el sabor de tu taza en casa. En La Canela te compartimos 4 consejos sencillos pero clave para transformar tu rutina cafetera daily. \n\nGuarda este post para tu próxima preparación y cuéntanos en los comentarios: ¿cuál de estos pasos ya aplicas en casa? 👇\n\n📍 Visítanos en La Canela y llévate tu bolsa de granos recién tostados para poner a prueba estos tips.",
  "hashtags": [
    "#LaCanela",
    "#CaféEnCasa",
    "#TipsDeCafé",
    "#CaféDeEspecialidad",
    "#BaristaEnCasa",
    "#AmantesDelCafé"
  ],
  "imagePrompt": "Un grano de café fresco partiéndose al centro sobre una barra de madera rústica, con una prensa francesa y una taza de café humeante al fondo.",
  "network": "instagram",
  "carouselImagePrompts": [
    "Un grano de café fresco partiéndose al centro sobre una barra de madera rústica, con una prensa francesa y una taza de café humeante al fondo.",
    "Un molinillo manual de café moliendo granos enteros, con café molido cayendo de forma consistente en el contenedor.",
    "Una jarra de cristal transparente vertiendo agua limpia y filtrada dentro de un hervidor de cuello de cisne sobre una barra.",
    "Una báscula digital de cocina con un método de extracción V60 encima, pesando el café molido con precisión.",
    "Un termómetro de cocina dentro de un hervidor de agua caliente mostrando la temperatura ideal, con un suave humo saliendo."
  ]
}
```

</details>

- Tokens: input 3017 / output 983 / total 4000

---

## Consumo de tokens por proveedor (1 prompts)

| Modelo                    | Input | Output | Total |
| ------------------------- | ----- | ------ | ----- |
| `google:gemini-3.6-flash` | 3017  | 983    | 4000  |

## Veredicto (juicio humano)

| Modelo                    | Registro cultural (1-5) | Tool calling | Notas |
| ------------------------- | ----------------------- | ------------ | ----- |
| `google:gemini-3.6-flash` |                         |              |       |

**Conclusión:**

_Pendiente de llenar por Jose tras leer el reporte._
