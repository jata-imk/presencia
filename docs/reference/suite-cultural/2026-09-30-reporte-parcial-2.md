# Suite de regresión cultural — 2026-09-30

System prompt: el de producción (`apps/api/src/chat/system-prompt.ts`), sin voz de marca (`buildSystemPrompt(null)` === prompt base).
Modelos: `openai:gpt-5.6-terra`.

Criterio de juicio: tuteo natural, cero voseo, modismos mexicanos bien usados,
registro cercano sin caer en caricatura. Lo que suene a "español de aeropuerto" pierde.

## tool-promo-tacos (espera tool call)

> Hazme un borrador para Instagram de una promo 2x1 en tacos al pastor para este viernes en mi taquería 'El Trompo Feliz', solo en sucursal, de 6 a 11pm. Tono relajado, de barrio.

### openai:gpt-5.6-terra

Listo, armé el borrador para Instagram de la promo 2x1 de El Trompo Feliz.

- ¿Llamó la tool?: sí (1: crear_borrador_visual)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_visual</code></summary>

```json
{
  "caption": "🌮🔥 Este viernes se arma en El Trompo Feliz: ¡2x1 en tacos al pastor!\n\nCaele con tu banda y disfruta el doble de sabor por el mismo antojo. 😎\n\n📍 Válido solo en sucursal\n🕕 De 6:00 a 11:00 pm\n\n¡No te quedes con las ganas, aquí te esperamos!",
  "hashtags": ["#ElTrompoFeliz", "#TacosAlPastor", "#Promo2x1", "#Taquería", "#Antojo"],
  "imagePrompt": "Una orden abundante de tacos al pastor recién servidos en una mesa de taquería de barrio, con trompo de pastor y piña al fondo, limones, cilantro, cebolla y salsas alrededor; composición cercana y apetecible, dejando espacio libre en la parte superior para colocar información promocional.",
  "network": "instagram",
  "carouselImagePrompts": []
}
```

</details>

- Tokens: input 1972 / output 303 / total 2275

## tool-post-linkedin (espera tool call)

> Arma un post para LinkedIn presentando mi nuevo servicio de fotografía profesional para restaurantes en Mérida, se llama 'Lente y Sazón', tono corporativo pero cercano, con llamada a que me escriban por DM.

### openai:gpt-5.6-terra

Listo: preparé el borrador para LinkedIn de **Lente y Sazón** con tono corporativo cercano y llamada a escribirte por DM.

- ¿Llamó la tool?: sí (1: crear_borrador_texto)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_texto</code></summary>

```json
{
  "body": "Hoy presento **Lente y Sazón**, un servicio de fotografía profesional especializado en restaurantes en Mérida.\n\nSé que, antes de visitar un restaurante, muchas personas primero lo conocen en una pantalla. Una imagen bien resuelta puede transmitir el sabor de un platillo, la personalidad del lugar y el cuidado detrás de cada detalle.\n\nCon Lente y Sazón ayudo a restaurantes a crear fotografías profesionales para sus redes sociales, menús, plataformas de entrega y comunicación digital.\n\nMi enfoque es capturar lo que hace único a cada concepto: sus platillos, su ambiente y la experiencia que ofrece a sus comensales.\n\nSi tienes un restaurante en Mérida y quieres fortalecer tu presencia visual, escríbeme por DM. Me encantará platicar sobre tu proyecto.",
  "hashtags": [
    "FotografíaGastronómica",
    "RestaurantesMérida",
    "Mérida",
    "MarketingRestaurantero",
    "FotografíaProfesional"
  ],
  "imagePrompt": "",
  "network": "linkedin",
  "carouselImagePrompts": []
}
```

</details>

- Tokens: input 1961 / output 314 / total 2275

## tool-carrusel-pasos (espera tool call)

> Hazme un carrusel para Instagram con los 5 pasos para preparar un buen café de olla en casa, para mi cafetería 'La Canela'. Una imagen por paso.

### openai:gpt-5.6-terra

