# Suite de regresión cultural — 2026-07-22

System prompt: el de producción (`apps/api/src/chat/system-prompt.ts`).
Modelos: `google:gemini-3.5-flash`, `anthropic:claude-haiku-4-5`, `deepseek:deepseek-v4-flash`.

Criterio de juicio: tuteo natural, cero voseo, modismos mexicanos bien usados,
registro cercano sin caer en caricatura. Lo que suene a "español de aeropuerto" pierde.

## tool-promo-tacos (espera tool call)

> Hazme un borrador para Instagram de una promo 2x1 en tacos al pastor para este viernes en mi taquería 'El Trompo Feliz', solo en sucursal, de 6 a 11pm. Tono relajado, de barrio.

### google:gemini-3.5-flash

¡Listo! Ya creé tu borrador para Instagram con todo el sabor de barrio de "El Trompo Feliz".

La publicación ya incluye el tono relajado que buscabas, los detalles de la promo de este viernes (2x1 de 6 a 11 pm solo en sucursal) y una propuesta de imagen súper antojable para captar la atención de tus clientes en el feed.

¿Te gustaría hacerle algún ajuste al texto o pasamos a planear otra red?

- ¿Llamó la tool?: sí (1: crear_borrador_visual)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_visual</code></summary>

```json
{
  "caption": "¡Este viernes se armó la buena en El Trompo Feliz! 🌮🔥\n\nPara que arranques el fin de semana como se debe, te traemos una promo de esas que no se pueden rechazar: ¡2x1 en todos tus tacos al pastor! 🤤\n\nCáele a la sucursal este viernes de 6:00 pm a 11:00 pm y déjate consentir por el mero mero sabor del barrio. Trae al compa, a la novia o a la familia, ¡aquí hay espacio para todos!\n\n⚠️ Ojo con las reglas del juego:\n- Solo aplica en sucursal (para echar el chal a gusto).\n- Válido únicamente este viernes de 6:00 pm a 11:00 pm.\n\n¿Con quién vas a venir a armar la taquiza? Etiquétalo en los comentarios 👇",
  "hashtags": [
    "TacosAlPastor",
    "ElTrompoFeliz",
    "ViernesDeTacos",
    "PromoDeTacos",
    "AntojoMexicano",
    "TacosDeBarrio"
  ],
  "imagePrompt": "A close-up, appetizing photo of two plates of authentic Mexican tacos al pastor, topped with fresh chopped cilantro, onions, pineapple, and a splash of lime. The tacos are served on traditional colorful plastic plates with a rustic wooden table background. In the background, a warm, inviting Mexican taquería atmosphere with a glowing neon sign that says 'El Trompo Feliz'. Professional food photography, vibrant colors, warm lighting.",
  "network": "instagram"
}
```

</details>

- Tokens: input 2403 / output 1187 / total 3590

### anthropic:claude-haiku-4-5

¡Listo! Te armé un borrador con ese tono relajado y de barrio que pediste.

El post incluye:

- **Gancho directo** con "¿Ey, qué onda?" para que suene natural
- **Info clara** de la promo (2x1, viernes 6-11pm, solo sucursal)
- **Lenguaje barrial** pero sin exagerar: "ándale", "hermano", "vente con los cuates"
- **Hashtags estratégicos** mezclando producto, promo, nombre del negocio y keywords populares
- **Prompt para la imagen**: tacos jugosos y apetitosos con ese vibe de taquería de barrio

El borrador está guardado. Si quieres cambiar algo del caption, los hashtags o la descripción de la imagen, me das el grito y lo ajustamos.

- ¿Llamó la tool?: sí (1: crear_borrador_visual)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_visual</code></summary>

