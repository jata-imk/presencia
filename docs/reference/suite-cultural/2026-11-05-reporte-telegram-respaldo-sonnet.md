# Suite de regresión cultural — 2026-11-05

Los casos `telegram-*` llevan además el apéndice del canal (`channelInstruction`), antes de la fecha, como en producción.
System prompt: el de producción (`apps/api/src/chat/system-prompt.ts`), con "hoy" fijo en 2026-10-28 (`today.ts`), sin voz de marca (`buildSystemPrompt(null)` === prompt base).
Modelos: `cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5`.
Modo cadena (F10.11): cada corrida pasa por la cadena del chat con su respaldo; caída fingida: `openai,google`.
Corridas por caso: 3.

Criterio de juicio: tuteo natural, cero voseo, modismos mexicanos bien usados,
registro cercano sin caer en caricatura. Lo que suene a "español de aeropuerto" pierde.

## telegram-voz-ideas (Telegram)

> este… eh… ayer en el gym se me ocurrió que podría hacer contenido de, o sea, de las tres cosas que aprendí en mi primer año como freelance de diseño, ¿no? eh… dame tres ideas así concretas para desarrollarlo

### cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5

#### Corrida 1 — respondió `anthropic:claude-sonnet-5-5`

¡Buena idea! Aquí van tres formatos concretos:

1. **Carrusel "3 cosas que aprendí en mi primer año como freelance de diseño"**
   - Portada con el gancho.
   - Un slide por lección, con una frase corta y un ejemplo real.
   - Cierre con pregunta: "¿Cuál te hubiera gustado saber antes?"

2. **Video corto "Lo que le diría a mi yo de hace un año"**
   - Hablas a cámara, o en voz en off con imágenes de tu trabajo.
   - Cada lección dura 10 segundos, con una anécdota que la ilustre, como un cliente difícil, un error de cobro o un proyecto que salió mal.

3. **Post de texto tipo historia (LinkedIn o Threads)**
   - Empiezas con el momento más duro del año.
   - Cuentas cómo cada lección salió de ahí.
   - Terminas con un consejo para quien apenas empieza.

Para que no quede genérico, cuéntame cuáles son tus tres lecciones, aunque sea a grandes rasgos. Con eso te armo el borrador en la red que prefieras. ¿Cuál formato te late más?

- Tokens: input 4410 / output 479 (razonamiento 65) / total 4889
- Primer token visible: 3.6 s · total 6.8 s · costo $0.0136

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

#### Corrida 2 — respondió `anthropic:claude-sonnet-5-5`

¡Qué buen tema! Tres formas concretas de desarrollarlo:

1. **Carrusel "3 cosas que aprendí en mi primer año como freelance de diseño"** (Instagram o LinkedIn). La portada es la promesa, un slide por lección y el último cierra con una pregunta: _¿cuál te ha pasado a ti?_

2. **Video corto con un error real por lección** (TikTok o Reels). Empiezas con algo como: "Mi primer cliente me pidió X y yo hice Y…". Cuentas la anécdota en 15 segundos y cierras con lo que aprendiste. Cada lección puede ser un video aparte, así sacas tres piezas de un solo tema.

3. **Post de texto tipo historia personal** (LinkedIn o Threads). Abres con un momento concreto del año, como un pago que no llegó, un cliente difícil o una cotización que bajaste de más. De ahí sacas las tres lecciones en lista corta y cierras con un consejo para quien apenas empieza.

Si quieres que alguna quede lista como borrador, dime:

- ¿Cuáles son tus tres lecciones?
- ¿Para qué red la quieres?
- ¿Con qué tono? (cercano, serio, con humor)

- Tokens: input 4410 / output 512 (razonamiento 77) / total 4922
- Primer token visible: 3.7 s · total 7.2 s · costo $0.0139

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

#### Corrida 3 — respondió `anthropic:claude-sonnet-5-5`

¡Buen tema! Tres formas de desarrollarlo:

**1. Carrusel: "3 cosas que aprendí en mi primer año de freelance"**

- Portada con gancho tipo: "Lo que nadie me dijo al empezar".
- Una lección por slide, con una anécdota corta de cada una.
- Cierre con pregunta: "¿Cuál habrías agregado tú?"

**2. Video corto: "Lo que haría distinto"**

