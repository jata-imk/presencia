# Presencia — Módulo Chat

> Este documento describe el corazón creativo de Presencia:
> el módulo Chat. Cubre QUÉ hace, POR QUÉ está diseñado así,
> y CÓMO se siente usarlo. Para entender el producto a nivel
> macro, leer primero `presencia-overview.md`.

> **⚠️ Actualización de posicionamiento (importante).** Este
> documento se escribió originalmente con LinkedIn como red
> estrella y una sola card de publicación universal (texto
> protagonista, imagen acompañante). El posicionamiento
> cambió: el público es el **creator mexicano**, las redes
> primarias son **Instagram, Facebook y TikTok** (visuales),
> y el copy del producto va en **español mexicano (tuteo)**.
> En consecuencia, la card universal se parte en **tres
> arquetipos** (ver sección 2.bis y 3). Donde el flujo de
> ejemplo abajo use LinkedIn, léelo como ilustración del
> mecanismo, no como la red prioritaria. La mecánica
> conversacional (streaming, estados borrador/programado/
> publicado, drawer de programación, iteración) se reutiliza
> idéntica entre los tres arquetipos.

---

## 1. Qué es el módulo Chat y por qué es central

### Su rol en el producto

El módulo Chat no es "un feature más" de Presencia. Es **el
producto**. Todo lo demás (Calendario, Ritmo, Analíticas,
Biblioteca) son satélites que dan contexto al Chat o consumen
lo que se genera ahí.

Si el Chat falla, el producto falla. Si el Chat funciona,
todo lo demás puede ser mejorado con el tiempo sin perder
usuarios.

### El problema específico que resuelve

Cuando un creator tiene una idea para contenido, hay un
proceso mental complejo entre "tengo la idea" y "tengo el
post publicado". Ese proceso involucra:

1. Capturar la idea antes de que se pierda
2. Desarrollarla en un concepto sólido
3. Adaptarla al formato de cada red donde quiere publicarla
4. Decidir cuándo publicarla
5. Ejecutar la publicación

Las herramientas actuales rompen este proceso en pedazos
distintos manejados por distintas apps. El Chat de Presencia
los unifica todos en una sola conversación.

### La hipótesis fundamental

Si el chat conoce al usuario (su voz, su audiencia, sus
tendencias del nicho, sus posts pasados), el proceso de los
5 pasos arriba se siente como pedirle a un equipo creativo
real "hazme esto". El usuario sigue siendo el director, pero
deja de hacer el trabajo mecánico.

---

## 2. Cómo se siente usar el Chat: un flujo completo

Para entender el módulo, lo mejor es seguir un flujo completo
de un usuario real. Vamos con Jose (founder de Presencia),
que quiere crear contenido para promocionar su producto.

### Lunes a la mañana, Jose abre la app

Entra a Presencia desde el navegador. Login. El App Shell
carga con el módulo Chat ya activo por default (no hay
dashboard intermedio; entrás directo a crear).

**Lo que ve Jose:**

Una pantalla limpia con un saludo personalizado:

> **Hola, Jose**
> ¿Qué quieres publicar hoy?

Debajo del saludo, un input grande tipo "héroe visual".
Claramente es el elemento más prominente de la pantalla —
está pidiéndole que escriba.

El input tiene un placeholder cálido: _"Cuéntame qué quieres
crear hoy..."_

Debajo del input, una grilla de 6 cards de sugerencias. Las
primeras 4 son fijas (siempre las mismas):

- ✨ **Ideas para esta semana** — Genera 5 conceptos basados
  en mis tendencias
- 🔄 **Adaptar mi último post** — Crea versiones para cada
  red social
- 📅 **Calendario del mes** — Plan editorial completo para
  30 días
- ✍️ **Hilo viral** — Estructura un thread o carrusel paso a
  paso

Las últimas 2 cards son dinámicas, vienen del módulo Ritmo,
y se diferencian visualmente con un badge "🔥 Tendencia":

- 🔥 **Tendencia · Agentes de IA autónomos · +24%**
- 🔥 **Tendencia · Personal branding sin esfuerzo · +18%**

Estas dos cards cambian según el nicho del usuario y qué
está creciendo en su industria. Es una integración cross-
módulo que conecta Ritmo (estrategia) con Chat (ejecución)
sin obligar al usuario a navegar entre módulos.

Debajo de las cards, un chip sutil de contexto:

> 🧠 Recordando tu voz de marca, audiencia y posts recientes

Click en ese chip abre un popover que muestra qué exactamente
sabe la IA sobre Jose (su tono configurado, audiencia
objetivo, posts recientes, tendencias monitoreadas). Genera
confianza: esta no es una IA genérica, es una IA que conoce
al usuario.

### Jose empieza a escribir

Jose tiene una idea concreta: quiere publicar sobre "tres
errores comunes al usar IA para crear contenido". Tipea en
el input.

A medida que escribe, varias cosas pasan:

1. El botón de enviar se activa (de disabled a primario)
2. Aparece un indicador discreto de costo: "≈ 2 créditos"
3. La toolbar inferior del input muestra los botones disponibles:
   - 📎 Adjuntar archivo (si quiere mandar referencias visuales)
   - 🎤 Transcribir audio (si prefiere dictar en lugar de tipear)
   - 🎨 Estilo de respuesta (selector tipo Claude: Conciso,
     Explicativo, Creativo, etc.)

Jose decide pedir el post directamente. Tipea:

> _"Hazme un post para LinkedIn sobre los tres errores más
> comunes que cometen los creators al usar IA para crear
> contenido. Tono educativo pero con un poco de humor."_

Hace click en enviar.

### La generación: streaming visible y transparente

El mensaje de Jose aparece a la derecha en un bubble con el
color de la marca (Plum Light). La respuesta de la IA empieza
a generarse a la izquierda.

Pero no es solo "está cargando..." y después aparece todo.
Es una experiencia construida en fases:

