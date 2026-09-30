# Suite de regresión cultural — 2026-09-30

System prompt: el de producción (`apps/api/src/chat/system-prompt.ts`), sin voz de marca (`buildSystemPrompt(null)` === prompt base).
Modelos: `google:gemini-3.6-flash`.

Criterio de juicio: tuteo natural, cero voseo, modismos mexicanos bien usados,
registro cercano sin caer en caricatura. Lo que suene a "español de aeropuerto" pierde.

## tool-promo-tacos (espera tool call)

> Hazme un borrador para Instagram de una promo 2x1 en tacos al pastor para este viernes en mi taquería 'El Trompo Feliz', solo en sucursal, de 6 a 11pm. Tono relajado, de barrio.

### google:gemini-3.6-flash

¡Listo! Ya quedó creado el borrador para Instagram de tu taquería **El Trompo Feliz**.

Puedes revisar el texto, los hashtags y la idea de imagen directamente en tu panel de Presencia para hacerle cualquier ajuste antes de publicar. ¡Mucho éxito con la promo del viernes! 🌮🔥

- ¿Llamó la tool?: sí (1: crear_borrador_visual)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_visual</code></summary>

```json
{
  "caption": "¡Raza! Este viernes se arma la taquiza en grande 🌮🔥\n\nNos pusimos guapos en El Trompo Feliz: ¡todos los tacos al pastor están al 2x1!\n\nAsí como lo lees: pides uno y el otro va por nuestra cuenta. Jala a la clica, a la familia o vente a darte un atracón a gusto, ¡aquí nadie te juzga! 😎\n\n📍 Solo en sucursal\n⏰ Este viernes, de 6:00 pm a 11:00 pm\n\nCáile temprano antes de que baje la marea y el trompo nos pida esquina. ¡Te esperamos!",
  "hashtags": [
    "#ElTrompoFeliz",
    "#TacosAlPastor",
    "#Promo2x1",
    "#ViernesDeTacos",
    "#TaqueriaMexicana",
    "#AmoLosTacos"
  ],
  "imagePrompt": "Un trompo gigante de carne al pastor girando con una piña fresca en la parte superior sobre el mostrador de una taquería mexicana tradicional, mientras el taquero rebana la carne sobre tortillas caliente.",
  "network": "instagram"
}
```

</details>

- Tokens: input 2957 / output 898 / total 3855

## tool-post-linkedin (espera tool call)

> Arma un post para LinkedIn presentando mi nuevo servicio de fotografía profesional para restaurantes en Mérida, se llama 'Lente y Sazón', tono corporativo pero cercano, con llamada a que me escriban por DM.

### google:gemini-3.6-flash

¡Listo! Te he preparado el borrador del post para LinkedIn con el tono corporativo pero cercano que me pediste, destacando el valor de "Lente y Sazón" para la industria gastronómica de Mérida y cerrando con la llamada a la acción hacia tu DM.

Puedes revisar y editar el borrador directamente en la tarjeta adjunta.

- ¿Llamó la tool?: sí (1: crear_borrador_texto)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_texto</code></summary>

```json
{
  "body": "La gastronomía de Mérida se vive con todos los sentidos, pero en el entorno digital, el primer bocado entra siempre por los ojos. 📸🍽️\n\nHoy quiero compartirles oficialmente el lanzamiento de Lente y Sazón, un servicio especializado de fotografía profesional pensado para restaurantes, cafeterías y proyectos gastronómicos en Mérida y sus alrededores.\n\n¿El objetivo? Ayudar a que la propuesta culinaria de tu marca transmita en pantalla la misma calidad, frescura y antojo que ofrece en la mesa.\n\nLo que trabajamos juntos:\n• Fotografía de menú e ingredientes.\n• Muestra de espacios, ambiente y experiencia de marca.\n• Creación de contenido visual de alto impacto para campañas y redes sociales.\n\nSi buscas renovar la imagen visual de tu restaurante o lanzar un nuevo menú este año, me encantará colaborar contigo.\n\n📩 Envíame un mensaje directo por aquí (DM) y platicamos sobre las necesidades de tu espacio.",
  "hashtags": [
    "#FotografiaGastronomica",
    "#RestaurantesMerida",
    "#LenteYSazon",
    "#MeridaYucatan",
    "#MarketingGastronomico"
  ],
  "imagePrompt": "Un fotógrafo profesional capturando un plato gourmet en la mesa de un restaurante iluminado y acogedor en Mérida, Yucatán.",
  "network": "linkedin"
}
```

</details>

- Tokens: input 2834 / output 813 / total 3647

## tool-carrusel-pasos (espera tool call)

> Hazme un carrusel para Instagram con los 5 pasos para preparar un buen café de olla en casa, para mi cafetería 'La Canela'. Una imagen por paso.

### google:gemini-3.6-flash