- Empiezas con tu mayor error del primer año (por ejemplo, cobrar de menos o no pedir anticipo, si te pasó).
- Luego dices qué aprendiste y qué haces ahora.
- Las otras dos lecciones van en 15 a 20 segundos cada una.

**3. Antes y después**

- Cada lección en dos partes: "Yo pensaba…" y "Ahora sé que…".
- Funciona en carrusel o en video, y se presta a que la gente comente su propia experiencia.

Para que no suene genérico, cuéntame cuáles son tus tres lecciones, aunque sea a grandes rasgos. Con eso te armo el borrador listo. ¿En qué red lo quieres publicar?

- Tokens: input 4410 / output 473 (razonamiento 61) / total 4883
- Primer token visible: 3.6 s · total 7.1 s · costo $0.0135

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

## telegram-post-linkedin (Telegram) (espera tool call)

> me gusta la segunda, hazme un post de LinkedIn

### cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5

#### Corrida 1 — respondió `anthropic:claude-sonnet-5-5`

Va. Para que no suene genérico y no invente nada de tu historia, cuéntame rápido (puedes mandar nota de voz):

1. **¿Qué pasó con ese cliente?** Por ejemplo: cambios sin fin, pagos tardados o mensajes a deshoras.
2. **¿Qué límites pones ahora?** Por ejemplo: rondas de revisión, anticipo o contrato.
3. **¿Cómo quieres que suene?** Personal y vulnerable, o más práctico, con consejos.

Con eso te armo el borrador.

- ¿Llamó la tool?: no
- ¿Input Zod-válido?: n/a

- Tokens: input 4511 / output 308 (razonamiento 113) / total 4819
- Primer token visible: 10.9 s · total 12.5 s · costo $0.0121

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: debía crearla ❌ · voseo: no ✅

#### Corrida 2 — respondió `anthropic:claude-sonnet-5-5`

Va. Para que no invente nada de tu historia, cuéntame rápido (puedes mandar nota de voz):

1. ¿Qué pasó con ese cliente? (cambios sin fin, pagos tarde, mensajes a deshoras…)
2. ¿Qué límites pusiste después? (contrato, rondas de revisión, anticipo, horarios…)
3. ¿Qué tono quieres: reflexivo, con humor o directo?

Con eso te armo el borrador.

- ¿Llamó la tool?: no
- ¿Input Zod-válido?: n/a

- Tokens: input 4511 / output 257 (razonamiento 90) / total 4768
- Primer token visible: 10.8 s · total 12.1 s · costo $0.0116

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: debía crearla ❌ · voseo: no ✅

#### Corrida 3 — respondió `anthropic:claude-sonnet-5-5`

Para que el post suene a ti y no invente nada, respóndeme esto (puede ser por nota de voz):

1. ¿Qué pasó con ese cliente? (por ejemplo: cambios sin fin, pagos tarde, mensajes a todas horas)
2. ¿Qué límite pusiste después, o qué harías distinto desde el primer correo?
3. ¿Qué tono quieres: reflexivo, con humor o directo?

Con eso te armo el borrador.

- ¿Llamó la tool?: no
- ¿Input Zod-válido?: n/a

- Tokens: input 4511 / output 253 (razonamiento 89) / total 4764
- Primer token visible: 10.8 s · total 12.4 s · costo $0.0116

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: debía crearla ❌ · voseo: no ✅

## telegram-tabla (Telegram)

> compárame 5 cafeterías buenas para trabajar en Mérida: precio del americano, horario, si tienen wifi y si hay estacionamiento

### cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5

#### Corrida 1 — respondió `anthropic:claude-sonnet-5-5`

No pude armarte la comparación. Las búsquedas en la web no trajeron resultados y ya llegué al límite de intentos en este mensaje. No quiero inventarte precios, horarios ni datos de wifi o estacionamiento, porque cambian seguido.

Puedes hacer una de estas dos cosas:

- **Mándame otro mensaje** y vuelvo a buscar con otras palabras. Por ejemplo: "cafeterías en Mérida Norte con wifi".
- **Dame 5 nombres** de cafeterías que ya tengas en mente, o pega enlaces de sus páginas. Con eso busco o leo los datos de cada una y te armo la tabla.

Si te sirve, dime también en qué zona trabajas (Centro, Norte, García Ginerés…). Así filtro mejor las opciones.

