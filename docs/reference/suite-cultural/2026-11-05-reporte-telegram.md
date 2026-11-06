# Suite de regresión cultural — 2026-11-05

Los casos `telegram-*` llevan además el apéndice del canal (`channelInstruction`), antes de la fecha, como en producción.
System prompt: el de producción (`apps/api/src/chat/system-prompt.ts`), con "hoy" fijo en 2026-10-28 (`today.ts`), sin voz de marca (`buildSystemPrompt(null)` === prompt base).
Modelos: `cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5`.
Modo cadena (F10.11): cada corrida pasa por la cadena del chat con su respaldo; caída fingida: `ninguna`.
Corridas por caso: 3.

Criterio de juicio: tuteo natural, cero voseo, modismos mexicanos bien usados,
registro cercano sin caer en caricatura. Lo que suene a "español de aeropuerto" pierde.

## telegram-voz-ideas (Telegram)

> este… eh… ayer en el gym se me ocurrió que podría hacer contenido de, o sea, de las tres cosas que aprendí en mi primer año como freelance de diseño, ¿no? eh… dame tres ideas así concretas para desarrollarlo

### cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5

#### Corrida 1 — respondió `openai:gpt-6-luna@high`

Sí, esa idea da para algo muy aterrizado. Tres enfoques:

1. **“Lo que creía que era ser freelance vs. lo que aprendí”**  
   Contrasta una expectativa con la realidad: conseguir clientes, organizar el tiempo o cobrar. Cierra con qué harías distinto hoy.

2. **“El error que más me enseñó en mi primer año”**  
   Cuenta una situación concreta, qué pasó y qué aprendiste. Puede ser un proyecto mal cotizado, cambios sin límite o no dejar acuerdos por escrito.

3. **“Tres cosas que ahora hago diferente”**  
   Comparte aprendizajes prácticos: cómo presentas propuestas, organizas entregas o pones límites. Para cada uno, explica brevemente el antes y el después.

- Tokens: input 2188 / output 284 (razonamiento 118) / total 2472
- Primer token visible: 5.4 s · total 6.1 s · costo $0.0002

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

#### Corrida 2 — respondió `openai:gpt-6-luna@high`

Sí, está buena la idea. Puedes desarrollarla desde distintos ángulos:

1. **“Lo que nadie me dijo de ser freelance”**  
   Cuenta tres aprendizajes poco obvios: diseñar no ocupa todo tu tiempo, poner límites también es parte del trabajo y no todos los clientes son para ti. Acompaña cada punto con una situación que te haya pasado.

2. **“Tres errores que cometí en mi primer año”**  
   Elige errores reales —por ejemplo, no definir bien el alcance, cobrar sin calcular el tiempo o aceptar cambios ilimitados— y explica qué harías distinto ahora.

3. **“Lo que cambió entre mi primer proyecto y el último”**  
   Contrasta cómo trabajabas al inicio con cómo lo haces hoy: desde cotizar y comunicarte hasta organizar entregas. Cierra con el aprendizaje que más te hubiera servido saber desde el principio.

- Tokens: input 2188 / output 330 (razonamiento 138) / total 2518
- Primer token visible: 3.5 s · total 4.3 s · costo $0.0002

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

#### Corrida 3 — respondió `openai:gpt-6-luna@high`

¡Sí! Podrías desarrollar estas tres:

1. **“Cobrar por diseñar no es cobrar solo por el archivo”**  
   Cuenta cómo aprendiste a incluir en tu precio el tiempo de investigar, hacer propuestas, ajustar y comunicarte con el cliente.

2. **“Un buen brief te ahorra más tiempo que trabajar más rápido”**  
   Comparte qué preguntas empezaste a hacer antes de diseñar y cómo eso evita cambios de último minuto.

3. **“Poner límites también es parte del trabajo creativo”**  
   Habla de algo que aprendiste sobre horarios, revisiones o cambios extra, y cómo lo manejas ahora sin sentir culpa.

- Tokens: input 2188 / output 216 (razonamiento 71) / total 2404
- Primer token visible: 3.8 s · total 4.5 s · costo $0.0001

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