**Fase 1 — Pensando (1-2 segundos)**
Aparece el avatar de la IA (logo isotipo de Presencia) con
tres dots animados al lado. Visualmente sutil pero indica
"está procesando".

**Fase 2 — Steps de tool calls (3-5 segundos)**
Aparecen mensajes pequeños y sutiles indicando qué está
haciendo la IA internamente:

> 🧠 Accediendo a tu voz de marca...
> 📊 Analizando posts educativos que funcionaron antes...
> 🔍 Revisando tendencias en marketing de contenido...

Cada step se va marcando como completado con un checkmark.
Esta transparencia es estratégica: comunica que la IA está
haciendo trabajo real y diferenciado, no solo generando
texto random. Es la diferencia visual entre "ChatGPT
genérico" y "asistente con contexto".

**Fase 3 — Streaming de la respuesta (5-10 segundos)**
La IA empieza a escribir su respuesta con efecto typewriter.
Texto que aparece letra por letra a velocidad natural (no
demasiado rápido).

Durante todo el streaming, hay un botón "⏹ Detener generación"
siempre visible. Si Jose ya tiene suficiente para entender
hacia dónde va, puede cortar.

### La IA responde con una card de publicación, no un mensaje normal

Acá está el momento clave del producto. La IA no responde
con texto plano dentro de un bubble. Responde con una **card
de publicación**: un componente especializado que comunica
"esto no es texto, esto es contenido listo para publicar".

**Cómo se ve la card en estado borrador:**

La card es notablemente más grande que un mensaje normal
(ocupa ~85% del ancho disponible). Tiene un border animado
de 2px con gradiente que rota continuamente entre Pink
Orchid → Blush Pop → Icy Blue, en ciclos de 4-5 segundos.
Hay también un glow exterior sutil con los mismos colores
a baja opacidad.

Este glow es identidad visual del producto. Comunica: "esto
está vivo, recién nacido, todavía es maleable". El glow
solo aparece en estado borrador. Cuando la publicación se
programa, el glow desaparece y el border se vuelve sólido
(señal visual de "esto ya está asentado").

**Estructura interna de la card:**

En la parte superior, un header con:

- Icono oficial de LinkedIn (azul corporativo, no genérico)
- Nombre "LinkedIn"
- Badge "✨ Borrador" en tinte Pink Orchid

A la derecha del header, un indicador sutil:

> ✓ Guardado en Biblioteca — Ver

Esto comunica que la publicación ya quedó automáticamente
guardada en el módulo Biblioteca (no requiere click manual
de "guardar"). Reduce fricción y refuerza que el contenido
no se pierde.

En el cuerpo de la card, el preview real de cómo se va a
ver en LinkedIn:

- Avatar del usuario (Jose) con su foto real
- Su nombre y headline
- Timestamp simulado: "Ahora"
- El texto del post completo, formateado como aparecerá en
  LinkedIn
- Si tiene imagen acompañante, se ve con el aspect ratio
  correcto
- Iconos de like, comment, share como elementos visuales
  (no funcionales, solo para fidelidad del preview)

Debajo del preview, una franja con meta-información práctica:

- Conteo de caracteres con indicador de color (verde = ok,
  amarillo = cerca del límite, rojo = excede): "**1,243 /
  3,000 caracteres**"
- Tono detectado: "Tono: Profesional · Educativo · Cercano"
- Tiempo estimado de lectura: "~2 min"

En la parte inferior de la card, la toolbar de acciones:

- 📅 **Programar** (botón primario, color destacado)
- ✏️ **Editar**
- 🔄 **Adaptar** (genera versiones para otras redes)
- 🔃 **Regenerar**
- ⛶ **Pantalla completa** (expande a panel lateral)

### Jose itera con la IA

Jose lee el post. Le gusta el contenido pero quiere ajustarlo.
Tiene dos formas de hacerlo:

**Opción A: Pedir cambios por chat**
Tipea en el input: _"Hazlo más corto y agregale una pregunta
al final para generar engagement."_

Cuando manda este mensaje, pasa algo importante: la card
anterior **se mantiene visible** en su tamaño completo. La
IA genera una segunda card debajo con la versión ajustada.
Esto permite a Jose comparar mentalmente las dos versiones.

**Opción B: Click en "Regenerar" dentro de la card**
Click en regenerar genera una nueva versión completa, pero
esta vez **reemplaza** la card actual (no genera una segunda
aparte). Razón: Jose explícitamente dijo "esta no me gusta,
otra". Aparece sutilmente un link "Deshacer" durante 5
segundos por si se arrepiente.

Estas dos formas de iterar tienen comportamientos distintos
intencionalmente. Una preserva la historia (útil para
A/B testing mental), la otra reemplaza (útil para iteración
rápida).

### Cuando hay muchas cards, las anteriores se colapsan

Después de varias iteraciones, Jose tiene 4 cards de
publicación en la conversación. La más reciente queda
expandida. Las anteriores se colapsan automáticamente a un
formato summary compacto:

> 🔵 LinkedIn · ✨ Borrador
> "Tres errores comunes al usar IA para crear contenido..."
> [▼ Expandir]

Esta auto-colapsación es crítica para conversaciones largas.
Sin ella, una sesión de iteración de 30 minutos genera un
muro de cards expandidas que abruma visualmente. Click en
cualquier card colapsada la vuelve a expandir.

### Jose quiere refinar a fondo: abre el panel lateral

Después de iterar un par de veces, Jose tiene una versión
casi final. Pero quiere hacer ajustes finos: mejorar
hashtags, considerar variantes, ver cómo se verá realmente
en el feed de LinkedIn.

Hace click en "⛶ Pantalla completa" en la card.

**Qué pasa:**

El chat se reduce a ~40% del ancho (sigue visible y
scrolleable). Se abre un panel lateral derecho de ~50% del
ancho con el editor expandido.

El panel lateral tiene 5 secciones internas, scrollables:

**A) Editor avanzado**
Textarea grande con toolbar de formato (negrita, itálica,
listas, links). Sugerencias inline de mejora (la IA subraya
partes del texto que podrían mejorarse y al hover muestra
alternativas). Contador de caracteres prominente y
detallado.

**B) Hashtags inteligentes**
Lista de hashtags sugeridos por la IA, cada uno con un
indicador visual de "fuerza":

- 🔥 Caliente (alto volumen, mucha competencia)
- 📊 Balanceado (volumen medio, viable)
- 🎯 Nicho (bajo volumen pero alta relevancia)

Jose puede agregar/quitar con click. También hay búsqueda
manual y un botón para regenerar sugerencias.

**C) Media — ciudadano de primera clase (no "acompañante")**
El tratamiento depende del arquetipo de la card:

- **Visual-first (IG/FB):** esta sección es **el centro de
  gravedad del panel**, no un extra. Preview grande de la
  imagen. Si es carrusel, gestión de slides: reordenar,
  agregar, eliminar, regenerar slide individual. Botón
  "Regenerar imagen" con opciones de dirección (más colorida,
  más profesional, estilo ilustración, estilo fotográfico,
  más minimalista). 3-4 thumbnails de variaciones para elegir.
  Subir imagen propia. Control de aspect ratio (1:1, 4:5).
- **Texto-first (LinkedIn/X/Threads):** la imagen es opcional
  y acompañante. Si la IA generó una, aparece el preview con
  las mismas opciones de regeneración, pero la sección es
  secundaria frente al editor de texto.
- **Guion-video (TikTok/Reels/Shorts):** esta sección **no
  aplica** (no se genera imagen ni video). En su lugar, el
  panel muestra el editor del paquete de guion (hook, beats,
  notas de grabación).

**D) Vista previa realista**
Mockup detallado y fiel de cómo se verá en LinkedIn, con el
avatar real de Jose, su headline, formato exacto de la red.
Toggle entre "Vista feed" (cómo se ve en el scroll de la
red) y "Vista detalle" (cómo se ve al abrir el post).

**E) Variantes A/B**
Botón "✨ Generar 3 variantes" que crea tres versiones
distintas del mismo post para comparar. Jose puede ver las
tres lado a lado, elegir su favorita, o regenerar todas.

El footer del panel tiene las acciones principales (mismas
de la toolbar de la card, pero más prominentes): Programar
como primario.

### Jose está conforme. Hora de programar.

Click en "📅 Programar".

Se abre un **drawer lateral derecho** (no un modal flotante).
Razón de esto: un modal bloquearía toda la pantalla; un
drawer mantiene la conversación visible al fondo y se siente
menos invasivo.

**Estructura del drawer de programación:**

**Arriba:** Preview compacto de la publicación (3-4 líneas)
con el icono de LinkedIn y conteo de caracteres. Recordatorio
sutil de qué se está programando.

**Sección "¿Cuándo publicar?":**
Calendario inline (no popup) mostrando el mes actual con
chevrons para navegar. Los días que ya tienen posts
programados aparecen marcados con dots sutiles (para evitar
saturación de horarios). El día seleccionado destacado en
Plum.

Arriba del calendario, chips de shortcuts:

- "Hoy" (si aún hay tiempo en el día)
- "Mañana"
- "En 2 días"
- "Próxima semana"

**Sección "¿A qué hora?":**
Selector de hora estándar. Pero acá viene la magia de la
integración con Ritmo:

> 🎯 **Tus mejores horarios para LinkedIn**
> [10:00 +18% engagement] [18:00 🔥 Top horario]
> [12:00 +12%] [20:00 Buen horario]

Estos chips son clickeables. Cada uno prellena el selector
de hora. Hover muestra explicación: _"Tus posts a esta hora
tienen 18% más engagement promedio"_.

Indicador sutil: _"Basado en tu data de los últimos 30 días"_
con link "Ver más en Ritmo" que lleva al módulo Ritmo.

**Sección "Tu semana":**
Mini-calendario horizontal mostrando los 7 días con sus
posts programados como dots. El día seleccionado destacado.
Si hay conflicto de horario (otro post a la misma hora),
warning visual con icono alert.

**Sección multi-red (si aplica):**
Si la publicación se generó para múltiples redes (caso
típico cuando Jose hace click en "Adaptar"), aparece un
toggle:

- "Sí, mismo horario para todas" (default)
- "Personalizar por red"

Si elige personalizar, se expande mostrando selector
individual de fecha/hora por cada red.

**Footer del drawer:**

- Resumen: _"Se publicará el martes 15 de octubre a las
  18:00"_
- Botón "Cancelar"
- Botón "✓ Programar" (primario, prominente)

Jose elige el horario de 18:00 sugerido. Click en Programar.

### Después de programar: el "wow moment"

Pasa el momento que diferencia Presencia de cualquier otra
herramienta. Tres cosas suceden simultáneamente:

**1. La card de publicación cambia de estado visualmente.**
El glow border animado desaparece. Aparece un border sólido
en Icy Blue (señal visual de "asentado, confirmado"). El
preview del post baja sutilmente su opacidad a 95% (señal
de "ya está hecho, no requiere atención activa").

Arriba del header de la red, aparece un nuevo banner:

> 📅 **Programado para martes 15 a las 18:00**
> _Ver en calendario →_

El link "Ver en calendario" lleva al módulo Calendario con
el post resaltado/scrolleado a su posición.

El badge del header cambia: "✨ Borrador" → "✓ Programado"
(ahora en tinte Sky Blue).

La toolbar de acciones también cambia:

- "📅 Programar" → "📅 Reprogramar"
- Aparece nueva acción: "🗑️ Cancelar programación" (color
  destructive sutil, separado del resto)

**2. Aparece un mensaje de seguimiento de la IA.**
Como continuación natural de la conversación, la IA escribe
un mensaje:

> _Listo, programé tu post para LinkedIn el martes a las
> 18:00. ¿Quieres que prepare algo más?_