<details><summary>Búsqueda — <code>buscar_en_web</code></summary>

```json
{
  "consulta": "mejores cafeterías para trabajar con wifi en Mérida Yucatán"
}
```

</details>

<details><summary>Búsqueda — <code>buscar_en_web</code></summary>

```json
{
  "consulta": "cafeterías para trabajar en Mérida estacionamiento horario menú precios"
}
```

</details>

<details><summary>Búsqueda — <code>buscar_en_web</code></summary>

```json
{
  "consulta": "cafés para trabajar Mérida"
}
```

</details>

- Tokens: input 14065 / output 538 (razonamiento 34) / total 14603
- Primer token visible: 9.1 s · total 9.1 s · costo $0.0335

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

#### Corrida 2 — respondió `anthropic:claude-sonnet-5-5`

No pude armarte la comparación. Mis dos búsquedas no trajeron resultados, y no quiero inventarte precios, horarios ni si tienen wifi o estacionamiento, porque esos datos cambian seguido.

Puedo hacer esto:

- **Buscar otra vez en otro mensaje.** Dime si te late una zona (Centro, Norte, García Ginerés, Altabrisa) y lo intento con otras palabras.
- **Armarla con tus opciones.** Si ya tienes 5 cafeterías en mente, pásame los nombres y busco los datos de cada una.
- **Hacerte una lista de qué revisar.** Es una guía para que compares tú mismo: enchufes, ruido, horario de la tarde, límite de tiempo en mesa, etc.

¿Cuál prefieres?

<details><summary>Búsqueda — <code>buscar_en_web</code></summary>

```json
{
  "consulta": "mejores cafeterías para trabajar en Mérida Yucatán wifi"
}
```

</details>

<details><summary>Búsqueda — <code>buscar_en_web</code></summary>

```json
{
  "consulta": "cafeterías con estacionamiento y wifi para trabajar en Mérida horario"
}
```

</details>

<details><summary>Búsqueda — <code>buscar_en_web</code></summary>

```json
{
  "consulta": "cafeterías para trabajar Mérida"
}
```

</details>

- Tokens: input 14122 / output 580 (razonamiento 75) / total 14702
- Primer token visible: 9.1 s · total 9.1 s · costo $0.0340

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

#### Corrida 3 — respondió `anthropic:claude-sonnet-5-5`

No pude armarte la comparación. Las búsquedas en la web no trajeron resultados y ya llegué al límite de intentos en este mensaje.

No voy a inventar precios, horarios ni si tienen wifi o estacionamiento. Son datos que cambian y no quiero que llegues a un lugar y no sea así.

Puedo hacer una de estas:

- **Buscar otra vez en tu siguiente mensaje**, con otras palabras o por zona (Centro, Norte, García Ginerés).
- **Armar la comparación con tus datos.** Dime 5 cafeterías que ya conozcas y busco el detalle de cada una.
- **Si tienes enlaces** de sus páginas o del menú, pégalos y los reviso.

¿Cuál prefieres?

<details><summary>Búsqueda — <code>buscar_en_web</code></summary>

```json
{
  "consulta": "mejores cafeterías para trabajar en Mérida Yucatán wifi"
}
```

</details>

<details><summary>Búsqueda — <code>buscar_en_web</code></summary>

```json
{
  "consulta": "cafeterías con wifi y estacionamiento Mérida Yucatán para home office"
}
```

</details>

<details><summary>Búsqueda — <code>buscar_en_web</code></summary>

```json
{
  "consulta": "cafeterías para trabajar Mérida"
}
```

</details>

- Tokens: input 14077 / output 526 (razonamiento 38) / total 14603
- Primer token visible: 9.0 s · total 9.0 s · costo $0.0334

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

## telegram-enlace (Telegram) (espera leer el enlace)

> léete esto y dime de qué va, para sacar un post: https://www.diariodeyucatan.com/merida/2026/10/05/la-marquesita-cumple-80-anos

### cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5

#### Corrida 1 — respondió `anthropic:claude-sonnet-5-5`

**De qué va la nota (Diario de Yucatán, 5 de octubre de 2026):**

