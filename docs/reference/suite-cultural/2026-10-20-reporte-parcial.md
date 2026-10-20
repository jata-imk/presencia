# Suite de regresión cultural — 2026-10-20

System prompt: el de producción (`apps/api/src/chat/system-prompt.ts`), sin voz de marca (`buildSystemPrompt(null)` === prompt base).
Modelos: `openai:gpt-6-luna@high`, `google:gemini-3.8-flash@medium`, `anthropic:claude-sonnet-5-5`.

Criterio de juicio: tuteo natural, cero voseo, modismos mexicanos bien usados,
registro cercano sin caer en caricatura. Lo que suene a "español de aeropuerto" pierde.

## adjunto-anuncio-mezcal (espera tool call)

> Te paso el anuncio de mi mezcal. Hazme el post para Instagram con lo que dice: la marca, el precio y hasta cuándo es la promo. Y usa esta misma imagen para el post.

Adjuntos: `anuncio-mezcal.png`.

### openai:gpt-6-luna@high

¡Claro! En la imagen alcanzo a leer **Mezcal Tierra Roja**, pero el precio y la fecha hasta la que aplica la promo están borrosos. ¿Me los compartes para armar el post? Para usar esta misma imagen, selecciónala desde la imagen de la publicación con **“Usar una que adjuntaste”**.

- ¿Llamó la tool?: no
- ¿Input Zod-válido?: n/a

- Tokens: input 3006 / output 191 (razonamiento 113) / total 3197
- Primer token visible: 10.7 s · total 11.4 s · costo $0.0004

### google:gemini-3.8-flash@medium

En la imagen alcanzo a leer que se trata de **Mezcal Tierra Roja** (Espadín Joven, 750 ml, hecho en Santiago Matatlán, Oaxaca), pero tanto la parte del **precio** como el texto de abajo con las **fechas de la promoción** aparecen desenfocados y no se distinguen bien.

Para no inventar datos de tu negocio, ¿me podrías confirmar:

1. ¿Cuál es el precio de la botella o de la promo?
2. ¿Hasta qué fecha es válida la promoción?

En cuanto me pases esos dos datos, te armo el borrador de Instagram de inmediato.

_(Sobre la imagen: recuerda que yo no puedo colocarla directamente en el post, pero una vez que creemos el borrador podrás seleccionarla tú mismo desde la opción **"Usar una que adjuntaste"**)._

- ¿Llamó la tool?: no
- ¿Input Zod-válido?: n/a

- Tokens: input 2537 / output 750 (razonamiento 563) / total 3287
- Primer token visible: 6.9 s · total 8.2 s · costo $0.0047

### anthropic:claude-sonnet-5-5

Ya vi el anuncio, pero el precio y el texto de la vigencia de la promo salen borrosos y no los alcanzo a leer. No quiero inventarte esos datos.

Esto sí lo leo bien:

- **Marca:** Mezcal Tierra Roja
- **Tipo:** Espadín, Joven, 750 ml
- **Origen:** Hecho en Santiago Matatlán, Oaxaca
- **Cuenta:** @tierrarojamezcal

Para armar el borrador me faltan estos datos:

1. **¿Cuál es el precio?** Dime también si es precio de promoción y cuál sería el precio normal.
2. **¿Hasta cuándo es la promo?** Necesito la fecha exacta de inicio y de fin, y si aplica "hasta agotar existencias".
3. **¿Qué tono prefieres?** Puede ser más artesanal y cálido, más premium o más directo y promocional.
4. **¿Dónde se compra?** Puede ser por DM, WhatsApp, una tienda en línea o un link de compra. Si tienes link, pásalo y lo uso tal cual.

Sobre la imagen: yo no puedo ponerla en la publicación. Cuando tengas el borrador, la agregas tú desde la imagen del post con la opción **"Usar una que adjuntaste"** y eliges este anuncio.

- ¿Llamó la tool?: no
- ¿Input Zod-válido?: n/a

