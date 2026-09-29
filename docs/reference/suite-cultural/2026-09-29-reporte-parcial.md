# Suite de regresión cultural — 2026-09-29

System prompt: el de producción (`apps/api/src/chat/system-prompt.ts`), sin voz de marca (`buildSystemPrompt(null)` === prompt base).
Modelos: `google:gemini-3.6-flash`.

Criterio de juicio: tuteo natural, cero voseo, modismos mexicanos bien usados,
registro cercano sin caer en caricatura. Lo que suene a "español de aeropuerto" pierde.

## marquesitas-merida

> Oye, ¿me echas la mano con ideas para mi negocio de marquesitas aquí en Mérida? Quiero subir algo esta semana pero ando seco de ideas.

### google:gemini-3.6-flash

¡Claro que sí! Con mucho gusto te echo la mano. Las marquesitas son un clásico amado en Mérida, así que el contenido visual y el "antojo" son tus mejores aliados para atraer clientes.

Aquí tienes 4 ideas sencillas pero muy efectivas para subir esta semana:

---

### 1. **ASMR del crujido (Reel o TikTok)**

- **De qué trata:** Graba en primer plano el momento exacto en que enrollas la marquesita bien caliente y la muerdes o la rompes a la mitad. El sonido crujiente es irresistible.
- **Por qué funciona:** Genera antojo inmediato y es súper fácil de grabar directamente con tu celular cerca del comal.

### 2. **Debate: ¿Queso de bola solo o combinado? (Post o Story interactiva)**

- **De qué trata:** Muestra dos fotos o un video corto: una marquesita clásica (solo queso de bola) contra una con combinación "monchosa" (Nutella, plátano y queso de bola). Pon una encuesta o pide en la descripción que voten en comentarios.
- **Por qué funciona:** A la gente en Mérida le apasiona el queso de bola y le encanta defender su combinación favorita. Eso te dará mucho alcance e interacción.

### 3. **Detrás de cámara: "El secreto de la mezcla perfecta"**

- **De qué trata:** Muestra un fragmento rápido preparando la masa o sirviendo el queso de bola recién raspado a montones. Agrega un texto en pantalla como: _"El secreto no es solo la receta, es no escatimarle al queso de bola"_.
- **Por qué funciona:** Transmite calidad, higiene y generosidad en tus ingredientes.

### 4. **"Viernes de antojo" (Post con llamados a la acción)**

- **De qué trata:** Una foto o video muy bien iluminado de la marquesita estrella de tu menú con un mensaje directo: _"¿Saliendo del trabajo/escuela? Ya tenemos el comal listo para quitarte el antojo. Te esperamos en [tu ubicación]"_.
- **Por qué funciona:** Atrapa al cliente justo en el momento en que está decidiendo qué cenar o qué postre comprar.

---

¿Cuál de estas ideas te tinca más para esta semana? Si quieres, dime para qué red social la quieres (Instagram, TikTok, Facebook, etc.) y te armo el post o el guion listo para publicar con todo y texto, hashtags y descripción de foto.

- Tokens: input 716 / output 976 / total 1692

## tool-promo-tacos (espera tool call)

> Hazme un borrador para Instagram de una promo 2x1 en tacos al pastor para este viernes en mi taquería 'El Trompo Feliz', solo en sucursal, de 6 a 11pm. Tono relajado, de barrio.

### google:gemini-3.6-flash

¡Listo! Ya quedó listo tu borrador para Instagram con todo el sabor de barrio. Aquí puedes revisar la propuesta de imagen y el texto con todos los detalles de la promo de este viernes en **El Trompo Feliz**.

- ¿Llamó la tool?: sí (1: crear_borrador_visual)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_visual</code></summary>