¡Listo! Ya quedó creado el borrador de carrusel para Instagram de **La Canela**.

Incluye la portada y los 5 pasos ilustrados, junto con el copy enfocado en conectar con tus clientes e incentivarlos a guardar la publicación o visitar la cafetería. Puedes revisarlo y ajustarlo directamente en tu panel de borradors.

- ¿Llamó la tool?: sí (1: crear_borrador_visual)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_visual</code></summary>

```json
{
  "caption": "¿A quién no se le antoja un café de olla calentito? ☕✨\n\nEn La Canela nos apasiona la tradición del buen café mexicano, y hoy te compartimos la receta básica para preparar un auténtico café de olla en tu casa sin complicaciones. \n\nDesliza para ver los 5 pasos básicos ➡️\n\n1. Hierve el agua en tu olla de barro preferida.\n2. Infusiona la canela y el piloncillo para soltar todo el aroma y dulzor.\n3. Agrega tu café de grano recién molido (molido grueso).\n4. Deja reposar fuera del fuego para concentrar los sabores.\n5. Sirve en tu jarrito de barro favorito y ¡a disfrutar!\n\nY si prefieres que te lo preparemos nosotros, ¡te esperamos en La Canela! 😉\n\nGuarda este post para tu próxima mañana helada o compártelo con esa persona amante del buen café. 👇",
  "hashtags": [
    "#CafeDeOlla",
    "#LaCanela",
    "#CafeMexicano",
    "#RecetasDeCafe",
    "#CafeTradicional",
    "#AmantesDelCafe"
  ],
  "imagePrompt": "Una olla de barro artesanal humeante con café de olla recién preparado sobre una mesa de madera tradicional, rodeada de rajas de canela y piloncillo.",
  "network": "instagram",
  "carouselImagePrompts": [
    "Una olla de barro artesanal humeante con café de olla recién preparado sobre una mesa de madera tradicional, rodeada de rajas de canela y piloncillo.",
    "Una olla de barro con agua limpia sobre la estufa a punto de romper en hervor.",
    "Manos agregando rajas de canela entera y un cono de piloncillo al agua caliente dentro de una olla de barro.",
    "Una cuchara vertiendo café de grano molido grueso dentro de la olla de barro con la infusión de canela.",
    "La olla de barro tapada descansando sobre una superficie de madera a un lado de la estufa para reposar.",
    "Una mano sirviendo café de olla caliente desde la olla de barro hacia un jarrito tradicional de barro con vapor saliendo."
  ]
}
```

</details>

- Tokens: input 3392 / output 1389 / total 4781

## tool-una-imagen (espera tool call)

> Hazme un post para Facebook anunciando que ya abrimos la terraza de mi cafetería 'La Canela' en el centro de Mérida, a partir de este sábado.

### google:gemini-3.6-flash

¡Listo! Ya quedó creado el borrador para la página de Facebook de **La Canela**.

Puedes revisarlo y editarlo si quieres agregar algún detalle extra (como el horario exacto del sábado o alguna promoción especial de apertura). ¡Mucho éxito con la inauguración de la terraza! ☕🌿

- ¿Llamó la tool?: sí (1: crear_borrador_visual)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_visual</code></summary>

```json
{
  "caption": "¡Tenemos noticias increíbles! ☀️🌿 A partir de este sábado, abrimos oficialmente la terraza de La Canela en el centro de Mérida.\n\nVen a disfrutar de tu café favorito, postres deliciosos y el mejor ambiente al aire libre en pleno corazón de la ciudad. Queremos que estrenes este nuevo espacio con nosotros. ☕✨\n\n📍 Te esperamos en La Canela (Centro de Mérida).\n🗓️ Apertura de terraza: Este sábado.\n\n¿Con quién vas a venir a estrenar la terraza? ¡Etiquétalo en los comentarios! 👇",
  "hashtags": ["#LaCanela", "#Merida", "#CentroHistoricoMerida", "#CafeteriasMerida", "#Terraza"],
  "imagePrompt": "Una colorida terraza al aire libre de una cafetería colonial en el centro de Mérida, con mesas de madera, sillas de herrería, plantas tropicales en macetas de barro, tazas de café humeante y pan dulce servido en las mesas, en un ambiente ameno y relajado.",
  "network": "facebook"
}
```

</details>

- Tokens: input 2845 / output 825 / total 3670

---

## Consumo de tokens por proveedor (4 prompts)

| Modelo                    | Input | Output | Total |
| ------------------------- | ----- | ------ | ----- |
| `google:gemini-3.6-flash` | 12028 | 3925   | 15953 |

## Veredicto (juicio humano)

| Modelo                    | Registro cultural (1-5) | Tool calling | Notas |
| ------------------------- | ----------------------- | ------------ | ----- |
| `google:gemini-3.6-flash` |                         |              |       |

**Conclusión:**

_Pendiente de llenar por Jose tras leer el reporte._
