# Suite de regresión cultural — 2026-09-30

System prompt: el de producción (`apps/api/src/chat/system-prompt.ts`), sin voz de marca (`buildSystemPrompt(null)` === prompt base).
Modelos: `google:gemini-3.6-flash`.

Criterio de juicio: tuteo natural, cero voseo, modismos mexicanos bien usados,
registro cercano sin caer en caricatura. Lo que suene a "español de aeropuerto" pierde.

## tool-promo-tacos (espera tool call)

> Hazme un borrador para Instagram de una promo 2x1 en tacos al pastor para este viernes en mi taquería 'El Trompo Feliz', solo en sucursal, de 6 a 11pm. Tono relajado, de barrio.

### google:gemini-3.6-flash

¡Listo! Ya te creé el borrador para Instagram con todo el sabor de barrio y los detalles de tu promo para este viernes. Puedes revisarlo y editarlo desde tu panel de Presencia cuando gustes. ¡Éxito con esas ventas en 'El Trompo Feliz'! 🌮🔥

- ¿Llamó la tool?: sí (1: crear_borrador_visual)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_visual</code></summary>

```json
{
  "caption": "¡Este viernes se cena chido en El Trompo Feliz! 🔥🌮\n\nJálate a la sucursal porque tenemos PROMO 2x1 en tacos al pastor. Trae al compa, a la pareja o vente a cenar como rey sin gastar de más.\n\n📅 ¿Cuándo? Este viernes\n⏰ ¿A qué hora? De 6:00 pm a 11:00 pm\n📍 ¿Dónde? Solo en sucursal\n\nÁmonos recio, ¡acá te esperamos con la salsa bien filosa y el trompo listo!",
  "hashtags": [
    "#TacosAlPastor",
    "#ElTrompoFeliz",
    "#Promo2x1",
    "#ViernesDeTacos",
    "#TacosCDMX",
    "#AmoLosTacos"
  ],
  "imagePrompt": "A close-up shot of two freshly prepared tacos al pastor placed side by side on a classic taquería plastic plate lined with paper, generously garnished with chopped cilantro, diced onions, and a thin slice of pineapple, sitting on a stainless steel taquería counter with warm background context.",
  "network": "instagram"
}
```

</details>

- Tokens: input 3006 / output 978 / total 3984

## tool-post-linkedin (espera tool call)

> Arma un post para LinkedIn presentando mi nuevo servicio de fotografía profesional para restaurantes en Mérida, se llama 'Lente y Sazón', tono corporativo pero cercano, con llamada a que me escriban por DM.

### google:gemini-3.6-flash

¡Listo! Ya creé el borrador para LinkedIn con la presentación de **Lente y Sazón**.

El post mantiene un tono profesional pero cercano, resalta el valor comercial de una buena imagen gastronómica en Mérida y cierra con una llamada a la acción clara para que te contacten por DM. Puedes revisarlo y ajustarlo en tu panel cuando gustes.

- ¿Llamó la tool?: sí (1: crear_borrador_texto)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_texto</code></summary>

```json
{
  "body": "El apetito entra por los ojos, y en la industria gastronómica de Mérida, una buena imagen puede ser la diferencia entre una mesa vacía y una lista de espera. 🍽️✨\n\nHoy quiero compartirles oficialmente el lanzamiento de Lente y Sazón, un servicio de fotografía profesional diseñado exclusivamente para restaurantes, cafeterías y proyectos gastronómicos en Mérida y sus alrededores.\n\nSabemos el esfuerzo que hay detrás de cada platillo: la selección de ingredientes, el sazón, la presentación y la experiencia en mesa. Nuestra meta en Lente y Sazón es traducir todo ese trabajo en imágenes de alto impacto visual que capturen la esencia de tu cocina, resalten la textura de tus platillos y atraigan a más clientes a tu establecimiento.\n\nOfrecemos:\n📸 Fotografía de menú y platillos insignia.\n🍷 Captura de ambientación, espacios y experiencia en sala.\n📲 Contenido visual optimizado para redes sociales, menús digitales y plataformas de entrega.\n\nSi tienes un restaurante o proyecto gastronómico en Mérida y quieres elevar la imagen de tu marca este año, hablemos. \n\n📩 Envíame un mensaje directo (DM) y con gusto platicamos sobre cómo podemos colaborar para que tu menú destaque como se merece.",
  "hashtags": [
    "FotografiaGastronomica",
    "RestaurantesMerida",
    "MeridaYucatan",
    "LenteYSazon",
    "MarketingGastronomico"
  ],
  "imagePrompt": "Un fotógrafo profesional capturando con su cámara un plato gourmet bien presentado sobre una mesa de madera en la terraza iluminada de un restaurante en Mérida.",
  "network": "linkedin"
}
```