## telegram-post-linkedin (Telegram) (espera tool call)

> me gusta la segunda, hazme un post de LinkedIn

### cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5

#### Corrida 1 — respondió `openai:gpt-6-luna@high`

Listo. Te preparé un borrador para LinkedIn sobre aprender a poner límites y acordar expectativas con clientes.

- ¿Llamó la tool?: sí (1: crear_borrador_texto)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_texto</code></summary>

```json
{
  "body": "En mi primer año como freelance de diseño, aprendí que un buen proyecto no depende solo de hacer un gran diseño. También importa cómo trabajamos juntos.\n\nPoner límites claros no significa ser difícil. Significa acordar desde el inicio qué incluye el proyecto, cuándo habrá revisiones y cómo nos vamos a comunicar.\n\nEsa claridad cuida el tiempo de ambas partes y ayuda a que el proceso creativo funcione mejor.\n\nHoy entiendo que elegir cómo trabajar también es parte de construir una carrera freelance sostenible.\n\n¿Qué límite te hubiera gustado poner antes en tu trabajo?",
  "hashtags": [],
  "network": "linkedin"
}
```

</details>

- Tokens: input 4981 / output 477 (razonamiento 302) / total 5458
- Primer token visible: 4.3 s · total 7.4 s · costo $0.0003

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: debía crearla ✅ · voseo: no ✅

#### Corrida 2 — respondió `openai:gpt-6-luna@high`

Listo, te dejé el borrador para LinkedIn, enfocado en aprender a poner límites claros con clientes.

- ¿Llamó la tool?: sí (1: crear_borrador_texto)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_texto</code></summary>

```json
{
  "body": "En mi primer año como freelance de diseño, aprendí que no todos los proyectos son para mí.\n\nHubo un momento en que un cliente me hizo cuestionarme si quería seguir por este camino. No fue solo por el diseño: entendí que también necesitaba poner límites claros sobre el alcance, los tiempos y la comunicación.\n\nDesde entonces, intento dejar esos acuerdos definidos desde el inicio. No para trabajar con menos compromiso, sino para que el proyecto funcione mejor para ambas partes.\n\nSer freelance también es aprender a cuidar tu trabajo y tu energía.\n\n¿Qué límite te habría gustado poner antes en tu carrera?",
  "hashtags": [],
  "network": "linkedin"
}
```

</details>

- Tokens: input 4959 / output 1043 (razonamiento 857) / total 6002
- Primer token visible: 5.6 s · total 14.2 s · costo $0.0006

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: debía crearla ✅ · voseo: no ✅

#### Corrida 3 — respondió `openai:gpt-6-luna@high`

Listo: ya tienes el borrador para LinkedIn. Puedes abrirlo en Presencia para editarlo y programarlo.

- ¿Llamó la tool?: sí (1: crear_borrador_texto)
- ¿Input Zod-válido?: sí

<details><summary>Card generada — <code>crear_borrador_texto</code></summary>

```json
{
  "body": "En mi primer año como freelance de diseño, aprendí que poner límites no es ser difícil: es cuidar el proyecto y la relación con el cliente.\n\nHubo un proyecto que casi me hace renunciar. Acepté cambios sin fin, tiempos poco claros y mensajes a cualquier hora, pensando que así demostraría compromiso. Terminé con más estrés y menos espacio para hacer buen diseño.\n\nDesde entonces, procuro acordar desde el inicio qué incluye el proyecto, cuántas rondas de cambios hay y cómo nos vamos a comunicar. No siempre es fácil decirlo, pero la claridad evita muchos malentendidos.\n\nSer freelance también es aprender a trabajar mejor, no solo a diseñar mejor.\n\n¿Qué límite te habría gustado poner antes en tu trabajo?",
  "hashtags": [],
  "network": "linkedin"
}
```

</details>

- Tokens: input 4716 / output 213 (razonamiento 0) / total 4929
- Primer token visible: 1.3 s · total 4.7 s · costo $0.0002

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: debía crearla ✅ · voseo: no ✅

## telegram-tabla (Telegram)

