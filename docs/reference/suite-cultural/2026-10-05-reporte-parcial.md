# Suite de regresión cultural — 2026-10-05

System prompt: el de producción (`apps/api/src/chat/system-prompt.ts`), sin voz de marca (`buildSystemPrompt(null)` === prompt base).
Modelos: `google:gemini-3.6-flash`.

Criterio de juicio: tuteo natural, cero voseo, modismos mexicanos bien usados,
registro cercano sin caer en caricatura. Lo que suene a "español de aeropuerto" pierde.

## tool-carrusel-pasos (espera tool call)

> Hazme un carrusel para Instagram con los 5 pasos para preparar un buen café de olla en casa, para mi cafetería 'La Canela'. Una imagen por paso.

### google:gemini-3.6-flash

¡Listo! Ya creé el borrador del carrusel para Instagram de tu cafetería **La Canela**.

Incluye la portada y las 5 imágenes correspondientes a cada paso del café de olla, junto con el texto y hashtags sugeridos para la publicación. Puedes revisarlo y ajustarlo en tu panel. ¡Mucho éxito con la publicación! ☕✨

- ¿Llamó la tool?: sí (1: crear_borrador_visual)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_visual</code></summary>

```json
{
  "caption": "¡El secreto de un buen café de olla está en el amor y en los detalles! ☕✨ En La Canela te enseñamos a preparar esta tradición mexicana en casa con 5 sencillos pasos.\n\nDesliza para ver la guía completa 👉\n\n1️⃣ Hierve el agua con piloncillo y canela.\n2️⃣ Agrega tu café molido favorito de La Canela.\n3️⃣ Deja reposar e infusionar fuera del fuego.\n4️⃣ Cuela para lograr una textura suave.\n5️⃣ ¡Sirve en tu jarrito favorito y disfruta!\n\nGuarda este post para tu próxima mañana fría o compártelo con quien ame el café de olla. 🪵🍂",
  "hashtags": [
    "#CafeDeOlla",
    "#LaCanela",
    "#CafeMexicano",
    "#RecetasDeCafe",
    "#TradicionMexicana",
    "#CafeArtesanal"
  ],
  "imagePrompt": "Una olla de barro tradicional mexicana sobre una mesa de madera rústica, rodeada de rajitas de canela entera y conos de piloncillo.",
  "network": "instagram",
  "carouselImagePrompts": [
    "Una olla de barro tradicional mexicana sobre una mesa de madera rústica, rodeada de rajitas de canela entera y conos de piloncillo.",
    "Agua hirviendo a fuego lento dentro de una olla de barro con una raja de canela y piloncillo disolviéndose.",
    "Una mano virtiendo café recién molido de grano en el agua infundida con canela dentro de la olla de barro.",
    "La olla de barro reposando fuera del fuego con su tapa puesta para dejar infusionar el café.",
    "Café de olla caliente siendo colado cuidadosamente con un colador tradicional hacia un recipiente.",
    "Un jarrito de barro humeante lleno de café de olla recién servido, acompañado de un pan dulce sobre la mesa."
  ]
}
```

</details>

- Tokens: input 3367 / output 1284 / total 4651

## tool-una-imagen (espera tool call)

> Hazme un post para Facebook anunciando que ya abrimos la terraza de mi cafetería 'La Canela' en el centro de Mérida, a partir de este sábado.

### google:gemini-3.6-flash

¡Listo! Ya creé el borrador de tu publicación para Facebook con el anuncio de la nueva terraza de **La Canela**.

Puedes revisarlo en tu panel para ajustar detalles, agregar el horario exacto si lo deseas o cambiar la imagen antes de publicar. ¡Mucho éxito con la apertura este sábado!

- ¿Llamó la tool?: sí (1: crear_borrador_visual)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_visual</code></summary>

```json
{
  "caption": "¡Buenas noticias en La Canela! ☕🌿✨\n\nA partir de este sábado estrenamos terraza en el centro de Mérida. Imagínate disfrutar de tu café favorito y nuestros postres artesanales al aire libre, sintiendo la brisa de la tarde en un espacio lleno de plantas y tranquilidad.\n\nEs el pretexto perfecto para armar el plan con amigos, venir a leer o simplemente regalarte un momento relajante.\n\n📍 Te esperamos en el centro de Mérida.\n🗓️ Apertura oficial: Este sábado.\n\n¡Ven a conocer la nueva terraza y estrénala con nosotros!",
  "hashtags": [
    "#LaCanela",
    "#CafeteriaMerida",
    "#CentroDeMerida",
    "#MeridaYucatan",
    "#NuevaTerraza",
    "#CafeEnMerida"
  ],
  "imagePrompt": "Una vista acogedora de la terraza al aire libre de una cafetería colonial en el centro de Mérida, Yucatán. Mesas de madera dispuestas con tazas de café y platos de repostería, rodeadas de plantas tropicales en macetas de barro, sobre un piso de pasta tradicional.",
  "network": "facebook"
}
```

</details>

- Tokens: input 3063 / output 981 / total 4044

---

## Consumo de tokens por proveedor (2 prompts)

| Modelo                    | Input | Output | Total |
| ------------------------- | ----- | ------ | ----- |
| `google:gemini-3.6-flash` | 6430  | 2265   | 8695  |

## Veredicto (juicio humano)

| Modelo                    | Registro cultural (1-5) | Tool calling | Notas |
| ------------------------- | ----------------------- | ------------ | ----- |
| `google:gemini-3.6-flash` |                         |              |       |

**Conclusión:**

_Pendiente de llenar por Jose tras leer el reporte._
