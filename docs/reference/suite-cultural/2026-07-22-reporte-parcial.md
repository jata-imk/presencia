# Suite de regresión cultural — 2026-07-22

System prompt: el de producción (`apps/api/src/chat/system-prompt.ts`).
Modelos: `google:gemini-3.5-flash`, `anthropic:claude-haiku-4-5`, `deepseek:deepseek-v4-flash`.

Criterio de juicio: tuteo natural, cero voseo, modismos mexicanos bien usados,
registro cercano sin caer en caricatura. Lo que suene a "español de aeropuerto" pierde.

## tool-promo-tacos (espera tool call)

> Hazme un borrador para Instagram de una promo 2x1 en tacos al pastor para este viernes en mi taquería 'El Trompo Feliz', solo en sucursal, de 6 a 11pm. Tono relajado, de barrio.

### google:gemini-3.5-flash

¡Listo! Ya creé el borrador para tu publicación de Instagram. Quedó con ese tono relajado y de barrio que me pediste, perfecto para antojar a todos este viernes.

Ya lo tienes guardado en tu panel de Presencia para que le eches un ojo y lo publiques cuando quieras. ¡Mucho éxito con esa venta de tacos! 🌮✨

- ¿Llamó la tool?: sí (1: crear_borrador_visual)
- ¿Input Zod-válido?: sí

- Tokens: input 2004 / output 762 / total 2766

### anthropic:claude-haiku-4-5

¡Listo! 🎉 Te armé un borrador para Instagram con onda de barrio. El copy es directo, desenfadado y llama a la acción sin ser intenso.

El prompt para la imagen pide los tacos en toda su gloria (jugosos, con piña) y el ambiente de taquería clásica para que la gente sienta que está en tu lugar. El texto grande de "2x1" en la imagen va a ser lo primero que vean al scrollear.

Los hashtags están balanceados entre lo local y lo buscable, así llegas a gente que sigue marcas de comida mexicana.

¿Quieres que ajuste algo? Tipo cambiar el tono, resaltar más que es solo en sucursal, o agregar detalles diferentes.

- ¿Llamó la tool?: sí (1: crear_borrador_visual)
- ¿Input Zod-válido?: sí

- Tokens: input 3246 / output 574 / total 3820

### deepseek:deepseek-v4-flash

¡Listo, mi buen! El borrador ya está armado para Instagram. Aquí te va el resumen de lo que generé:

---

📸 **Borrador para Instagram — "El Trompo Feliz"**

**Caption:** Con tono bien relajado y de barrio, lo puse como si el taquero te estuviera hablando directo — sin tanto rollo, directo al chile:

- Anuncio del **2x1 en tacos al pastor**
- Viernes, **solo en sucursal, de 6 a 11 pm**
- Invitación casual a ir con alguien más
- Toques de humor ("no te hagas wey", "agarra a tu compa")

**🖼️ Prompt para la imagen:** Le pedí al generador una foto bien vibrante con el trompo girando, tacos servidos con piña y salsita, colores cálidos y el letrero con los detalles de la promo.

**Hashtags:** Incluí #ElTrompoFeliz, #TacosAlPastor, #2x1, #ViernesDeTacos, #Barrio, etc.

---

Si quieres cambiarle algo al tono, ajustar el horario o agregar alguna salsa especial que tengas, dímelo y lo ajustamos al toque. ¿Le entras así o le movemos? 🌮🔥

- ¿Llamó la tool?: sí (1: crear_borrador_visual)
- ¿Input Zod-válido?: sí

- Tokens: input 2663 / output 921 / total 3584

## tool-guion-cafe (espera tool call)

> Quiero un guion para TikTok mostrando cómo preparo el café de olla en mi cafetería 'La Canela', algo cortito y estilo ASMR que enganche, 20-30 segundos.

### google:gemini-3.5-flash

¡Listo! Ya creé el borrador de tu guion de TikTok con el estilo ASMR que me pediste para tu cafetería, **La Canela**.

Me enfoqué totalmente en resaltar los sonidos tan característicos de la preparación del café de olla (el agua en el barro, el piloncillo, el crujido de la canela) para lograr ese efecto satisfactorio que atrapa a la gente en los primeros segundos. También te dejé notas de grabación clave para que el audio quede impecable.

¿Qué te parece? Si quieres que le hagamos algún ajuste, dime y lo modificamos de volada.

- ¿Llamó la tool?: sí (1: crear_borrador_video)
- ¿Input Zod-válido?: sí

- Tokens: input 2620 / output 1456 / total 4076

### anthropic:claude-haiku-4-5

Voy a crear un guion ASMR para TikTok de tu cafetería. Antes de hacerlo, me gustaría confirmar algunos detalles para que sea exacto:

1. **Tono/Vibe**: ¿Quieres que sea muy relajante y minimalista (solo sonidos), o prefieres que haya una voz en off explicando brevemente?
2. **Enfoque visual**: ¿Qué momentos quieres destacar? (molienda del grano, el agua hirviendo, la olla tradicional, el aroma, el vertido final)
3. **Hook/Enganche**: ¿Algo como "El café que tus abuelos tomaban" o "30 segundos de pura magia en olla"? ¿O algo más cercano a tu marca?
4. **Call-to-action**: ¿Quieres invitar a que visiten La Canela, que prueben el café, o solo que disfruten el video?

Con estos datos armo un guion que sea cortito, visual y muy ASMR. 🎬☕

- ¿Llamó la tool?: no
- ¿Input Zod-válido?: n/a

- Tokens: input 1406 / output 279 / total 1685

### deepseek:deepseek-v4-flash

¡Suena perfecto! Un ASMR de café de olla en **La Canela** va a quedar muy bien en TikTok. 🔥