Listo: preparé el borrador de carrusel para Instagram de **La Canela** con 5 imágenes, una por cada paso.

- ¿Llamó la tool?: sí (1: crear_borrador_visual)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_visual</code></summary>

```json
{
  "caption": "El café de olla se prepara con calma, aroma y buenos ingredientes ☕✨\n\nGuarda estos 5 pasos para hacerlo en casa y cuéntanos: ¿lo prefieres con piloncillo, canela extra o un toque de clavo?\n\nTe esperamos en La Canela para compartir una taza hecha como se debe.",
  "hashtags": [
    "#CaféDeOlla",
    "#LaCanela",
    "#Cafetería",
    "#CaféMexicano",
    "#HechoEnCasa",
    "#AntojitoMexicano"
  ],
  "imagePrompt": "Primer plano de una olla de barro sobre una estufa, con agua caliente, una raja de canela, piloncillo y granos de café visibles a un costado; composición vertical que muestra el inicio de la preparación del café de olla, sin texto.",
  "network": "instagram",
  "carouselImagePrompts": [
    "Primer plano de una olla de barro sobre una estufa, con agua caliente, una raja de canela, piloncillo y granos de café visibles a un costado; composición vertical que muestra el inicio de la preparación del café de olla, sin texto.",
    "Una mano agregando trozos de piloncillo y rajas de canela al agua que hierve suavemente dentro de una olla de barro; composición vertical enfocada en los ingredientes entrando a la olla, sin texto.",
    "Una mano incorporando café molido a la olla de barro con piloncillo y canela; vapor elevándose y una cuchara de madera junto a la olla, composición vertical, sin texto.",
    "La olla de barro tapada reposando sobre la estufa mientras sale vapor por un borde; una taza de barro y canela a un lado, composición vertical, sin texto.",
    "Una persona sirviendo café de olla recién colado desde una jarra hacia una taza de barro, con una raja de canela junto a la taza; composición vertical centrada en la bebida lista para disfrutar, sin texto."
  ]
}
```

</details>

- Tokens: input 2176 / output 547 / total 2723

## tool-una-imagen (espera tool call)

> Hazme un post para Facebook anunciando que ya abrimos la terraza de mi cafetería 'La Canela' en el centro de Mérida, a partir de este sábado.

### openai:gpt-5.6-terra

Listo, preparé el borrador para Facebook anunciando la apertura de la terraza de La Canela.

- ¿Llamó la tool?: sí (1: crear_borrador_visual)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_visual</code></summary>

```json
{
  "caption": "¡Ya abrimos la terraza de La Canela! ☕🌿\n\nDesde este sábado te esperamos en el centro de Mérida para disfrutar tu café favorito, algo rico y el encanto de nuestra nueva terraza.\n\nVen a compartir la tarde con nosotros. ¡Nos vemos en La Canela!",
  "hashtags": [
    "#LaCanela",
    "#Mérida",
    "#CentroDeMérida",
    "#Cafetería",
    "#Terraza",
    "#CaféEnMérida"
  ],
  "imagePrompt": "La terraza de una cafetería llamada La Canela en el centro de Mérida, con mesas listas para recibir clientes, tazas de café servidas, plantas y detalles acogedores; composición amplia que muestre claramente el espacio exterior y el ambiente de apertura.",
  "network": "facebook",
  "carouselImagePrompts": []
}
```

</details>

- Tokens: input 1890 / output 254 / total 2144

---

## Consumo de tokens por proveedor (4 prompts)

| Modelo                 | Input | Output | Total |
| ---------------------- | ----- | ------ | ----- |
| `openai:gpt-5.6-terra` | 7999  | 1418   | 9417  |

## Veredicto (juicio humano)

| Modelo                 | Registro cultural (1-5) | Tool calling | Notas |
| ---------------------- | ----------------------- | ------------ | ----- |
| `openai:gpt-5.6-terra` |                         |              |       |

**Conclusión:**

_Pendiente de llenar por Jose tras leer el reporte._