```json
{
  "caption": "¡Ey, qué onda! 🌮 Este viernes de 6 a 11pm en El Trompo Feliz tenemos la promo que andabas esperando: TACOS AL PASTOR 2X1\n\nÁndale, aprovecha que nada más es en sucursal y solo este viernes. Que no se te pase, hermano. Vente con los cuates, la familia, quien quieras — a comerse unos tacos de verdad.\n\n#TacosAlPastor #Promo2x1 #ElTrompoFeliz #Taquería #ViernesDePromo #ViernesTornado #TacosDeBarrio #ComidaMexicana",
  "hashtags": [
    "TacosAlPastor",
    "Promo2x1",
    "ElTrompoFeliz",
    "Taquería",
    "ViernesDePromo",
    "ViernesTornado",
    "TacosDeBarrio",
    "ComidaMexicana"
  ],
  "imagePrompt": "Fotografía de tacos al pastor recién preparados, humeantes, con carne dorada y jugosa, cebolla morada y piña fresca. Fondo con ambiente de taquería de barrio cálido y acogedor. Incluir texto grande que diga \"2X1\" en rojo vibrante. Estilo informal y apetitoso.",
  "network": "instagram"
}
```

</details>

- Tokens: input 3299 / output 654 / total 3953

### deepseek:deepseek-v4-flash

¡Listo, ya quedó el borrador para Instagram! 🎉 Aquí te va el resumen de lo que armé:

---

**📱 Red:** Instagram (Post / Imagen única)

**🎨 Descripción de la imagen sugerida:**
Un primer plano bien jugoso de tacos al pastor en plato de barro, con su piña asada, cilantro y cebolla. Al fondo, el trompo con la carne dorándose y un letrero de neón rojo y verde de _"El Trompo Feliz"_. Estilo de puesto callejero pero con buena luz — pa' que se antoje hasta el que ya cenó.

**📝 Caption:**

> 📍 Este viernes, pura carnita asada y piña asada pa' bautizar el finde 🌮🔥
>
> Ven al local de El Trompo Feliz y llévate un 2x1 EN TODOS LOS TACOS AL PASTOR. Sí leíste bien… ¡DOS POR UNO! 🤯
>
> ✅ Válido exclusivamente en sucursal
> ⏰ De 6:00 PM a 11:00 PM
> 🗓️ Este viernes nomás
>
> Tráete el hambre y a tu compa de confianza porque esto se va a poner bueno. Corre la voz, porque los trompos vuelan. 🐷🔄🔥

**#️⃣ Hashtags:**
#TacosAlPastor #ElTrompoFeliz #2x1 #TacosMX #Barrio #ViernesDeTacos #PromoExclusiva #CDMX

---

Si quieres ajustar algo —más corta la letra, cambiar el horario, agregar dirección, o si el diseño lo piensas hacer con foto real del local— sólo dímelo y lo rifamos. 🔥

- ¿Llamó la tool?: sí (1: crear_borrador_visual)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_visual</code></summary>

```json
{
  "caption": "📍 Este viernes, pura carnita asada y piña asada pa' bautizar el finde 🌮🔥\n\nVen al local de El Trompo Feliz y llévate un 2x1 EN TODOS LOS TACOS AL PASTOR. Sí leíste bien… ¡DOS POR UNO! 🤯\n\n✅ Válido exclusivamente en sucursal\n⏰ De 6:00 PM a 11:00 PM\n🗓️ Este viernes nomás\n\nTráete el hambre y a tu compa de confianza porque esto se va a poner bueno. Corre la voz, porque los trompos vuelan. 🐷🔄🔥\n\n#TacosAlPastor #ElTrompoFeliz #2x1 #TacosMX #Barrio #ViernesDeTacos #PromoExclusiva #CDMX",
  "hashtags": [
    "#TacosAlPastor",
    "#ElTrompoFeliz",
    "#2x1",
    "#TacosMX",
    "#Barrio",
    "#ViernesDeTacos",
    "#PromoExclusiva",
    "#CDMX"
  ],
  "imagePrompt": "Un primer plano jugoso de tacos al pastor en un plato de barro, con piña asada, cilantro y cebolla, al fondo se ve el trompo vertical con la carne dorándose y un letrero de neón rojo y verde que dice \"El Trompo Feliz\". Estilo vibrante, como de puesto callejero pero con buena luz, que se le antoje a cualquiera.",
  "network": "instagram"
}
```