Antes de soltar el guion, ¿me ayudas con un par de detalles?

1. **Llamado a la acción**: ¿Quieres que invite a visitar la cafetería, a pedir para llevar, o solo mostrar el proceso sin CTA por ahora?
2. **Pilar o promoción**: ¿Hay algún mensaje especial que quieras transmitir (ej. "café 100% artesanal", "receta de la abuela", "esta semana 2x1 en café de olla") o que lo deje genérico?
3. **Sonido/edición**: ¿Tienes pensado algún sonido de fondo además de los ASMR (puedo sugerir uno) o lo dejamos 100% silencios y ambiente?

Con eso te armo el guion exacto de 20-30 segundos. ☕✨

- ¿Llamó la tool?: no
- ¿Input Zod-válido?: n/a

- Tokens: input 1001 / output 712 / total 1713

## tool-post-linkedin (espera tool call)

> Arma un post para LinkedIn presentando mi nuevo servicio de fotografía profesional para restaurantes en Mérida, se llama 'Lente y Sazón', tono corporativo pero cercano, con llamada a que me escriban por DM.

### google:gemini-3.5-flash

¡Listo! Ya creé el borrador de tu publicación para LinkedIn. Tiene ese balance profesional pero accesible que buscas para conectar con los restauranteros de Mérida.

¿Te gustaría que hagamos algún ajuste en el enfoque o en el llamado a la acción?

- ¿Llamó la tool?: sí (1: crear_borrador_texto)
- ¿Input Zod-válido?: sí

- Tokens: input 2015 / output 772 / total 2787

### anthropic:claude-haiku-4-5

¡Listo! 🎯

Creé tu borrador para LinkedIn con:

- **Tono corporativo pero cercano**: profesional sin perder la calidez local
- **Presentación clara** de qué es Lente y Sazón y por qué importa
- **Beneficios concretos** (sesiones a medida, edición, contenido listo)
- **CTA directo**: invitación a escribirte por DM
- **Hashtags relevantes**: mezclan fotografía, restaurantes, Mérida y emprendimiento

El post está guardado como borrador. Puedes ajustar el tono, los emojis o el mensaje antes de publicar. ¿Quieres que haga cambios o crees que necesitas contenido para otras redes también?

- ¿Llamó la tool?: sí (1: crear_borrador_texto)
- ¿Input Zod-válido?: sí

- Tokens: input 3261 / output 602 / total 3863

### deepseek:deepseek-v4-flash

Listo, el borrador quedó creado en LinkedIn. Aquí te va el detalle de lo que se armó:

---

**📝 Body del post:**

Hay una idea que me ronda desde hace meses y hoy por fin la hago oficial.

🧑‍🍳 En Mérida, la comida no solo se cocina, se hereda, se comparte y se vive. Pero hay un detalle que muchas veces pasa desapercibido: cómo se ve lo que ofreces.

Tu menú puede ser espectacular, tus sabores inolvidables y tu concepto único… pero si la foto no transmite eso, el comensal nunca va a dar el primer clic.

Por eso nace **Lente y Sazón**.

Un servicio de fotografía profesional para restaurantes en Mérida. No solo tomamos fotos, capturamos la esencia de cada platillo, el ambiente de tu local y la historia que hay detrás de tu cocina.

Trabajo con restaurantes, cocinas ocultas, bares de autor y negocios gastronómicos que quieren dejar de usar fotos de celular y empezar a proyectar la calidad real de lo que sirven.

✨ **¿Qué incluye?**

- Sesión de fotos de platillos y bebidas.
- Imágenes del espacio y el equipo.
- Edición profesional lista para menú, redes sociales y plataformas de delivery.
- Entrega en máximo 72 horas.

Si tienes un restaurante en Mérida y sientes que tu comida merece verse tan bien como sabe, mándame un DM. Sin compromiso, platicamos y te cuento cómo trabajar juntos.

📩 Escríbeme por aquí y te comparto mi portafolio.

---

**🏷️ Hashtags:**
#FotografíaGastronómica #RestaurantesMérida #LenteYSazón #MarcaRestaurantera #FoodPhotography #Mérida #EmprendimientoGastronómico

---

**💡 Tips extra para subirlo:**

- Acompaña el post con **3 fotos de muestra** de tu portafolio (platillos bien iluminados, un local, y un detrás de cámaras).
- Publica **entre martes y jueves a las 10–11 am** para mejor alcance en LinkedIn.
- Responde los primeros comentarios tú mismo para darle tracción al algoritmo.

¿Quieres que ajuste algo del tono, la extensión o el enfoque?

- ¿Llamó la tool?: sí (1: crear_borrador_texto)
- ¿Input Zod-válido?: sí

- Tokens: input 2727 / output 1263 / total 3990

---

## Consumo de tokens por proveedor (10 prompts)

| Modelo                       | Input | Output | Total |
| ---------------------------- | ----- | ------ | ----- |
| `google:gemini-3.5-flash`    | 6639  | 2990   | 9629  |
| `anthropic:claude-haiku-4-5` | 7913  | 1455   | 9368  |
| `deepseek:deepseek-v4-flash` | 6391  | 2896   | 9287  |

## Veredicto (juicio humano)

| Modelo                       | Registro cultural (1-5) | Tool calling | Notas |
| ---------------------------- | ----------------------- | ------------ | ----- |
| `google:gemini-3.5-flash`    |                         |              |       |
| `anthropic:claude-haiku-4-5` |                         |              |       |
| `deepseek:deepseek-v4-flash` |                         |              |       |

**Conclusión:**

_Pendiente de llenar por Jose tras leer el reporte._