- Tokens: input 4673 / output 710 (razonamiento 237) / total 5383
- Primer token visible: 3.5 s · total 7.0 s · costo $0.0164

## adjunto-csv-recortado

> Aquí van mis ventas del año. ¿Cuántas marquesitas de cajeta vendí en diciembre? Quiero presumir el cierre de año en un post.

Adjuntos: `ventas-2026.csv`.

### openai:gpt-6-luna@high

El archivo que veo solo llega hasta el 7 de agosto; no aparecen las ventas de diciembre, así que no puedo calcular cuántas marquesitas de cajeta vendiste ese mes. Vuelve a adjuntar el CSV completo y lo reviso.

¿En qué red quieres publicar el post: Instagram, Facebook, LinkedIn, Threads o X?

- Tokens: input 46504 / output 235 (razonamiento 158) / total 46739
- Primer token visible: 10.0 s · total 10.7 s · costo $0.0047

### google:gemini-3.8-flash@medium

El archivo se cortó y solo muestra información del 1 de enero al 7 de agosto de 2026, por lo que no vienen los datos de diciembre ni del cierre de año.

Por favor adjunta nuevamente el archivo completo (o el fragmento con los meses de fin de año) o compárteme el dato directo de diciembre. Con eso revisamos las cifras exactas y te ayudo a preparar el post para presumirlo.

- Tokens: input 62051 / output 437 (razonamiento 343) / total 62488
- Primer token visible: 5.1 s · total 5.8 s · costo $0.0482

### anthropic:claude-sonnet-5-5

No puedo darte esa cifra todavía. El archivo me llegó cortado: solo veo datos del 1 de enero al 7 de agosto de 2026, y la última fila está incompleta. Diciembre no aparece en lo que alcanzo a leer, y no quiero inventarte un número para tu post.

Puedes avanzar de cualquiera de estas formas:

- **Adjunta de nuevo solo diciembre.** Si filtras el archivo a esos meses, debería leerse completo.
- **Pega aquí el total de marquesitas de cajeta de diciembre**, si ya lo tienes. También puedes pegar las filas de diciembre y yo hago la suma, separada por sucursal (Centro y Montejo) si quieres.

Para dejarte el borrador listo, dime también:

1. ¿En qué red lo quieres publicar: Instagram, Facebook, Threads, LinkedIn o X?
2. ¿Qué tono prefieres: festivo, agradecido, presumido con humor?
3. ¿Quieres mencionar algo más del cierre de año, como una promo o un agradecimiento a tus clientes?

Con eso armo el post.

- Tokens: input 57236 / output 550 (razonamiento 152) / total 57786
- Primer token visible: 2.2 s · total 5.4 s · costo $0.1200

---

## Consumo de tokens por proveedor (2 prompts)

Primer token visible: mediana y peor caso. Costo: promedio por turno, con los precios de `apps/api/src/ai/model-prices.ts`.

| Modelo                           | Input | Output | Razonamiento | % razonamiento | Primer token (mediana / peor) | Costo por turno |
| -------------------------------- | ----- | ------ | ------------ | -------------- | ----------------------------- | --------------- |
| `openai:gpt-6-luna@high`         | 49510 | 426    | 271          | 64%            | 10.7 s / 10.7 s               | $0.0025         |
| `google:gemini-3.8-flash@medium` | 64588 | 1187   | 906          | 76%            | 6.9 s / 6.9 s                 | $0.0264         |
| `anthropic:claude-sonnet-5-5`    | 61909 | 1260   | 389          | 31%            | 3.5 s / 3.5 s                 | $0.0682         |

## Veredicto (juicio humano)

| Modelo                           | Registro cultural (1-5) | Tool calling | Notas |
| -------------------------------- | ----------------------- | ------------ | ----- |
| `openai:gpt-6-luna@high`         |                         |              |       |
| `google:gemini-3.8-flash@medium` |                         |              |       |
| `anthropic:claude-sonnet-5-5`    |                         |              |       |

**Conclusión:**

_Pendiente de llenar por Jose tras leer el reporte._