> compárame 5 cafeterías buenas para trabajar en Mérida: precio del americano, horario, si tienen wifi y si hay estacionamiento

### cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5

#### Corrida 1 — respondió `openai:gpt-6-luna@high`

No pude confirmar datos actuales: las búsquedas no devolvieron resultados útiles. Para no inventarte precios, horarios, wifi o estacionamiento, no te armo una comparación poco confiable.

Si me escribes de nuevo, puedo intentar otra búsqueda; también puedes mandarme los nombres de algunas cafeterías que tengas en mente y las comparo.

<details><summary>Búsqueda — <code>buscar_en_web</code></summary>

```json
{
  "consulta": "cafeterías para trabajar Mérida Yucatán precio americano horario wifi estacionamiento 2026"
}
```

</details>

<details><summary>Búsqueda — <code>buscar_en_web</code></summary>

```json
{
  "consulta": "cafeterías Mérida Yucatán wifi estacionamiento horario café americano"
}
```

</details>

<details><summary>Búsqueda — <code>buscar_en_web</code></summary>

```json
{
  "consulta": "mejores cafeterías Mérida Yucatán para trabajar coworking café wifi"
}
```

</details>

- Tokens: input 9298 / output 375 (razonamiento 192) / total 9673
- Primer token visible: 12.0 s · total 12.7 s · costo $0.0003

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

#### Corrida 2 — respondió `openai:gpt-6-luna@high`

No pude obtener resultados confiables en la búsqueda, así que no quiero inventarte precios, horarios ni datos de wifi o estacionamiento. Si me compartes algunos nombres de cafeterías que te interesen, te comparo esos datos.

<details><summary>Búsqueda — <code>buscar_en_web</code></summary>

```json
{
  "consulta": "cafeterías para trabajar Mérida Yucatán wifi estacionamiento horario precio americano"
}
```

</details>

<details><summary>Búsqueda — <code>buscar_en_web</code></summary>

```json
{
  "consulta": "cafetería Mérida Yucatán wifi estacionamiento americano horario coworking"
}
```

</details>

<details><summary>Búsqueda — <code>buscar_en_web</code></summary>

```json
{
  "consulta": "cafés con wifi para trabajar en Mérida Yucatán"
}
```

</details>

- Tokens: input 4673 / output 330 (razonamiento 169) / total 5003
- Primer token visible: 8.8 s · total 10.4 s · costo $0.0002

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

#### Corrida 3 — respondió `openai:gpt-6-luna@high`

No pude obtener resultados web confiables para comparar precios, horarios, wifi y estacionamiento sin inventar datos. Si me dices qué zona de Mérida te queda mejor —por ejemplo, Centro, Norte o Altabrisa— lo intento de nuevo con una búsqueda más específica.

<details><summary>Búsqueda — <code>buscar_en_web</code></summary>

```json
{
  "consulta": "cafeterías para trabajar Mérida Yucatán wifi estacionamiento precio americano horario"
}
```

</details>

<details><summary>Búsqueda — <code>buscar_en_web</code></summary>

```json
{
  "consulta": "cafetería Mérida Yucatán wifi estacionamiento menú americano horario cafe"
}
```

</details>

<details><summary>Búsqueda — <code>buscar_en_web</code></summary>

```json
{
  "consulta": "cafetería coworking Mérida Yucatán café americano horario wifi estacionamiento"
}
```

</details>

- Tokens: input 4674 / output 335 (razonamiento 162) / total 5009
- Primer token visible: 6.0 s · total 6.7 s · costo $0.0002

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

## telegram-enlace (Telegram) (espera leer el enlace)

> léete esto y dime de qué va, para sacar un post: https://www.diariodeyucatan.com/merida/2026/10/05/la-marquesita-cumple-80-anos

### cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5

#### Corrida 1 — respondió `openai:gpt-6-luna@high`

