# Suite de regresión cultural — 2026-09-30

System prompt: el de producción (`apps/api/src/chat/system-prompt.ts`), sin voz de marca (`buildSystemPrompt(null)` === prompt base).
Modelos: `google:gemini-3.6-flash`.

Criterio de juicio: tuteo natural, cero voseo, modismos mexicanos bien usados,
registro cercano sin caer en caricatura. Lo que suene a "español de aeropuerto" pierde.

## marquesitas-merida

> Oye, ¿me echas la mano con ideas para mi negocio de marquesitas aquí en Mérida? Quiero subir algo esta semana pero ando seco de ideas.

### google:gemini-3.6-flash

¡Claro que sí! Las marquesitas son una joya en Mérida y dan para muchísimo contenido antojable y divertido. Aquí tienes varias ideas divididas por tipo de contenido para que elijas la que más te lata esta semana:

---

### 1. **Video corto (Reel / TikTok) — El sonido del crujido (ASMR)**

- **Idea:** Graba de cerca todo el proceso de preparación: cómo viertes la mezcla en la plancha, el vapor subiendo, cómo raspas el queso de bola (queso holandés) bien tupido, el rollo perfecto y, al final, el mordisco o corte escuchando el crujido (_crunch_).
- **Por qué funciona:** El antojo entra por los ojos y los oídos. En Mérida la gente ama ver que no escatimen en queso de bola.

### 2. **Encuesta / Debate en historias o post visual — La combinación suprema**

- **Idea:** Haz una publicación tipo VS: **¿Queso de Bola solo / con Cajeta** vs. **Queso de Bola + Nutella / Zarzamora**?
- **Por qué funciona:** Genera mucha interacción porque los yucatecos y visitantes tienen opiniones muy firmes sobre su combinación favorita.

### 3. **Post de nostalgia o datos curiosos — ¿Sabías qué...?**

- **Idea:** Cuenta brevemente de dónde viene la marquesita (surgida en Mérida en los años 30 por Helados Polito) y cómo evolucionó a llevar queso de bola.
- **Por qué funciona:** Posiciona a tu negocio como un referente orgulloso de la tradición yucateca.

### 4. **Detrás de cámara — "El secreto está en el queso"**

- **Idea:** Muestra el rollo gigante de queso de bola que usas, cómo lo rayas al momento y la cantidad que le pones a cada marquesita.
- **Por qué funciona:** Construye confianza y resalta la calidad y generosidad de tus ingredientes.

### 5. **Post de estilo de vida local — El plan perfecto**

- **Idea:** Foto de dos marquesitas listas en su empaque con el atardecer o un parque de Mérida de fondo. Acompáñala de un texto tipo: _"El plan perfecto no exis... Salir por una marquesita calientita a estas horas"_.
- **Por qué funciona:** Conecta con el hábito cotidiano del antojo nocturno en la ciudad.

---

¿Cuál de estas ideas te gusta más? Si quieres, dime cuál te tinca y para qué red social la quieres (Instagram, TikTok, Facebook, etc.), y te armo el borrador o guion listo para publicar.

- Tokens: input 767 / output 928 / total 1695

## tool-promo-tacos (espera tool call)

> Hazme un borrador para Instagram de una promo 2x1 en tacos al pastor para este viernes en mi taquería 'El Trompo Feliz', solo en sucursal, de 6 a 11pm. Tono relajado, de barrio.

### google:gemini-3.6-flash

¡Listo! Ya quedó creado el borrador para Instagram de la promo 2x1 en tacos al pastor de **El Trompo Feliz**.

Puedes revisarlo en el panel de borradores, ajustar cualquier detalle si lo necesitas y programarlo cuando gustes. ¡Éxito con la taquiza del viernes! 🌮🔥

- ¿Llamó la tool?: sí (1: crear_borrador_visual)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_visual</code></summary>

```json
{
  "caption": "¡Este viernes se cena como reyes en El Trompo Feliz! 🌮🔥\n\nTraemos la mera buena para arrancar el fin de semana: ¡2x1 EN TACOS AL PASTOR! 🤤\n\nJálate con la pareja, el compa o la familia y déjate querer con su piñita, su cilantro, su cebollita y sus buenas salsas recién hechas.\n\n📍 Exclusivo en sucursal\n📅 Este viernes\n⏰ De 6:00 pm a 11:00 pm\n\n¡No te te vayas a quedar con el antojo, allá nos vemos! 🙌",
  "hashtags": [
    "ElTrompoFeliz",
    "TacosAlPastor",
    "Promo2x1",
    "ViernesDeTacos",
    "TacosExquisitos",
    "AmantesDelTaco"
  ],
  "imagePrompt": "Dos tacos al pastor bien servidos con piña, cilantro y cebolla picada sobre un plato metálico con papel estraza, colocado en una mesa de taquería con frascos de salsa verde y roja al lado.",
  "network": "instagram"
}
```

</details>

- Tokens: input 2644 / output 1089 / total 3733

## tool-guion-cafe (espera tool call)

> Quiero un guion para TikTok mostrando cómo preparo el café de olla en mi cafetería 'La Canela', algo cortito y estilo ASMR que enganche, 20-30 segundos.

### google:gemini-3.6-flash

¡Listo! Ya quedó preparado el borrador de tu guion estilo ASMR para TikTok.