</details>

- Tokens: input 2639 / output 1021 / total 3660

## tool-guion-cafe (espera tool call)

> Quiero un guion para TikTok mostrando cómo preparo el café de olla en mi cafetería 'La Canela', algo cortito y estilo ASMR que enganche, 20-30 segundos.

### google:gemini-3.5-flash

¡Listo! Ya tienes creado el borrador de tu guion de TikTok en la plataforma.

Me enfoqué totalmente en el formato ASMR para que los sonidos del barro, el piloncillo y el café colándose sean los verdaderos protagonistas y enganchen a tu audiencia desde el primer segundo.

Puedes revisar los detalles de la grabación, el copy y los hashtags en tu sección de borradores. ¡Mucho éxito con la grabación en La Canela! Si necesitas algún cambio, solo dime.

- ¿Llamó la tool?: sí (1: crear_borrador_video)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_video</code></summary>

```json
{
  "hook": "El sonido que tu mañana necesita... Escucha cómo preparamos el café de olla perfecto en La Canela. ☕️✨",
  "script": "[0:00 - 0:05]\n(Visual: Toma cerrada de la olla de barro con agua hirviendo. Se ve una raja de canela flotando y el piloncillo disolviéndose lentamente)\n(SFX: Sonido claro de burbujeo de agua y el sutil crujido de la canela)\n\n[0:05 - 0:10]\n(Visual: Una mano vierte con delicadeza el café molido directamente en la olla)\n(SFX: El suave \"shhh\" del café al tocar el agua caliente)\n\n[0:10 - 0:15]\n(Visual: Mezclando suavemente el café con una cuchara de madera en círculos lentos)\n(SFX: El roce de la madera contra el barro de la olla)\n\n[0:15 - 0:22]\n(Visual: Vertiendo el café de olla caliente a través de un colador de tela directamente a un jarrito de barro humeante)\n(SFX: El chorro del café cayendo en el jarrito, \"glug, glug, glug\")\n\n[0:22 - 0:30]\n(Visual: El jarrito de café en la barra de La Canela con un sutil humo subiendo. Al fondo se ve el logo de la cafetería de forma estética)\n(Texto en pantalla: Te esperamos en La Canela ☕️)\n(SFX: El sonido de fondo de la cafetería, muy tenue)",
  "caption": "Sube el volumen y déjate consentir por el sonido y el aroma de nuestro café de olla tradicional. ☕️🍂 Hecho con piloncillo, canela y mucho amor en La Canela. ¿Con quién se te antoja echar el chal hoy? 👇🏽",
  "hashtags": ["cafedeolla", "asmr", "cafeteria", "lacanela", "coffeetime", "antojo"],
  "recordingNotes": "Graba en un espacio con el menor ruido de fondo posible para que destaquen los sonidos reales (puedes usar un micrófono de solapa cerca de la olla). Usa planos muy cerrados (macro) y estéticos de los ingredientes. No pongas música de fondo, o si lo haces, que sea una melodía instrumental sumamente baja.",
  "network": "tiktok"
}
```

</details>

- Tokens: input 2650 / output 1458 / total 4108

### anthropic:claude-haiku-4-5

Perfecto, voy a crear un guion ASMR para TikTok de tu café de olla en La Canela. Antes de armarlo, te pregunto dos cosas rápido:

1. **¿Qué tono quieres?** ¿Algo más relajante y meditativo, o con un poquito de energía/curiosidad que invite a probar?
2. **¿Hay algo específico en tu proceso que quieras destacar?** Por ejemplo: el moler del café, el sonido del agua caliente, la canela que se mete, el vertido final... ¿algo que te gustaría que sea el protagonista del video?

Con eso armamos un guion que suene auténtico y enganche a la primera.

- ¿Llamó la tool?: no
- ¿Input Zod-válido?: n/a

- Tokens: input 1406 / output 190 / total 1596

### deepseek:deepseek-v4-flash

¡Listo! 🎬 El guion para TikTok ya quedó armado. Aquí te va el resumen de lo que incluye:

**📝 Hook:** Arranca con sonido ambiente de cafetería y el golpe de la cuchara contra la olla — eso engancha al que se queda viendo.

**🎥 Guion (20-30 segundos):**

- **0:00** → Agua hirviendo en olla de barro (puro burbujeo)
- **0:05** → Piloncillo cayendo y derritiéndose
- **0:10** → Canela de Ceylán rompiéndose contra la olla (¡ese sonido es adictivo!)
- **0:15** → Café molido cayendo + cuchara de palo revolviendo
- **0:20** → Servir en jarrito de barro + primer sorbo
- **0:27** → Cierre con logo

**📌 Tips de grabación:**

- Usa luz cálida o natural (tono ámbar para ese vibe tradicional)
- Micrófono **pegado a la acción** — el sonido del barro, la cuchara y el burbujeo son los protagonistas
- Sin música de fondo, solo el ambiente de tu cafetería
- Subtítulos animados con el texto que menciona el guion

El borrador ya está guardado en tu cuenta de Presencia. Si quieres ajustar algo (cambiar el texto, agregar más pasos, o incluso adaptarlo a Reels de Instagram), solo dímelo. ¿Qué tal lo ves? 🤎☕

- ¿Llamó la tool?: sí (1: crear_borrador_video)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_video</code></summary>

```json
{
  "hook": "(Sonido ambiente de cafetería, el golpe suave de la cuchara contra la olla) 🎵 El ritual del café de olla que nadie te enseña. ☕🤎",
  "script": "[0:00-0:05] Toma cerrada: agua hirviendo en la olla de barro. Se escucha el burbujeo suave. Texto en pantalla: \"El secreto mejor guardado de La Canela\".\n\n[0:05-0:10] Mano agregando piloncillo. Sonido del trozo al caer. Primer plano del piloncillo derritiéndose.\n\n[0:10-0:15] Rama de canela y clavo entran en escena. El golpe seco de la rama al romperse contra el borde de la olla. Texto: \"Canela de Ceylán, nada más\".\n\n[0:15-0:20] Café molido de grano se vierte en cuchara de palo. El sonido granular del café cayendo. Revolver lentamente con la cuchara de palo contra el barro. 🎵\n\n[0:20-0:27] Toma final: servir el café en jarrito de barro, el chorro humeante. Primer sorbo (sonido de sorber). Texto: \"Todos los días en La Canela. ¿Te animas?\" \n\n[0:27-0:30] Cierre con logo de La Canela. Sonido ambiente se desvanece.",
  "caption": "Así empieza el mejor día en La Canela. Café de olla hecho como debe ser, en olla de barro, con canela de verdad y el cariño de siempre. ¿Ya lo probaste? 🤎☕ #CaféDeOlla #CafeteríaMexicana #ASMR #Café #LaCanela #CulturaCafetera #México",
  "hashtags": [
    "CaféDeOlla",
    "CafeteríaMexicana",
    "ASMR",
    "Café",
    "LaCanela",
    "CulturaCafetera",
    "México",
    "TikTokCafé",
    "CoffeeLover",
    "BaristaMX"
  ],
  "recordingNotes": "🎥 Graba con luz natural o cálida (tono ámbar). Usa micrófono externo o pegado para capturar bien los sonidos: el burbujeo, el golpe de la cuchara, el crujido de la canela al romperse, el sorbo final. Sin música de fondo, solo ambiente del local. Si quieres, agrega subtítulos animados para el texto que se muestra en pantalla. Duración ideal: 22-27 segundos.",
  "network": "tiktok"
}
```

</details>

- Tokens: input 2947 / output 1313 / total 4260

## tool-post-linkedin (espera tool call)

> Arma un post para LinkedIn presentando mi nuevo servicio de fotografía profesional para restaurantes en Mérida, se llama 'Lente y Sazón', tono corporativo pero cercano, con llamada a que me escriban por DM.

### google:gemini-3.5-flash