**3. Debajo del mensaje aparecen sugerencias contextuales.**
Tres mini-cards horizontales con próximos pasos lógicos:

- 📱 **Teaser para Stories** — Crea un avance para publicar
  antes del post
- 🔄 **Adaptar para Twitter** — Versión corta del mismo
  concepto para tu X
- 📅 **Más posts esta semana** — Mantén el ritmo con 3
  publicaciones más

Click en cualquiera prellena el input con el prompt
asociado. Si Jose no quiere ninguna, simplemente sigue
conversando o cierra el chat. **No hay nada bloqueante**:
estas sugerencias son invitaciones, no requisitos.

### Si Jose se arrepiente: cancelar la programación

Suponé que 5 minutos después Jose decide que no le convence
el horario. Hace click en "🗑️ Cancelar programación" en la
card.

Pasa esto:

- La cancelación es inmediata (sin modal de confirmación
  bloqueante)
- La card vuelve a estado borrador (transición visual suave:
  el border sólido se desvanece, el glow animado vuelve)
- Aparece un toast en el bottom-right:

> ✓ Programación cancelada
> [Deshacer]

El toast tiene una barra de progreso sutil que muestra los
5 segundos disponibles para deshacer. Si Jose hace click en
"Deshacer", la programación se restaura inmediatamente.