Te dejé un gancho enfocado en el sonido de la canela rompiéndose, la estructura segundo a segundo con énfasis en los sonidos característicos del café de olla (piloncillo, hervor, jarro de barro) y notas de grabación para lograr el efecto ASMR perfecto.

Puedes revisarlo y editarlo directo en tu panel de Presencia.

- ¿Llamó la tool?: sí (1: crear_borrador_video)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_video</code></summary>

```json
{
  "hook": "[Sonido seco de la varita de canela rompiéndose cerca del micrófono] ¿Escuchaste eso? Es el inicio de tu café favorito.",
  "script": "[0:00 - 0:03] (Hook)\nTexto en pantalla: \"Café de olla en La Canela ☕✨\"\nVisual: Mano rompiendo una raja de canela sobre una olla de barro.\nAudio: Crunch seco y nítido de la canela.\n\n[0:03 - 0:08]\nVisual: Caída de pedazos de piloncillo rompiéndose y cayendo al fondo de la olla de barro.\nAudio: Golpes huecos del piloncillo contra el barro.\n\n[0:08 - 0:14]\nVisual: Agua hirviendo burbujeando con la canela y el piloncillo.\nAudio: Borbotón suave del agua hirviendo.\n\n[0:14 - 0:20]\nVisual: Una cucharada grande de café molido cayendo suavemente en el agua aromática.\nAudio: Siseo leve y el tintineo de la cuchara de madera al mezclar despacio.\n\n[0:20 - 0:26]\nVisual: Servido del café bien caliente vertiéndose desde la olla de barro a un jarrito de barro tradicional. Sale vapor.\nAudio: Sonido continuo del líquido cayendo en el jarrito.\n\n[0:26 - 0:30]\nVisual: Toma final del jarrito humeante con la cafetería de fondo.\nTexto en pantalla: \"Ven por el tuyo a La Canela 🍂\"\nAudio (Voz en susurro suave): \"Te esperamos en La Canela.\"",
  "caption": "El secreto de nuestro café de olla está en el amor... y en los sonidos. ☕✨ ¿Ya probaste el tuyo en La Canela? Te esperamos. ❤️",
  "hashtags": [
    "CafeDeOlla",
    "CafeteriaLaCanela",
    "ASMRCafe",
    "CoffeeTok",
    "CafeMexicano",
    "ASMRFood"
  ],
  "recordingNotes": "Graba muy cerca de la fuente de sonido (macro) usando un micrófono lavalier o pegando el teléfono. Mantén los movimientos suaves y el tono visual cálido. Sin música de fondo, solo los sonidos reales del proceso.",
  "network": "tiktok"
}
```

</details>

- Tokens: input 2509 / output 1028 / total 3537

## tool-post-linkedin (espera tool call)

> Arma un post para LinkedIn presentando mi nuevo servicio de fotografía profesional para restaurantes en Mérida, se llama 'Lente y Sazón', tono corporativo pero cercano, con llamada a que me escriban por DM.

### google:gemini-3.6-flash

¡Listo! Ya creé el borrador de tu publicación para LinkedIn.

Puedes revisarlo y editarlo desde tu panel en Presencia. Si quieres hacerle algún ajuste a la redacción o agregar algún detalle específico de una promoción de lanzamiento, solo avísame.

- ¿Llamó la tool?: sí (1: crear_borrador_texto)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_texto</code></summary>

```json
{
  "body": "¿Sabías que más del 70% de las personas deciden qué comer a través de la vista antes de revisar las reseñas o el menú?\n\nEn un mercado tan competitivo y rico como el de Mérida, la imagen de tu restaurante es literalmente el primer bocado que le das a tus clientes.\n\nPor eso nace **Lente y Sazón**: un servicio de fotografía profesional diseñado específicamente para la industria gastronómica local. \n\nNos enfocamos en capturar la esencia de tus platillos, la calidez de tus espacios y la pasión de tu equipo, transformando tu menú en una experiencia visual irresistible para tus comensales y fortaleciendo el posicionamiento de tu marca.\n\nYa sea que busques renovar tu carta, destacar en apps de delivery o proyectar una presencia impecable en redes sociales y medios digitales, tenemos un plan a la medida de tu restaurante.\n\n📩 ¿Quieres llevar la imagen de tu marca al siguiente nivel? Envíame un mensaje directo y platiquemos sobre cómo podemos colaborar.",
  "hashtags": [
    "#FotografiaGastronomica",
    "#RestaurantesMerida",
    "#LenteYSazon",
    "#MarketingGastronomico",
    "#MeridaYucatan",
    "#GastronomiaMexicana"
  ],
  "imagePrompt": "Un fotógrafo profesional trabajando dentro del comedor de un restaurante moderno en Mérida, ajustando su cámara sobre un trípode para fotografiar un platillo gourmet bellamente montado sobre una mesa de madera.",
  "network": "linkedin"
}
```

</details>

- Tokens: input 2297 / output 765 / total 3062

---

## Consumo de tokens por proveedor (4 prompts)

| Modelo                    | Input | Output | Total |
| ------------------------- | ----- | ------ | ----- |
| `google:gemini-3.6-flash` | 8217  | 3810   | 12027 |

## Veredicto (juicio humano)

| Modelo                    | Registro cultural (1-5) | Tool calling | Notas |
| ------------------------- | ----------------------- | ------------ | ----- |
| `google:gemini-3.6-flash` |                         |              |       |

**Conclusión:**

_Pendiente de llenar por Jose tras leer el reporte._