¡Listo! Ya creé el borrador de tu publicación para LinkedIn en el sistema. Quedó con un tono profesional, claro y muy enfocado en el valor que 'Lente y Sazón' aportará a los restaurantes de Mérida, cerrando con la invitación directa a que te escriban por mensaje privado.

Puedes revisarlo y realizar cualquier ajuste que necesites antes de publicarlo. ¡Mucho éxito con este nuevo lanzamiento!

- ¿Llamó la tool?: sí (1: crear_borrador_texto)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_texto</code></summary>

```json
{
  "body": "La primera impresión de un platillo no se saborea: entra por los ojos.\n\nEn la competitiva industria gastronómica de Mérida, destacar requiere más que un excelente menú; se necesita proyectar esa calidad desde el primer vistazo. Por eso, me emociona presentar 'Lente y Sazón', un nuevo servicio de fotografía profesional especializado en restaurantes.\n\nNuestra meta es clara: capturar las texturas, la frescura y la esencia de tu propuesta culinaria para traducirla en más reservaciones, pedidos y clientes cautivados. Ya sea para tu menú digital, plataformas de delivery o redes sociales, nos encargamos de que tu comida luzca tan espectacular como sabe.\n\nQueremos ser el aliado visual que impulse el crecimiento de tu negocio. Si estás listo para llevar la imagen de tu restaurante al siguiente nivel, hablemos. \n\n¡Escríbeme un DM y diseñemos la sesión ideal para tu menú!",
  "hashtags": [
    "FotografiaGastronomica",
    "RestaurantesMerida",
    "LenteYSazon",
    "MarketingGastronomico",
    "EmprendedoresMerida"
  ],
  "network": "linkedin"
}
```

</details>

- Tokens: input 2179 / output 972 / total 3151

### anthropic:claude-haiku-4-5

✅ **Post creado en LinkedIn**

Armé un borrador que combina:

✅ **Tono corporativo + cercano**: Profesional pero sin sonar frío; con emojis estratégicos y lenguaje que tu público entiende.

✅ **Posicionamiento claro**: Explica qué es Lente y Sazón y por qué lo necesita un restaurante.

✅ **Propuesta de valor**: Detallo el servicio sin ser genérico.

✅ **CTA directo**: "Escríbeme por DM" justo donde la gente espera.

✅ **Conexión local**: Enfatizo Mérida y la gastronomía yucateca.

El post está listo para publicar. Si quieres ajustar algo del tono, agregar más detalles del servicio o cambiar el enfoque, solo me dices.

- ¿Llamó la tool?: sí (1: crear_borrador_texto)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_texto</code></summary>

```json
{
  "body": "🍽️ Presentamos **Lente y Sazón**: Fotografía Profesional que sabe de gastronomía\n\nTu comida merece ser vista como se prepara: con pasión, cuidado y atención al detalle.\n\nEn Mérida sabemos que la gastronomía es identidad. Por eso lanzamos Lente y Sazón: un servicio de fotografía profesional diseñado específicamente para restaurantes que quieren que sus platos hablen por sí solos.\n\n**Lo que hacemos:**\n• Fotografía de alta calidad para tus platos estelares\n• Contenido visual consistente para redes y menú\n• Storytelling gastronómico que conecta con tu público\n• Equipamiento profesional + experiencia en el sector\n\nSabemos el reto: capturar esa textura, ese color, ese instante perfecto que hace que tus comensales abran el apetito antes de probar el primer bocado.\n\nSi tu restaurante necesita levantar su presencia visual o estás pensando en renovarla, **escríbeme por DM**. Hablemos de cómo podemos hacer que tu cocina brille en cada formato.\n\nSomos Mérida. Somos gastronomía. Somos Lente y Sazón.\n\n#FotografíaProfesional #Gastronomía #Restaurantes #Mérida #FotografíaGastronómica #ContentCreator #PyME",
  "hashtags": [
    "FotografíaProfesional",
    "Gastronomía",
    "Restaurantes",
    "Mérida",
    "FotografíaGastronómica",
    "ContentCreator",
    "PyME"
  ],
  "network": "linkedin"
}
```

</details>

- Tokens: input 3369 / output 731 / total 4100