**Por qué este patrón:** Cancelar programación es una acción
reversible. Forzar un modal de confirmación ("¿estás
seguro?") agrega fricción innecesaria. La técnica de
"acción + ventana de deshacer" es estándar en apps modernas
(Gmail, Slack) precisamente porque respeta al usuario sin
ponerle obstáculos.

### Eventualmente, el post se publica

V1 muestra el diseño del estado "Publicado" aunque la
integración real con las redes sociales evoluciona en
paralelo.

Cuando el post se publica, la card cambia de estado una vez
más:

- Border verde semántico suave
- Banner: "✓ Publicado el martes 15 a las 18:02" con icono
  check
- Opacidad del preview baja a 90% (más reducida que
  programado, comunicando "completado, archivado")
- La toolbar cambia drásticamente:
  - 📊 **Ver estadísticas** (primario)
  - 🔄 **Adaptar para otra red**
  - 🔗 **Ver post en LinkedIn**
  - ⛶ Pantalla completa
- Sin opciones de edición (ya está fuera y publicado)

Este es el ciclo completo: idea → conversación → generación
→ refinamiento → programación → publicación. Todo en una
sola conversación.

---

## 2.bis. Los tres arquetipos de card de publicación

La card de publicación NO es un molde único. Según la red de
destino, la IA produce uno de **tres arquetipos distintos**.
Comparten el mismo chasis (estados borrador/programado/
publicado, glow animado en borrador, toolbar de acciones,
auto-guardado en Biblioteca, drawer de programación), pero su
cuerpo cambia porque el contenido de cada red es distinto en
su naturaleza.

### Arquetipo A — Visual-first (Instagram, Facebook)

**Para qué redes:** Instagram y Facebook (feed). En V1, solo
formatos de feed: **imagen única o carrusel**. Sin Reels ni
Stories (los Reels caen en el arquetipo C).

**Qué cambia respecto al molde texto-first:** la imagen es
**la protagonista**, no un acompañante. El layout se invierte:
imagen grande arriba (en aspect ratio real de la red: 4:5 o
1:1 para IG feed), caption debajo.

**Estructura del cuerpo:**

- **Zona de imagen (protagonista):** preview grande de la
  imagen generada. Si es **carrusel**, se ven las slides con
  navegación (dots o flechas) y un contador "1/5". Cada slide
  es una imagen independiente que la IA generó o que el
  usuario subió.
- **Acciones de imagen siempre visibles en la card** (no
  escondidas en el panel): "🔄 Regenerar imagen", "🎨 Variar
  estilo", "➕ Agregar slide" (carrusel), "⬆️ Subir propia".
- **Caption:** el texto debajo, formateado como se ve en el
  feed. Con conteo de caracteres (IG ~2,200).
- **Hashtags:** bloque dedicado (IG vive de hashtags mucho más
  que LinkedIn).
- Preview fiel: avatar, nombre de usuario, imagen, caption
  truncado con "... más", iconos de like/comment/share.

**El panel lateral expandido para visual-first** pone la
sección de imagen/carrusel como centro de gravedad (ver
sección 3, "C) Media" actualizada).

### Arquetipo B — Guion de video corto (TikTok, Reels, YouTube Shorts)

**Para qué redes:** TikTok, Instagram Reels, YouTube Shorts.
Los tres comparten un solo arquetipo porque son el mismo
formato (video vertical corto).

**Decisión central:** Presencia **NO genera el video**. El
creator graba y sube. Presencia entrega un **paquete de
dirección creativa**. La "card" no tiene preview de video;
tiene el guion.

**Estructura del cuerpo (el paquete de guion):**

- **🎣 Hook (primeros 3 segundos):** la línea de apertura que
  decide si el video retiene o no. Es el campo más importante.
  La IA puede ofrecer 2-3 variantes de hook.
- **🎬 Guion por beats:** el desarrollo dividido en momentos/
  escenas, cada uno con la línea hablada y opcionalmente una
  nota de grabación ("plano cerrado", "texto en pantalla:
  '...'", "corte rápido aquí").
- **📝 Caption:** el texto que acompaña al video publicado.
- **#️⃣ Hashtags:** sugeridos para el formato y el nicho.
- **⏱️ Duración estimada** y **🎵 sugerencia de audio/tendencia**
  (nice-to-have, si Ritmo lo alimenta).

**Acciones propias de este arquetipo:** "🔄 Regenerar guion",
"🎣 Otras opciones de hook", "✂️ Acortar / alargar",
"📋 Copiar guion" (para tenerlo a mano al grabar).

**Lo que NO tiene:** preview visual del video (no hay video),
acciones de imagen. Cuando se programa, se programa el
**paquete + el archivo de video que el creator sube**; sin
video subido, queda en borrador esperando el material.

### Arquetipo C — Texto-first (LinkedIn, X, Threads)

**Para qué redes:** LinkedIn, X, Threads. Es exactamente la
card que ya estaba diseñada en este documento (el flujo de
ejemplo de Jose usa esta). Texto protagonista, imagen
opcional acompañante, preview tipo feed, conteo de caracteres,
tono detectado, tiempo de lectura.

**No requiere rediseño**, solo dejar de ser el molde único.

### Implicaciones transversales

**Al "Adaptar a varias redes":** si el usuario pide adaptar un
concepto a IG + TikTok + LinkedIn, la IA genera **tres cards
de arquetipos distintos** en la misma conversación (una
visual-first, una de guion, una texto-first). Esto es correcto
y deseable: cada red recibe el formato que le corresponde, no
un copy-paste. El agrupamiento multi-red en Calendario
(ver `presencia-calendario.md`) sigue funcionando igual: las
agrupa por concepto aunque sean arquetipos distintos.

**El estado vacío, las sugerencias y el streaming** son
idénticos entre arquetipos. Lo único que cambia es el cuerpo
de la card una vez generada.

---

## 3. Los componentes del Chat y su propósito

Ahora que entendés el flujo, vamos componente por componente
explicando por qué cada cosa está ahí.

### El input principal

**Qué es:** El campo donde el usuario escribe sus pedidos.

**Por qué está diseñado como "héroe visual":** En el estado
vacío del chat, el input es claramente el elemento más
grande y prominente. Tipografía grande, bordes generosos,
sombra sutil de elevación. Razón: el usuario nuevo necesita
una señal clara de dónde empezar. Si el input se ve igual
de pequeño que un mensaje normal de WhatsApp, el usuario
duda.

**Por qué es simple (no rich text):** Soporta texto plano,
adjuntos, transcripción y selector de estilo. Pero no
markdown, no formato visual, no slash commands. Razón: si
abrís la puerta al rich text, los usuarios empiezan a
"diseñar" sus prompts y se distraen del flujo conversacional.
ChatGPT y Claude.ai mantienen input simple por algo.

**La toolbar interna:**

- **Adjuntar archivo:** para mandar referencias (imágenes,
  PDFs, docs)
- **Transcribir audio:** para usuarios que prefieren dictar
- **Estilo de respuesta:** selector tipo Claude (Conciso,
  Explicativo, Creativo, etc.). Esto es DISTINTO de la voz
  de marca del usuario (que es fija). El estilo es ad-hoc
  por mensaje.

**El indicador de costo:** Cuando hay texto, aparece "≈ 2
créditos" sutil cerca del botón send. Razón: transparencia
sobre consumo sin ser invasivo. El usuario sabe lo que está
gastando antes de gastarlo.

### Las cards de sugerencias en el estado vacío

**Qué son:** Las 6 cards que aparecen debajo del input cuando
el chat está vacío.

**Por qué existen:** Para combatir la "blank page anxiety".
Cuando un usuario entra a una herramienta nueva y ve solo
un input vacío, no siempre sabe qué pedir. Las cards le dan
ideas concretas para arrancar.

**Por qué son una mezcla de fijas y dinámicas:**

- **4 fijas:** sugerencias evergreen que sirven siempre
  (ideas semanales, adaptar último post, calendario del mes,
  hilo viral)
- **2 dinámicas:** vienen del módulo Ritmo, marcadas con
  badge "🔥 Tendencia". Razón estratégica: integran
  cross-módulo sin obligar al usuario a navegar. El usuario
  ve oportunidades concretas sin tener que ir a buscarlas.

**Por qué solo 6 y no 12:** Demasiadas opciones generan
parálisis de elección. 6 es el sweet spot entre "tengo
opciones" y "no me abruma elegir".

### El chip de contexto de IA

**Qué es:** El chip sutil con texto _"🧠 Recordando tu voz
de marca, audiencia y posts recientes"_ debajo de las cards
de sugerencias.

**Por qué existe:** Comunica algo crítico que diferencia a
Presencia: la IA conoce al usuario. ChatGPT no sabe quién
sos, Presencia sí. Pero ese hecho es invisible si no se
comunica activamente. El chip lo hace visible sin ser
intrusivo.

**Por qué es clickeable:** Al hacer click se abre un popover
mostrando exactamente qué sabe la IA: tu voz de marca
configurada, audiencia objetivo, posts recientes que está
recordando, tendencias monitoreadas. Esta transparencia
genera confianza.

### Las cards de publicación

**Qué son:** El componente especializado donde la IA muestra
contenido generado para una red social específica. NO son
mensajes de chat normales.

> **Recordatorio:** la card tiene **tres arquetipos** según la
> red (visual-first, guion-de-video, texto-first). Ver sección
> 2.bis para el detalle. Lo que sigue abajo describe las
> propiedades comunes a los tres (estados, glow, auto-colapso,
> meta-información); el cuerpo concreto cambia por arquetipo.

**Por qué son diferentes a un bubble normal:** El bubble
normal de chat es para conversación (texto, ida y vuelta).
La card de publicación es para **contenido productivo**
(algo que el usuario va a publicar). Mostrar contenido
publicable como texto plano es subvalorarlo. Mostrar como
card con preview real eleva su jerarquía visual y comunica
"esto es importante, esto es valor del producto".

**Por qué tienen 3 estados visuales claramente diferenciados:**

**Borrador (glow border animado):** Comunica "esto está vivo,
recién nacido, puedes interactuar". El movimiento del glow
es identidad visual del producto. Solo aparece en este
estado.

**Programado (border sólido Icy Blue + banner):** Comunica
"esto ya está asentado, en tu pipeline". El border sólido
es lo opuesto del glow animado: estabilidad versus
maleabilidad.

**Publicado (border verde + opacidad reducida):** Comunica
"esto ya está completado, archivado". La opacidad reducida
(90%) lo aleja visualmente como diciendo "ya no requiere
acción".

Esta diferenciación es CRÍTICA. Sin ella, el usuario duda
sobre el estado de cada publicación. Con ella, el estado se
identifica en menos de 1 segundo sin leer texto.

**Por qué auto-colapsan cuando hay nuevas:** Si Jose itera
5 versiones de un post, no quiere ver las 5 expandidas en
su viewport. La más reciente queda expandida (es la activa).
Las anteriores se colapsan a un summary compacto,
recuperables con click. Esto mantiene el viewport limpio
en sesiones largas de iteración.

**Por qué tienen meta-información debajo del preview:** El
conteo de caracteres con indicador visual es funcional
(LinkedIn permite hasta 3000, X solo 280). El tono detectado
genera confianza ("la IA entendió qué tono quería"). El
tiempo de lectura es nice-to-have informativo.

### El panel lateral expandido

**Qué es:** El panel que se abre cuando el usuario hace
click en "⛶ Pantalla completa" en una card.

**Por qué existe:** Las cards inline son perfectas para
iteración rápida en el flujo conversacional. Pero hay
momentos donde el usuario quiere refinar a fondo (mejorar
hashtags, comparar variantes A/B, ajustar imagen). El panel
expandido le da más espacio y más herramientas sin perder
el contexto del chat.

**Por qué tiene 5 secciones específicas:** Cada sección
resuelve un sub-problema concreto:

- **A) Editor avanzado:** para ediciones de texto más finas
- **B) Hashtags inteligentes:** porque elegir hashtags es
  un sub-problema con su propia complejidad (estrategia de
  volumen vs nicho)