- La marquesita cumple 80 años en Mérida. Nació en 1945, cuando don Ernesto Pérez Novelo vendía barquillos enrollados en un carrito del parque de Santa Ana.
- Según la familia, el nombre viene de las marquesas de la colonia Itzimná, que se lo pedían por las tardes.
- Hoy hay más de 300 carritos en la ciudad.
- La clásica lleva queso de bola rallado y cuesta entre 40 y 55 pesos. Las de Nutella y cajeta son las favoritas de los jóvenes.
- El Ayuntamiento prepara una **feria de la marquesita el 8 de noviembre, de 6 a 10 pm**, en el parque de Santa Ana, con concurso de carritos.

**Ojo:** si nació en 1945, los 80 años se cumplieron en 2025, no en 2026. Conviene no repetir el "80 años" como si fuera exacto, o verificarlo antes de publicar.

Para armar el post, dime:

1. ¿En qué red lo quieres: Instagram, Facebook, TikTok, LinkedIn…?
2. ¿Qué enfoque prefieres? Por ejemplo la historia del origen, invitar a la feria del 8 de noviembre, o algo tuyo, como tu carrito o tu negocio.
3. ¿Qué tono quieres: nostálgico, divertido o informativo?

- ¿Leyó el enlace?: sí (1) — debía leerlo ✅

<details><summary>Lectura — <code>leer_enlace</code></summary>

```json
{
  "url": "https://www.diariodeyucatan.com/merida/2026/10/05/la-marquesita-cumple-80-anos"
}
```

</details>

- Tokens: input 9207 / output 729 (razonamiento 116) / total 9936
- Primer token visible: 8.1 s · total 8.1 s · costo $0.0257

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

#### Corrida 2 — respondió `anthropic:claude-sonnet-5-5`

**De qué va la nota (Diario de Yucatán, 5 de octubre de 2026):**

- La marquesita cumple **80 años**. Nació en 1945, cuando don Ernesto Pérez Novelo vendía barquillos enrollados en un carrito del parque de Santa Ana.
- Según la familia, el nombre viene de las marquesas de la colonia Itzimná, que se lo pedían por las tardes.
- Hoy hay más de **300 carritos** en Mérida.
- La clásica lleva queso de bola y cuesta **entre 40 y 55 pesos**. Las de Nutella y cajeta son las favoritas de los jóvenes.
- El Ayuntamiento prepara una **feria de la marquesita** el **8 de noviembre**, de 6 a 10 pm, en el parque de Santa Ana, con concurso de carritos.

**Ojo con un detalle:** la nota es de 2026, pero 1945 + 80 años da 2025. La nota no dice el año de la feria. Yo no afirmaría el aniversario como "este año" ni la fecha de la feria sin confirmarlos. Puedo buscar si hay una fuente más clara.

Para armarte el post necesito saber:

1. ¿En qué red lo quieres (Instagram, Facebook, TikTok, etc.)?
2. ¿Qué ángulo? Por ejemplo historia y nostalgia, invitar a la feria, o promocionar tu negocio.
3. ¿Tienes algo que ver con las marquesitas, o es contenido de la ciudad?

- ¿Leyó el enlace?: sí (1) — debía leerlo ✅

<details><summary>Lectura — <code>leer_enlace</code></summary>

```json
{
  "url": "https://www.diariodeyucatan.com/merida/2026/10/05/la-marquesita-cumple-80-anos"
}
```

</details>

- Tokens: input 9207 / output 791 (razonamiento 164) / total 9998
- Primer token visible: 8.7 s · total 8.7 s · costo $0.0263

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

#### Corrida 3 — respondió `anthropic:claude-sonnet-5-5`