```json
{
  "caption": "¡Este viernes la cena va por nuestra cuenta (bueno, la mitad)! 🔥🌮\n\nEn **El Trompo Feliz** nos pusimos guapos con la banda: **2x1 en tacos al pastor** de 6:00 p.m. a 11:00 p.m.\n\nJala a tus compas, a la pareja o vente a cenar como rey para cerrar la semana con broche de oro. \n\n📌 *Ojo: La promo aplica únicamente en sucursal.* \n\n¡Caile por tu orden bien servida con su piñita, cebolla, cilantro y la salsa que sí pica! 🍍✨",
  "hashtags": [
    "#TacosAlPastor",
    "#ElTrompoFeliz",
    "#ViernesDeTacos",
    "#Promo2x1",
    "#TaqueriaDeBarrio",
    "#AmantesDelTaco",
    "#CenaDeViernes"
  ],
  "imagePrompt": "Fotografía gastronómica en plano detalle (close-up) a 45 grados de dos órdenes de tacos al pastor sobre platos tradicionales con bolsa platica. La carne se ve jugosa y bien dorada, con trozos de piña fresca, cilantro y cebolla picada encima. Al fondo se observa el brillo de la luz cálida de la taquería en la noche, limones partidos y taqueritos con salsas verde y roja. Estilo fotográfico profesional pero auténtico de taquería mexicana de barrio.",
  "network": "instagram"
}
```

</details>

- Tokens: input 2571 / output 1117 / total 3688

## tool-post-linkedin (espera tool call)

> Arma un post para LinkedIn presentando mi nuevo servicio de fotografía profesional para restaurantes en Mérida, se llama 'Lente y Sazón', tono corporativo pero cercano, con llamada a que me escriban por DM.

### google:gemini-3.6-flash

¡Listo! Ya quedó preparado el borrador para LinkedIn con el tono corporativo pero cercano que me pediste.

Puedes revisarlo en la tarjeta desplegada. Si quieres hacerle alguna modificación al texto, agregar detalles de algún paquete especial o ajustar el llamado a la acción, me dices y lo pulimos de inmediato.

- ¿Llamó la tool?: sí (1: crear_borrador_texto)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_texto</code></summary>

```json
{
  "body": "En la industria gastronómica, el primer bocado siempre entra por los ojos. 📸🍽️\n\nHoy me entusiasma presentar oficialmente Lente y Sazón, un servicio de fotografía profesional pensado exclusivamente para restaurantes, cafeterías y proyectos gastronómicos en Mérida.\n\nSabemos que detrás de cada platillo hay historia, técnica y mucha dedicación. Nuestro objetivo es traducir todo ese esfuerzo en imágenes de alta calidad que no solo antojen a tus clientes, sino que reflejen el valor real de tu concepto y refuercen la imagen de tu negocio.\n\nOfrecemos:\n• Fotografía de menú y platillos con iluminación profesional.\n• Contenido visual estratégico para redes sociales y plataformas de delivery.\n• Cobertura de ambiente, espacios y experiencia para el comensal.\n\nSi gestionas o eres dueño de un restaurante en Mérida y quieres elevar la presencia visual de tu marca, me encantaría platicar contigo.\n\n✉️ Envíame un mensaje directo (DM) y agendemos una breve llamada para conocer tu proyecto.",
  "hashtags": [
    "FotografiaGastronomica",
    "Merida",
    "RestaurantesMerida",
    "MarketingGastronomico",
    "LenteYSazon"
  ],
  "imagePrompt": "Un plato gourmet de la gastronomía yucateca contemporánea presentado impecablemente sobre una mesa de madera rústica en un restaurante iluminado con luz cálida y natural en Mérida. Fotografía profesional de alimentos con profundidad de campo reducida, enfoque nítido en los detalles del platillo y ambiente acogedor de fondo.",
  "network": "linkedin"
}
```

</details>

- Tokens: input 2530 / output 1121 / total 3651

---

## Consumo de tokens por proveedor (3 prompts)

| Modelo                    | Input | Output | Total |
| ------------------------- | ----- | ------ | ----- |
| `google:gemini-3.6-flash` | 5817  | 3214   | 9031  |

## Veredicto (juicio humano)

| Modelo                    | Registro cultural (1-5) | Tool calling | Notas |
| ------------------------- | ----------------------- | ------------ | ----- |
| `google:gemini-3.6-flash` |                         |              |       |

**Conclusión:**

_Pendiente de llenar por Jose tras leer el reporte._