- **C) Media:** porque en el arquetipo visual-first (IG/FB)
  la imagen ES el contenido, no un adorno; gestionar imagen y
  carrusel es el flujo central, no un extra
- **D) Preview realista:** porque el contexto visual de
  cómo se ve realmente en la red cambia las decisiones de
  edición
- **E) Variantes A/B:** porque comparar es más eficiente
  que iterar linealmente

**Por qué el chat se mantiene visible cuando se expande:**
Para mantener continuidad. Si el panel ocupara 100% de la
pantalla (como un modal fullscreen), el usuario perdería
contexto de la conversación. Mantener el chat al ~40% del
ancho a la izquierda preserva el contexto sin sacrificar
el espacio de edición.

### Los steps de tool calls

**Qué son:** Los mensajes sutiles que aparecen durante el
streaming, indicando qué hace la IA internamente. Ejemplos:

- 🧠 Accediendo a tu voz de marca...
- 📊 Analizando posts que funcionaron antes...
- 🔍 Revisando tendencias en tu nicho...

**Por qué existen:** Transparencia estratégica. La IA está
haciendo trabajo real y diferenciado (no solo generando
texto random como ChatGPT). Pero ese trabajo es invisible
si no se comunica. Los steps lo hacen visible.

**Por qué son sutiles y no protagonistas:** Si los steps
fueran muy prominentes, distraerían del contenido real (la
respuesta de la IA). Son sutiles para que estén ahí cuando
el usuario los nota, pero no le roben atención cuando no.

**Por qué son automáticos y no manuales:** La IA invoca las
tools internamente según necesidad. El usuario no las
selecciona como features. Esta abstracción es intencional:
si expusiéramos cada tool como botón, el usuario tendría
que decidir cuál usar. Mejor que la IA decida y le muestre
qué hizo.

### El streaming con typewriter effect

**Qué es:** El efecto de la respuesta apareciendo letra por
letra a velocidad natural durante la generación.

**Por qué no aparece todo de golpe:** Estudios de UX
muestran que el streaming hace que la respuesta se sienta
más "humana" y menos como un dump de información. También
permite al usuario empezar a leer antes de que termine de
generarse.

**Por qué la velocidad es "natural" y no super rápida:** Si
fuera muy rápida, perdería el efecto. Si fuera muy lenta,
sería frustrante. El sweet spot es velocidad de lectura
humana relajada.

**Por qué siempre hay un botón "Detener":** Respeto al
usuario. Si ya entendió hacia dónde va la respuesta, no
queremos forzarlo a esperar. Detener mantiene lo generado
hasta el momento. El usuario puede pedir continuar o
seguir conversando con eso.

### El drawer de programación

**Qué es:** El panel que se abre al hacer click en
"Programar" en una card.

**Por qué es drawer y no modal:** Un modal flotante con
backdrop oscuro bloquea la conversación detrás. Un drawer
lateral mantiene la conversación visible al fondo. Menos
fricción, más continuidad. En mobile se convierte en bottom
sheet por razones de UX táctil.

**Por qué incluye preview de la semana:** Para evitar
sorpresas. Si Jose va a programar para el martes pero el
martes ya tiene 4 posts, mejor que lo sepa antes de elegir.
El preview de la semana hace visible el contexto temporal.