### deepseek:deepseek-v4-flash

Aquí está tu borrador listo para LinkedIn 👇

---

**📝 Cuerpo del post:**

Hay algo que todo dueño de restaurante en Mérida sabe: la primera impresión no se da en el paladar, sino en la vista.

Una foto bien hecha no solo muestra un platillo, cuenta una historia, transmite una textura, provoca antojo. Y en una industria donde competimos por captar la atención en redes sociales, eso puede marcar la diferencia entre un scroll rápido y una reservación confirmada.

Por eso nace **Lente y Sazón**.

Un servicio de fotografía profesional pensado exclusivamente para restaurantes en Mérida. No hacemos fotos de comida genérica. Entendemos el concepto de tu negocio, la ambientación, los colores, la luz y, sobre todo, la esencia de cada platillo.

Trabajamos con sesiones personalizadas en tu restaurante, sin interrumpir tu operación, y te entregamos material listo para redes sociales, menú digital y sitio web.

Si eres restaurantero y quieres que tu comida se vea tan bien como sabe, **escríbeme por DM** y con gusto te cuento más. 📩

Porque en Yucatán, la sazón también se ve.

---

**🏷️ Hashtags sugeridos:**
#LenteYSazón #FotografíaDeRestaurantes #Mérida #RestaurantesMérida #MarketingGastronómico #FotografíaProfesional #Yucatán

**💡 Tip extra:** Acompaña el post con una imagen de portada poderosa —por ejemplo, un platillo bien iluminado con la estética yucateca— para que el "scroll stop" sea inmediato en LinkedIn. ¿Quieres que ajuste algo o lo afine más?

- ¿Llamó la tool?: sí (1: crear_borrador_texto)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_texto</code></summary>

```json
{
  "body": "Hay algo que todo dueño de restaurante en Mérida sabe: la primera impresión no se da en el paladar, sino en la vista.\n\nUna foto bien hecha no solo muestra un platillo, cuenta una historia, transmite una textura, provoca antojo. Y en una industria donde competimos por captar la atención en redes sociales, eso puede marcar la diferencia entre un scroll rápido y una reservación confirmada.\n\nPor eso nace Lente y Sazón.\n\nUn servicio de fotografía profesional pensado exclusivamente para restaurantes en Mérida. No hacemos fotos de comida genérica. Entendemos el concepto de tu negocio, la ambientación, los colores, la luz y, sobre todo, la esencia de cada platillo.\n\nTrabajamos con sesiones personalizadas en tu restaurante, sin interrumpir tu operación, y te entregamos material listo para redes sociales, menú digital y sitio web.\n\nSi eres restaurantero y quieres que tu comida se vea tan bien como sabe, escríbeme por DM y con gusto te cuento más. 📩\n\nPorque en Yucatán, la sazón también se ve.",
  "hashtags": [
    "LenteYSazón",
    "FotografíaDeRestaurantes",
    "Mérida",
    "RestaurantesMérida",
    "MarketingGastronómico",
    "FotografíaProfesional",
    "Yucatán"
  ],
  "network": "linkedin"
}
```

</details>

- Tokens: input 2558 / output 949 / total 3507

---

## Consumo de tokens por proveedor (10 prompts)

| Modelo                       | Input | Output | Total |
| ---------------------------- | ----- | ------ | ----- |
| `google:gemini-3.5-flash`    | 7232  | 3617   | 10849 |
| `anthropic:claude-haiku-4-5` | 8074  | 1575   | 9649  |
| `deepseek:deepseek-v4-flash` | 8144  | 3283   | 11427 |

## Veredicto (juicio humano)

| Modelo                       | Registro cultural (1-5) | Tool calling | Notas |
| ---------------------------- | ----------------------- | ------------ | ----- |
| `google:gemini-3.5-flash`    |                         |              |       |
| `anthropic:claude-haiku-4-5` |                         |              |       |
| `deepseek:deepseek-v4-flash` |                         |              |       |

**Conclusión:**

_Pendiente de llenar por Jose tras leer el reporte._