La nota cuenta la historia de la marquesita en Mérida: dice que nació en 1945, cuando don Ernesto Pérez Novelo empezó a vender barquillos en el parque de Santa Ana. También menciona el origen del nombre, la popularidad del postre y que hoy hay más de 300 carritos en la ciudad. [Diario de Yucatán, 5 de octubre de 2026](https://www.diariodeyucatan.com/merida/2026/10/05/la-marquesita-cumple-80-anos)

Como gancho para tu post, podrías enfocarte en sus _80 años de historia y sabor yucateco_. La nota anuncia una feria para el 8 de noviembre en el parque de Santa Ana.

- ¿Leyó el enlace?: sí (1) — debía leerlo ✅

<details><summary>Lectura — <code>leer_enlace</code></summary>

```json
{
  "url": "https://www.diariodeyucatan.com/merida/2026/10/05/la-marquesita-cumple-80-anos"
}
```

</details>

- Tokens: input 4642 / output 497 (razonamiento 281) / total 5139
- Primer token visible: 7.1 s · total 7.8 s · costo $0.0003

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

#### Corrida 2 — respondió `openai:gpt-6-luna@high`

Va sobre los **80 años de la marquesita en Mérida**: cuenta que nació en 1945, cuando don Ernesto Pérez Novelo empezó a vender barquillos en un carrito del parque de Santa Ana. También explica el origen de su nombre y cómo hoy hay más de 300 carritos en la ciudad.

La nota menciona una feria prevista para el **8 de noviembre**, de 6 a 10 p. m., en el parque de Santa Ana, con concurso de carritos. Ese dato es según la publicación del 5 de octubre.

Fuente: [Diario de Yucatán](https://www.diariodeyucatan.com/merida/2026/10/05/la-marquesita-cumple-80-anos)

- ¿Leyó el enlace?: sí (1) — debía leerlo ✅

<details><summary>Lectura — <code>leer_enlace</code></summary>

```json
{
  "url": "https://www.diariodeyucatan.com/merida/2026/10/05/la-marquesita-cumple-80-anos"
}
```

</details>

- Tokens: input 4642 / output 343 (razonamiento 131) / total 4985
- Primer token visible: 3.8 s · total 4.9 s · costo $0.0002

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

#### Corrida 3 — respondió `openai:gpt-6-luna@high`

Va sobre los **80 años de la marquesita en Mérida**. Según el artículo, don Ernesto Pérez Novelo empezó a venderlas en 1945 en un carrito del parque de Santa Ana; hoy hay más de 300 carritos en la ciudad. También cuenta el origen del nombre y menciona que la clásica lleva queso de bola. [Diario de Yucatán](https://www.diariodeyucatan.com/merida/2026/10/05/la-marquesita-cumple-80-anos)

Como ángulo para tu post, puedes destacar cómo un postre nacido en un carrito se volvió parte de la identidad yucateca. El artículo también anuncia una feria el **8 de noviembre**, de 6 a 10 p. m., en el parque de Santa Ana.

- ¿Leyó el enlace?: sí (1) — debía leerlo ✅

<details><summary>Lectura — <code>leer_enlace</code></summary>

```json
{
  "url": "https://www.diariodeyucatan.com/merida/2026/10/05/la-marquesita-cumple-80-anos"
}
```

</details>

- Tokens: input 4642 / output 378 (razonamiento 155) / total 5020
- Primer token visible: 4.0 s · total 5.2 s · costo $0.0002

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

## telegram-busqueda (Telegram) (espera buscar en la web)

> ¿cuánto cuesta hoy la entrada al Gran Museo del Mundo Maya? lo quiero poner en un post

### cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5

#### Corrida 1 — respondió `openai:gpt-6-luna@high`

Hoy, la entrada general cuesta **$250 MXN**. Para residentes de Yucatán con INE, **$100 MXN**, según la [página oficial del museo](https://www.granmuseodelmundomaya.com.mx/visita), consultada el 1 de octubre de 2026. También lo confirma [Diario de Yucatán](https://www.diariodeyucatan.com/merida/2026/10/12/museos-precios) el 12 de octubre.

- ¿Buscó en la web?: sí (1) — debía buscar ✅
- ¿Citó una fuente que devolvió la web?: sí ✅

<details><summary>Búsqueda — <code>buscar_en_web</code></summary>

```json
{
  "consulta": "precio entrada Gran Museo del Mundo Maya hoy 28 octubre 2026 Mérida tarifa"
}
```

</details>

- Tokens: input 4565 / output 244 (razonamiento 94) / total 4809
- Primer token visible: 4.4 s · total 5.0 s · costo $0.0002

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

#### Corrida 2 — respondió `openai:gpt-6-luna@high`

Hoy, **miércoles 28 de octubre de 2026**, la entrada general cuesta **$250 MXN**. Para residentes de Yucatán con INE, cuesta **$100 MXN**. ([sitio del museo](https://www.granmuseodelmundomaya.com.mx/visita), [Diario de Yucatán](https://www.diariodeyucatan.com/merida/2026/10/12/museos-precios))

Si lo vas a poner en un post, conviene aclarar que el precio puede cambiar.

- ¿Buscó en la web?: sí (1) — debía buscar ✅
- ¿Citó una fuente que devolvió la web?: sí ✅

<details><summary>Búsqueda — <code>buscar_en_web</code></summary>

```json
{
  "consulta": "precio entrada Gran Museo del Mundo Maya hoy 28 octubre 2026 Mérida tarifa"
}
```

</details>

- Tokens: input 4565 / output 156 (razonamiento 0) / total 4721
- Primer token visible: 3.1 s · total 4.1 s · costo $0.0001

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

#### Corrida 3 — respondió `openai:gpt-6-luna@high`

Hoy, 28 de octubre, la entrada general cuesta **$250**. Para residentes de Yucatán con INE, cuesta **$100**, según la [página oficial del museo](https://www.granmuseodelmundomaya.com.mx/visita).

- ¿Buscó en la web?: sí (1) — debía buscar ✅
- ¿Citó una fuente que devolvió la web?: sí ✅

<details><summary>Búsqueda — <code>buscar_en_web</code></summary>

```json
{
  "consulta": "precio entrada Gran Museo del Mundo Maya hoy 28 octubre 2026 Mérida tarifa"
}
```

</details>

- Tokens: input 4565 / output 303 (razonamiento 206) / total 4868
- Primer token visible: 4.4 s · total 4.9 s · costo $0.0002

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

## telegram-nombre-raro (Telegram)

> hazme un post de instagram para la hacienda ishcanatun, este, donde hicimos la sesión de fotos el sábado, quedó bien bonita

### cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5

#### Corrida 1 — respondió `openai:gpt-6-luna@high`

¡Claro! ¿Qué tipo de sesión fue —por ejemplo, boda, pareja o familia— y qué quieres promocionar: tu trabajo como fotógrafa o la Hacienda? Así te preparo el post sin inventar detalles.

- Tokens: input 2167 / output 224 (razonamiento 174) / total 2391
- Primer token visible: 4.1 s · total 4.4 s · costo $0.0001

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

#### Corrida 2 — respondió `openai:gpt-6-luna@high`

¿Te refieres a la Hacienda Xcanatún? ¿Así se escribe? Y preparo el post.

- Tokens: input 2167 / output 239 (razonamiento 211) / total 2406
- Primer token visible: 3.3 s · total 3.6 s · costo $0.0001

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

#### Corrida 3 — respondió `openai:gpt-6-luna@high`

¡Claro! ¿Me confirmas cómo se escribe el nombre de la hacienda? ¿Y qué tipo de sesión fue —por ejemplo, familiar, de pareja o de marca— para que el post quede fiel a lo que hicieron?

- Tokens: input 2167 / output 313 (razonamiento 260) / total 2480
- Primer token visible: 4.0 s · total 4.4 s · costo $0.0002

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

## telegram-botones-web (Telegram)

> oye y ¿cómo le pongo una imagen al post que me hiciste?

### cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5

#### Corrida 1 — respondió `openai:gpt-6-luna@high`

Abre el borrador en Presencia y agrega la imagen desde ahí antes de programarlo o publicarlo.

- ¿Apareció algo prohibido?: no ✅

- Tokens: input 2153 / output 245 (razonamiento 217) / total 2398
- Primer token visible: 2.8 s · total 3.1 s · costo $0.0001

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

#### Corrida 2 — respondió `openai:gpt-6-luna@high`

Abre el borrador en Presencia y agrega la imagen al editar la publicación. Después puedes guardar o programar el post.

- ¿Apareció algo prohibido?: no ✅

- Tokens: input 2153 / output 258 (razonamiento 226) / total 2411
- Primer token visible: 2.9 s · total 3.2 s · costo $0.0002

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

#### Corrida 3 — respondió `openai:gpt-6-luna@high`

Abre el borrador desde el mensaje que te llegó y agrega la imagen en Presencia antes de programarlo. Si quieres usar una foto tuya, selecciónala desde tu dispositivo.

- ¿Apareció algo prohibido?: no ✅

- Tokens: input 2153 / output 337 (razonamiento 294) / total 2490
- Primer token visible: 5.3 s · total 5.6 s · costo $0.0002

- Telegram: 1 mensaje ✅ · tablas de más de 3 columnas: 0 ✅ · encabezados: 0 ✅ · HTML válido: sí ✅
- ¿Card cuando debía?: no debía ✅ · voseo: no ✅

---

## Consumo de tokens por proveedor (7 prompts)

Primer token visible: mediana y peor caso. Costo: promedio por turno, con los precios de `apps/api/src/ai/model-prices.ts`.

| Modelo                                                                                     | Input | Output | Razonamiento | % razonamiento | Primer token (mediana / peor) | Costo por turno |
| ------------------------------------------------------------------------------------------ | ----- | ------ | ------------ | -------------- | ----------------------------- | --------------- |
| `cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5` | 80446 | 7140   | 4258         | 60%            | 4.1 s / 12.0 s                | $0.0002         |

## Telegram: la vara (F11)

0 voseo, card cuando se pide, 0 tablas de más de 3 columnas, ≥90% en un solo mensaje, HTML siempre válido y 0 errores con el respaldo forzado. Encabezados: aviso, no falla.

| Modelo                   | Un solo mensaje | Card cuando debía | Tablas anchas | Encabezados | HTML inválido | Con voseo | Errores |
| ------------------------ | --------------- | ----------------- | ------------- | ----------- | ------------- | --------- | ------- |
| `openai:gpt-6-luna@high` | 21/21 (100%)    | 21/21 (100%)      | 0             | 0           | 0             | 0         | 0       |

## Lectura (Claude, 2026-11-05)

Los tres reportes de la cadena (este, `-respaldo-gemini` y `-respaldo-gemini-2`, `-respaldo-sonnet`), más el caso de la tabla con los datos en el mensaje (`-telegram-tabla*`, porque aquí el caso pedía buscar y la búsqueda de la suite no trae nada) y el A/B de Sonnet (`-telegram-ab-con` / `-ab-sin`). La tabla consolidada y la lectura completa están en ADR-030, "Suite cultural con el apéndice".

- **Pasa la vara sin tocar el apéndice:** 100% del texto en un solo mensaje, 0 tablas anchas, 0 voseo (palabra completa: la primera corrida contaba "objeti*vos*").
- **La medición de este reporte es la primera versión.** La revisión del PR8 la corrigió (cards con input inválido, voseo imperativo, el nombre mal oído); los números recalificados están en ADR-030.
- **Luna (el principal):** 24/24 en card cuando debía. Respuestas cortas, en listas, sin encabezados; manda a "abrir el borrador en Presencia" para la imagen.
- **Gemini:** igual de bien, pero con encabezados (que Telegram muestra como negritas).
- **Sonnet:** pide detalles antes del post de LinkedIn, con o sin el apéndice. Es su criterio, no efecto del canal.

## Veredicto (juicio humano)

| Modelo                                                                                     | Registro cultural (1-5) | Tool calling | Notas |
| ------------------------------------------------------------------------------------------ | ----------------------- | ------------ | ----- |
| `cadena:openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5` |                         |              |       |

**Conclusión:**

_Pendiente de llenar por Jose tras leer el reporte._