**Por qué muestra horarios óptimos del Ritmo:** Esta es la
integración cross-módulo más valiosa del producto. El
usuario está en el momento de decisión ("¿qué hora?") y le
mostramos data accionable ("18:00 tiene +18% engagement
para ti"). Sin esta integración, el usuario tendría que ir
a Ritmo, ver sus mejores horarios, volver a Calendario,
programar. Con esta integración, ese flujo se reduce a un
click.

**Por qué multi-red tiene toggle "mismo horario /
personalizar":** Para no forzar al usuario simple a
complejidad innecesaria. Default = mismo horario (fácil).
Quien quiere personalizar (caso de creators avanzados que
saben que LinkedIn tiene mejor hora distinta a Instagram),
puede expandir y configurar individualmente.

### Las sugerencias post-programación

**Qué son:** Las mini-cards que aparecen después del mensaje
de confirmación de la IA tras programar exitosamente.

**Por qué existen:** Para mantener al usuario en flow. Si
programaste un post de LinkedIn, hay próximos pasos
naturales: hacerle teaser para Stories, adaptarlo a X,
programar más posts para mantener ritmo. La IA proactivamente
los sugiere.

**Por qué NO son bloqueantes:** Aparecen como invitaciones,
no como obstáculos. El usuario puede ignorarlas y seguir
chateando, o cerrar el chat. **No queremos forzar
conversiones**, queremos facilitar acciones lógicas si el
usuario las quiere.

**Por qué son contextuales y no fijas:** Las opciones varían
según qué se programó. Si fue LinkedIn, sugiere Twitter. Si
fue fin de semana, sugiere planificar siguiente semana. La
relevancia contextual hace que se sienta inteligente, no
spam.

### El indicador de canales en chats recientes

**Qué es:** Los iconos pequeños al lado del título de cada
chat en la sección Recientes del sidebar.

**Por qué existen:** Comunican la promesa central del
producto (multi-canal unificado) en cada chat de la lista.
Es identidad visual del producto, no solo info funcional.

**Por qué máximo 2 visibles + número:** Mostrar todos los
canales saturaría visualmente. Mostrar solo uno no comunica
la naturaleza multi-canal. Dos + número es el balance entre
informativo y limpio.

### Las carpetas tipo Projects

**Qué son:** Las carpetas del sidebar que agrupan chats.
Pero NO son solo agrupaciones visuales — comparten contexto
entre los chats que contienen.

**Por qué tienen contexto compartido:** Para CMs freelance
(persona secundaria), cada cliente requiere su propia voz,
documentos de referencia, instrucciones. Las carpetas con
contexto compartido permiten que todos los chats dentro de
una carpeta usen automáticamente ese contexto sin tener que
explicarlo de nuevo cada vez.

**Por qué se llaman "Carpetas" y no "Projects":** Naming
descriptivo. "Carpetas" es entendido por cualquier usuario.
"Projects" es un concepto técnico que requiere aprendizaje.
Internamente se comportan como projects, pero externamente
se llaman carpetas.

**Qué pueden contener:**

- Documentos de referencia (PDFs, imágenes, briefs)
- Instrucciones personalizadas (system prompt específico
  por carpeta)
- Memoria persistente entre chats (V2)

### El banner de contexto en conversaciones de carpeta

**Qué es:** El banner sutil que aparece arriba del primer
mensaje cuando una conversación está dentro de una carpeta
con contexto.

**Por qué existe:** Para que el usuario sea consciente de
qué contexto está usando esta conversación. Sin este banner,
si Jose creó un chat dentro de "Cliente Acme", podría
olvidar que tiene contexto activo y confundirse cuando la
IA aplica el tono específico de ese cliente.

**Por qué es expandible:** Click muestra qué exactamente
tiene la carpeta (docs, instrucciones). Transparencia
total.

---

## 4. Estados especiales y por qué importan

### Sin créditos suficientes

**El estado:** El usuario quiere enviar un mensaje pero su
balance de créditos es 0.

**El diseño:** Modal pequeño centrado (bloqueante, porque
necesita acción). Tono empático no técnico: "Te quedaste
sin créditos" en lugar de "Error: insufficient balance".
Visual con icono Lucide pero NO rojo agresivo. Botones
claros: "Ver opciones de upgrade" o "Esperar al próximo
ciclo".

**Por qué este diseño:** Los errores de pago/límites son
momentos delicados. Un error técnico frío ("Error 402")
hace que el usuario sienta que la app es hostil. Un mensaje
empático con opciones claras lo hace sentir que la app
está de su lado.

### Banner proactivo de créditos bajos

**El estado:** El usuario tiene menos del 20% de créditos
restantes pero aún puede usar la app.

**El diseño:** Banner sutil arriba del input. Tinte Blush
Pop suave. NO bloquea conversación. Texto: "Te quedan 28
créditos este mes." con link "Ver plan".

**Por qué este diseño:** Avisar antes de bloquear es mejor
UX que sorprender. El usuario puede decidir upgradear
preventivamente o seguir consumiendo. Si lo agarra de
sorpresa al llegar a 0, se siente engañado.

**Por qué descartable:** El banner es descartable pero
vuelve a aparecer en thresholds más urgentes (10%, 5%).
Respeta la elección del usuario pero protege contra
distracciones.

### Sin internet

**El estado:** Se cae la conexión durante una conversación.

**El diseño:** Banner system arriba del área de contenido.
Tinte gris neutro o Icy Blue suave. NO un modal bloqueante.
El input sigue funcionando (se puede escribir). Los
mensajes intentados se quedan en estado "pendiente" con
icono Lucide clock.

**Por qué este diseño:** Cortar la app por falta de internet
es agresivo. Mejor mantenerla usable y queue los mensajes
para cuando vuelva la conexión. Al restaurarse, los
mensajes pendientes se envían automáticamente y el banner
cambia a "Conexión restaurada" con check verde antes de
desaparecer.

### IA falló

**El estado:** Error técnico en el backend al generar
respuesta.

**El diseño:** Card sutil tipo "alert" donde aparecería la
respuesta. NO modal bloqueante. Texto: "Algo no salió como
esperábamos" + botón "🔄 Reintentar".

**Por qué este diseño:** Es importante que el mensaje del
usuario NO se pierda. Sigue visible en el chat. El reintento
es fácil. Si vuelve a fallar, el mensaje se vuelve más
descriptivo ("Sigue sin funcionar. Intenta en unos minutos.").

### Canal desconectado

**El estado:** El usuario quiere programar para LinkedIn
pero LinkedIn no está conectado en su cuenta.

**El diseño:** Modal pequeño centrado (bloqueante porque
impide la acción). Tono no punitivo: "Necesitás conectar
LinkedIn primero". Botones claros: "Conectar LinkedIn
ahora" (lleva a configuración) o "Programar solo para
[otras redes conectadas]" o "Cancelar".

**Por qué este diseño:** Convertir un error en una
oportunidad de configurar. No solo decir "no se puede",
sino "no se puede pero acá está cómo solucionarlo".

### Adjunto muy grande

**El estado:** El usuario intenta adjuntar un archivo que
excede el límite (ej: 25 MB).

**El diseño:** Toast tipo warning sutil donde está el input.
NO bloquea. Auto-desaparece en 5-7 segundos. Texto: "Este
archivo es muy grande. El límite es 25 MB. Tu archivo pesa
38 MB. Probá comprimirlo."

**Por qué este diseño:** Es un error simple, no requiere
modal. Toast es suficiente. Y damos contexto útil (el
límite específico, el tamaño actual del archivo) para que
el usuario pueda resolver fácil.

### Programación fallida (conflicto)

**El estado:** El horario elegido conflictúa (ya pasó, u
otro post programado a la misma hora).

**El diseño:** Banner sutil DENTRO del drawer de
programación. Texto: "Ya tienes un post programado a esta
hora" o "Este horario ya pasó". Sugerencia inline: "¿Programar
para 18:30 en su lugar?" con botón directo.

**Por qué este diseño:** El error aparece donde el usuario
está (dentro del drawer), no como modal externo. La
sugerencia automática reduce fricción: en lugar de decir
"elegí otro horario", la app sugiere uno alternativo y el
usuario decide con un click.

---

## 5. Decisiones de producto importantes

### Por qué el saludo personalizado tiene variantes

El subtítulo del saludo no es fijo. Cambia según contexto:

- _"¿Qué quieres publicar hoy?"_ (default)
- _"Tienes 3 posts programados esta semana"_ (momentum)
- _"Hace 2 días que no creas contenido"_ (inactividad)

Razón: comunicar awareness del estado del usuario sin
sentirse robot. Si siempre dice "¿Qué quieres publicar hoy?",
se siente genérico. Si varía según contexto, se siente como
una herramienta que está prestando atención.

### Por qué guardar en biblioteca es automático

Cada publicación generada se guarda automáticamente en
Biblioteca sin que el usuario haga click en "Guardar". La
card muestra un indicador sutil "✓ Guardado en Biblioteca".

Razón: reduce fricción. La biblioteca es repositorio total,
no curado. Si el usuario quiere borrar algo, puede hacerlo
desde Biblioteca. Pero por default todo se guarda. Esto
respeta la promesa "todo lo creado vive en un solo lugar".

### Por qué cancelar programación tiene undo pero eliminar conversación NO

- **Cancelar programación:** acción reversible y de bajo
  impacto. Toast con "Deshacer" por 5 segundos.
- **Eliminar conversación:** acción destructiva mayor. Modal
  de confirmación claro.

Razón: ajustar el nivel de fricción al nivel de impacto.
Una cancelación equivocada se puede deshacer; una
eliminación, no fácilmente. El UX debe proteger contra
errores graves pero no obstaculizar errores menores.

### Por qué el chat temporal existe

Es un modo donde la conversación NO se guarda. Útil para
experimentos rápidos sin contaminar el historial. Marcado
visualmente con banner claro: "🕵️ Chat temporal — esta
conversación no se guardará".

Razón: como tab incógnito del navegador. A veces el usuario
quiere probar algo random ("¿qué pasa si le pido a la IA
que me hable como Yoda?") sin que ese chat aparezca en sus
recientes. El chat temporal lo permite.

### Por qué los chats archivados existen separados de eliminados

Archivado = oculto pero recuperable. Eliminado = permanente.

Razón: los usuarios power tienen muchos chats. Algunos
quieren "limpiar" su lista sin perder historia. Archivar
es el punto medio: desaparece del flujo principal pero
sigue accesible desde la vista "Archivados".

---

## 6. Lo que conscientemente NO incluye el Chat

- **Compartir conversaciones por URL.** Útil para
  colaboración pero no core. V2.
- **Tools explícitas como botones.** La IA invoca tools
  internamente y muestra steps. No exponemos tools como
  features que el usuario selecciona.
- **Memoria persistente granular.** En V1, la IA "recuerda"
  según contexto general. Granularidad fina (qué recordar,
  qué olvidar) llega en V2.
- **Modo voz interactivo (conversación bidireccional por
  audio).** En V1 solo transcripción de audio a texto.
- **Generación de video con IA.** Para TikTok/Reels/Shorts
  (arquetipo B), Presencia entrega guion, hook, caption y
  hashtags; el creator graba y sube el video. No generamos
  el video con IA en V1 (caro, lento, calidad dudosa). V2 si
  se valida.
- **Generar imágenes como acción suelta sin contexto de post.**
  La generación de imagen SÍ es central y de cara al usuario
  (es ciudadano de primera clase en el arquetipo visual-first:
  regenerar, variar estilo, carrusel, subir propia). Lo que NO
  hay es un "generador de imágenes" genérico desligado de una
  publicación; la imagen siempre vive dentro de una card de
  publicación, no como herramienta suelta tipo Midjourney.

---

## 7. Cómo se integra el Chat con el resto del producto

**Con Calendario:** Las cards programadas tienen link "Ver
en calendario" que lleva al post resaltado. El drawer de
programación muestra preview de la semana del calendario.

**Con Ritmo:** El drawer de programación sugiere horarios
óptimos basados en data del Ritmo. Las 2 cards dinámicas
del estado vacío vienen de las tendencias del nicho
monitoreadas por Ritmo.

**Con Analíticas:** Los posts publicados (estado publicado
de las cards) tienen link "Ver estadísticas" que lleva a
Analíticas con ese post resaltado.

**Con Biblioteca:** Todas las publicaciones generadas se
guardan automáticamente. Las imágenes generadas viven en
Biblioteca.

**Con Configuración (Voz de marca):** La voz configurada en
Configuración alimenta TODO el output del Chat. El chip de
contexto "🧠 Recordando tu voz de marca" tiene link a
"Editar voz de marca" en Configuración.

Este nivel de integración es lo que hace que Presencia se
sienta como un producto coherente y no como módulos sueltos.