</details>

- Tokens: input 2939 / output 981 / total 3920

## tool-carrusel-pasos (espera tool call)

> Hazme un carrusel para Instagram con los 5 pasos para preparar un buen café de olla en casa, para mi cafetería 'La Canela'. Una imagen por paso.

### google:gemini-3.6-flash

¡Listo! Te preparé el borrador del carrusel para Instagram de **La Canela**.

Incluye la portada y los 5 pasos ilustrados con prompts visuales para cada imagen, además de un texto optimizado con llamada a la acción y sus hashtags correspondientes. Ya lo tienes disponible en tu panel de borradores para revisar o agendar.

- ¿Llamó la tool?: sí (1: crear_borrador_visual)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_visual</code></summary>

```json
{
  "caption": "¿Hay algo más reconfortante que el aroma a café de olla por la mañana? ☕✨\n\nEn La Canela nos encanta compartir la pasión por nuestras tradiciones. Te dejamos la receta paso a paso para que prepares un auténtico café de olla en casa con el toque exacto de sabor.\n\nGuarda este carrusel para tu próximo desayuno y cuéntanos en los comentarios: ¿cuál es tu acompañamiento favorito para un buen café de olla? 👇",
  "hashtags": ["CaféDeOlla", "LaCanela", "CaféMexicano", "RecetasEnCasa", "AmantesDelCafé"],
  "imagePrompt": "Una olla de barro tradicional sobre una estufa de cocina, rodeada de rajas de canela enteros, conos de piloncillo y granos de café.",
  "network": "instagram",
  "carouselImagePrompts": [
    "Una olla de barro tradicional sobre una estufa de cocina, rodeada de rajas de canela enteros, conos de piloncillo y granos de café.",
    "Una mano colocando rajas de canela y un cono de piloncillo dentro de una olla de barro llena de agua en la estufa.",
    "El agua hirviendo suavemente dentro de la olla de barro mientras el piloncillo se termina de disolver por completo.",
    "Una cuchara vertiendo café de grano molido fresco dentro de la olla de barro con el agua aromatizada.",
    "La olla de barro reposando tapada sobre la estufa apagada en un ambiente de cocina acogedor.",
    "Servir el café caliente desde la olla a través de un colador fino directamente hacia un jarrito de barro artesanal."
  ]
}
```

</details>

- Tokens: input 3610 / output 1650 / total 5260

## tool-una-imagen (espera tool call)

> Hazme un post para Facebook anunciando que ya abrimos la terraza de mi cafetería 'La Canela' en el centro de Mérida, a partir de este sábado.

### google:gemini-3.6-flash

¡Listo! Ya creé el borrador de tu publicación para Facebook con la información de la terraza de **La Canela**. Puedes revisarlo y ajustarlo en el panel cuando quieras.

- ¿Llamó la tool?: sí (1: crear_borrador_visual)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_visual</code></summary>

```json
{
  "caption": "¡Tenemos excelentes noticias para tu fin de semana! 🌿☕ A partir de este sábado, abrimos oficialmente nuestra terraza en La Canela.\n\nVen a disfrutar de tu café favorito, postres deliciosos y el mejor ambiente al aire libre en pleno centro de Mérida. Ya sea para empezar la mañana con un buen desayuno o para relajarte por la tarde, este nuevo espacio está pensado para ti.\n\n📍 Te esperamos en el Centro de Mérida.\n📅 ¡Apertura de la terraza este sábado!\n\n¿Con quién vas a venir a estrenarla? Etiquétalo en los comentarios. 👇",
  "hashtags": [
    "#LaCanela",
    "#Merida",
    "#CentroDeMerida",
    "#CafeteriasMerida",
    "#Terraza",
    "#CafeMexicano"
  ],
  "imagePrompt": "A cozy coffee shop outdoor terrace with wooden tables, comfortable chairs, and lush tropical potted plants around, set in a historic courtyard of downtown Mérida. On the tables are artisanal coffee cups, fresh pastries, and cold coffee drinks. A welcoming wide shot of the seating area.",
  "network": "facebook"
}
```

</details>

- Tokens: input 3003 / output 1011 / total 4014

---

## Consumo de tokens por proveedor (4 prompts)

| Modelo                    | Input | Output | Total |
| ------------------------- | ----- | ------ | ----- |
| `google:gemini-3.6-flash` | 12558 | 4620   | 17178 |

## Veredicto (juicio humano)

| Modelo                    | Registro cultural (1-5) | Tool calling | Notas |
| ------------------------- | ----------------------- | ------------ | ----- |
| `google:gemini-3.6-flash` |                         |              |       |

**Conclusión:**

_Pendiente de llenar por Jose tras leer el reporte._