**De qué va la nota** ([Diario de Yucatán](https://www.diariodeyucatan.com/merida/2026/10/05/la-marquesita-cumple-80-anos)):

- La marquesita cumple 80 años en Mérida.
- Nació en 1945, cuando don Ernesto Pérez Novelo vendía barquillos enrollados en un carrito del parque de Santa Ana.
- Según la familia, el nombre viene de las marquesas de la colonia Itzimná, que se lo pedían por las tardes.
- Hoy hay más de 300 carritos en la ciudad.
- La clásica lleva queso de bola y cuesta entre 40 y 55 pesos. Las de Nutella y cajeta son las favoritas de los jóvenes.
- El Ayuntamiento prepara una **feria de la marquesita el 8 de noviembre, de 6 a 10 pm**, en el parque de Santa Ana, con concurso de carritos.

**Ojo con un dato:** si nació en 1945, los 80 años se cumplieron en 2025, pero la nota es de octubre de 2026. La nota no dice el año de la feria. Por la fecha de publicación, parece ser este 8 de noviembre, pero conviene confirmarlo antes de publicar. Yo evitaría poner "80 años" como cifra exacta si no lo verificas.

**Ángulos posibles:**

- Historia y origen del nombre.
- Invitación a la feria.
- Tu marquesita favorita: clásica o con Nutella o cajeta.

¿Para qué red lo quieres y con qué ángulo? Si es para tu negocio, cuéntame qué vendes o qué quieres promover.

- ¿Leyó el enlace?: sí (1) — debía leerlo ✅

<details><summary>Lectura — <code>leer_enlace</code></summary>

```json
{
  "url": "https://www.diariodeyucatan.com/merida/2026/10/05/la-marquesita-cumple-80-anos"
}
```

</details>

- Tokens: input 9207 / output 803 (razonamiento 132) / total 10010
- Primer token visible: 8.8 s · total 8.9 s · costo $0.0264

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

## telegram-busqueda (Telegram) (espera buscar en la web)

> ¿cuánto cuesta hoy la entrada al Gran Museo del Mundo Maya? lo quiero poner en un post

### cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5

#### Corrida 1 — respondió `anthropic:claude-sonnet-5-5`

Hoy, miércoles 28 de octubre, la entrada al Gran Museo del Mundo Maya cuesta esto:

- **Entrada general:** $250 pesos
- **Residentes de Yucatán con INE:** $100 pesos
- **Horario:** de miércoles a lunes, de 8 a 17 h. Los martes cierra.
- **Luz y sonido:** gratis, según el Diario de Yucatán.

Fuentes: [sitio oficial del museo](https://www.granmuseodelmundomaya.com.mx/visita) (1 de oct.) y [Diario de Yucatán](https://www.diariodeyucatan.com/merida/2026/10/12/museos-precios) (12 de oct.). Las dos coinciden en los $250.

Para armarte el post necesito saber:

1. ¿En qué red lo quieres: Instagram, Facebook, TikTok, etc.?
2. ¿Qué enfoque tiene: una guía para visitar, una recomendación o una promo tuya?
3. ¿Qué tono prefieres: cercano, informativo o divertido?

- ¿Buscó en la web?: sí (1) — debía buscar ✅
- ¿Citó una fuente que devolvió la web?: sí ✅

<details><summary>Búsqueda — <code>buscar_en_web</code></summary>

```json
{
  "consulta": "precio entrada Gran Museo del Mundo Maya Mérida 2026"
}
```

</details>

- Tokens: input 9132 / output 504 (razonamiento 48) / total 9636
- Primer token visible: 6.6 s · total 6.6 s · costo $0.0233

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

#### Corrida 2 — respondió `anthropic:claude-sonnet-5-5`

La entrada general al Gran Museo del Mundo Maya cuesta **$250 MXN**, según su [sitio oficial](https://www.granmuseodelmundomaya.com.mx/visita), actualizado el 1 de octubre de 2026.

- Residentes de Yucatán con INE pagan **$100**.
- Abre de miércoles a lunes, de 8 a 17 h. Los martes cierra.
- El espectáculo de luz y sonido sigue siendo gratuito, según [Diario de Yucatán](https://www.diariodeyucatan.com/merida/2026/10/12/museos-precios), nota del 12 de octubre.

Hoy es miércoles, así que está abierto. Los precios pueden cambiar, así que confírmalos antes de publicar.

¿Para qué red quieres el post (Instagram, Facebook, TikTok…) y con qué tono? ¿Hay algo más que quieras destacar, como una visita tuya o un tip?

- ¿Buscó en la web?: sí (1) — debía buscar ✅
- ¿Citó una fuente que devolvió la web?: sí ✅

<details><summary>Búsqueda — <code>buscar_en_web</code></summary>

```json
{
  "consulta": "precio entrada Gran Museo del Mundo Maya Mérida 2026"
}
```

</details>

- Tokens: input 9132 / output 456 (razonamiento 46) / total 9588
- Primer token visible: 6.4 s · total 6.4 s · costo $0.0228

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

#### Corrida 3 — respondió `anthropic:claude-sonnet-5-5`

Según el sitio oficial, la entrada al Gran Museo del Mundo Maya cuesta esto:

- **Entrada general:** $250 MXN
- **Residentes de Yucatán (con INE):** $100 MXN
- **Horario:** de miércoles a lunes, de 8 a 17 h. Los martes cierra.

Fuentes: [Sitio oficial del museo](https://www.granmuseodelmundomaya.com.mx/visita) (1 de octubre de 2026) y [Diario de Yucatán](https://www.diariodeyucatan.com/merida/2026/10/12/museos-precios) (12 de octubre de 2026). Este último confirma los $250 y dice que el espectáculo de luz y sonido sigue siendo gratuito.

Los datos son de este mes, pero conviene que confirmes el precio en el sitio antes de publicar.

Para armarte el post necesito saber:

1. ¿En qué red lo quieres: Instagram, Facebook, TikTok u otra?
2. ¿Con qué tono? Por ejemplo, informativo, divertido o de recomendación personal.
3. ¿Quieres contar algo en particular, como tu visita, tips o una promo?

- ¿Buscó en la web?: sí (1) — debía buscar ✅
- ¿Citó una fuente que devolvió la web?: sí ✅

<details><summary>Búsqueda — <code>buscar_en_web</code></summary>

```json
{
  "consulta": "precio entrada Gran Museo del Mundo Maya Mérida 2026"
}
```

</details>

- Tokens: input 9132 / output 541 (razonamiento 48) / total 9673
- Primer token visible: 6.9 s · total 7.0 s · costo $0.0237

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

## telegram-nombre-raro (Telegram)

> hazme un post de instagram para la hacienda ishcanatun, este, donde hicimos la sesión de fotos el sábado, quedó bien bonita

### cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5

#### Corrida 1 — respondió `anthropic:claude-sonnet-5-5`

¡Qué padre! Para armarte el borrador necesito unos datos:

1. **Nombre del lugar:** ¿se escribe «Ishcanatun» o es _Xcanatún_, la hacienda de Yucatán?
2. **Tu rol:** ¿eres el fotógrafo, la modelo o la marca? ¿Fue sesión de boda, XV años, retrato o producto?
3. **Tono:** ¿cálido y elegante, casual o más emotivo?
4. **¿Quieres mencionar** a alguien (cliente, maquillista, la hacienda) o poner alguna invitación al final, como «reserva tu sesión»?
5. **¿Una imagen o carrusel?** Si es carrusel, cuéntame qué se ve en las fotos: arcos, jardín, vestuario, etc.

Con eso te lo dejo listo.

- Tokens: input 4373 / output 451 (razonamiento 154) / total 4824
- Primer token visible: 4.0 s · total 6.6 s · costo $0.0133

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

#### Corrida 2 — respondió `anthropic:claude-sonnet-5-5`

¡Qué padre! Antes de armarlo, necesito unos datos:

1. **Nombre:** ¿es _Xcanatún_ (la hacienda cerca de Mérida) o se escribe distinto?
2. **Tu rol:** ¿eres el fotógrafo, la marca, o la modelo o el cliente de la sesión?
3. **Tipo de sesión:** ¿boda, XV años, retratos, una marca o algo más?
4. **Tono:** ¿elegante, cálido, divertido?
5. **Llamada a la acción:** ¿quieres invitar a reservar sesiones, o solo presumir las fotos?

Con eso te hago el borrador. Si quieres un carrusel, dime y lo armo así.

- Tokens: input 4373 / output 452 (razonamiento 199) / total 4825
- Primer token visible: 5.3 s · total 7.4 s · costo $0.0133

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

#### Corrida 3 — respondió `anthropic:claude-sonnet-5-5`

¡Qué bien que quedó bonita la sesión! Para armarte el post sin inventar nada, dime:

1. **¿Cómo se escribe el nombre de la hacienda?** Me suena a _Xcanatún_, pero no quiero adivinar.
2. **¿Qué fue la sesión?** Por ejemplo, de boda, de moda, de marca o de retratos. Dime también si eres el fotógrafo, el cliente o la marca.
3. **¿Qué tono quieres?** Puede ser cálido, elegante o relajado.
4. **¿Quieres incluir algo más?** Por ejemplo, créditos, una promo, un link o una invitación a reservar.

Con eso te lo dejo listo. Si quieres que sea carrusel, dime y lo armo así.

- Tokens: input 4373 / output 458 (razonamiento 187) / total 4831
- Primer token visible: 4.8 s · total 7.1 s · costo $0.0133

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

## telegram-botones-web (Telegram)

> oye y ¿cómo le pongo una imagen al post que me hiciste?

### cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5

#### Corrida 1 — respondió `anthropic:claude-sonnet-5-5`

Eso se hace en la web, no desde Telegram.

1. Busca el mensaje del borrador que te mandé. Trae un botón para abrirlo en Presencia.
2. Ábrelo. Ahí puedes ponerle imagen, editar el texto y programarlo.

Si quieres usar una foto tuya, súbela desde ahí. Yo no puedo poner imágenes en el borrador, y tampoco desde este chat.

Si prefieres otra imagen, dime qué quieres que se vea y te preparo un borrador nuevo.

- ¿Apareció algo prohibido?: no ✅

- Tokens: input 4348 / output 581 (razonamiento 394) / total 4929
- Primer token visible: 5.8 s · total 7.7 s · costo $0.0145

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

#### Corrida 2 — respondió `anthropic:claude-sonnet-5-5`

Eso se hace desde Presencia, no aquí en Telegram.

1. Abre el borrador con el botón del mensaje donde te lo mandé.
2. Ahí mismo, en la imagen de la publicación, pon la foto que quieras. Puede ser una tuya o la que se genera con el estilo visual de tu cuenta.
3. Cuando quede, ahí también lo programas.

Yo no puedo poner la imagen desde el chat. Si prefieres otra imagen, dime qué escena quieres y te ajusto la descripción del borrador.

- ¿Apareció algo prohibido?: no ✅

- Tokens: input 4348 / output 541 (razonamiento 351) / total 4889
- Primer token visible: 5.6 s · total 7.4 s · costo $0.0141

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

#### Corrida 3 — respondió `anthropic:claude-sonnet-5-5`

Desde el mensaje del borrador que te llegó aquí, toca el botón para abrirlo en Presencia. Ahí le pones la imagen.

- **Si es de Instagram o Facebook:** el borrador trae una descripción de imagen que puedes editar. La imagen se genera con el estilo visual de tu cuenta.
- **Si quieres usar tu propia foto:** también la pones desde Presencia. Yo no puedo ponerla desde Telegram.

Si me dices qué imagen tienes en mente, te ayudo a ajustar la descripción del borrador.

- ¿Apareció algo prohibido?: no ✅

- Tokens: input 4348 / output 487 (razonamiento 290) / total 4835
- Primer token visible: 5.3 s · total 6.7 s · costo $0.0136

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

---

## Consumo de tokens por proveedor (7 prompts)

Primer token visible: mediana y peor caso. Costo: promedio por turno, con los precios de `apps/api/src/ai/model-prices.ts`.

| Modelo                                                                                     | Input  | Output | Razonamiento | % razonamiento | Primer token (mediana / peor) | Costo por turno |
| ------------------------------------------------------------------------------------------ | ------ | ------ | ------------ | -------------- | ----------------------------- | --------------- |
| `cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5` | 150207 | 10720  | 2771         | 26%            | 6.6 s / 10.9 s                | $0.0194         |

## Telegram: la vara (F11)

0 voseo, card cuando se pide, 0 tablas de más de 3 columnas, ≥90% en un solo mensaje, HTML siempre válido y 0 errores con el respaldo forzado. Encabezados: aviso, no falla.

| Modelo                        | Un solo mensaje | Card cuando debía | Tablas anchas | Encabezados | HTML inválido | Con voseo | Errores |
| ----------------------------- | --------------- | ----------------- | ------------- | ----------- | ------------- | --------- | ------- |
| `anthropic:claude-sonnet-5-5` | 21/21 (100%)    | 18/21 (86%)       | 0             | 0           | 0             | 0         | 0       |

## Veredicto (juicio humano)

| Modelo                                                                                     | Registro cultural (1-5) | Tool calling | Notas |
| ------------------------------------------------------------------------------------------ | ----------------------- | ------------ | ----- |
| `cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5` |                         |              |       |

**Conclusión:**

_Pendiente de llenar por Jose tras leer el reporte._
