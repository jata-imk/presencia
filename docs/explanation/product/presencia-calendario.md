# Presencia — Módulo Calendario

> Este documento describe el control temporal de Presencia:
> el módulo Calendario. Cubre QUÉ hace, POR QUÉ está diseñado
> así, y CÓMO se siente usarlo. Para entender el producto a
> nivel macro, leer primero `presencia-overview.md`. Para
> entender el módulo Chat (de donde nacen las publicaciones
> que viven en Calendario), leer `presencia-chat.md`.

---

## 1. Qué es el módulo Calendario y por qué importa

### Su rol en el producto

Si el Chat es el corazón creativo de Presencia (donde nace
el contenido), el Calendario es el **control temporal**. Es
donde el usuario ve qué se publica cuándo, gestiona los
borradores que aún no programó, y ajusta su pipeline
editorial cuando algo cambia.

El Calendario responde una pregunta concreta y operativa:
_"¿qué pasa esta semana?"_. No es una pregunta filosófica,
no es estratégica, es práctica. El creator necesita poder
contestarla en menos de 5 segundos abriendo el módulo. Si
tarda más, el módulo falló.

### Su diferencia con Ritmo y Analíticas

Es importante entender por qué Calendario, Ritmo y Analíticas
son módulos distintos, porque a primera vista pueden parecer
solapados:

- **Ritmo** mira hacia adelante. Es estrategia: cuántos posts
  por semana, mejores horarios, tendencias del nicho.
  Responde _"¿cuándo y sobre qué debería publicar?"_.
- **Analíticas** mira hacia atrás. Es evaluación: qué funcionó,
  qué no, comparativas entre plataformas. Responde
  _"¿cómo me fue?"_.
- **Calendario** está en el medio. Es el "ahora y lo que
  viene ya agendado". No estratégico ni evaluativo, sino
  operativo.
  Son tres verbos distintos del flujo de trabajo. Si los
  fusionáramos en un solo módulo, el usuario tendría que cargar
  mentalmente tres modos al mismo tiempo cada vez que entra.
  Separarlos en módulos distintos respeta la cognición del
  usuario.

### El problema específico que resuelve

Cuando un creator genera contenido en Chat, programa varios
posts a lo largo de los días, y vive su vida normal, llega
un momento en que necesita responder preguntas operativas:

1. ¿Qué tengo programado esta semana?
2. ¿Hay algún hueco que debería llenar?
3. ¿Algo se está superponiendo a la misma hora?
4. ¿Cuántos posts llevo en LinkedIn este mes?
5. Necesito mover el post del jueves al viernes, ¿cómo?
   Sin un Calendario, todas estas preguntas son inrespondibles
   o requieren navegar por mil chats viejos para reconstruir el
   panorama. El Calendario las contesta de un vistazo.

### La filosofía: el Calendario NO crea contenido

Esta es una decisión central del módulo, no un detalle
técnico. El Calendario tiene la tentación natural de
convertirse en una herramienta de creación rápida ("hacé
click en un día vacío y escribí ahí"). Pero conscientemente
decidimos que NO.

**Razón:** Presencia tiene un solo motor de creación, que es
el Chat. Si dejáramos que el Calendario también cree
contenido, terminaríamos con dos motores de creación
sincronizados a la fuerza (monolito moderno con doble
implementación de lo mismo). Cualquier feature nueva del
Chat tendría que portarse al Calendario y viceversa. Es la
receta para que el producto se vuelva imposible de mantener.

En cambio, cuando el usuario quiere crear desde el Calendario,
el Calendario lo deriva al Chat con la fecha precargada en
el contexto. Una sola fuente de creación, todos los demás
módulos son satélites.

---

## 2. Cómo se siente usar el Calendario: un flujo completo

Para entender el módulo, lo mejor es seguir un flujo completo
de un usuario real. Vamos con Jose, el founder, que ya
generó varias publicaciones esta semana en Chat y abre el
Calendario para revisar y ajustar.

### Jueves a la tarde, Jose abre el Calendario

Click en "Calendario" en el sidebar. El módulo carga.

**Lo que ve Jose:**

La toolbar arriba muestra el selector de vista en **Mes**
(que es el default), el navegador temporal con "Octubre
2025" en el centro, un botón "Hoy", el icono de filtros, y
a la derecha el botón prominente "+ Crear" en color de marca.

Debajo de la toolbar, una barra fina con el indicador de
cadencia del Ritmo:

> LinkedIn: ●●●○○ 3/5 esta semana · Instagram: ●●○○ 2/4 · X: ●○○ 1/3

Tres puntos llenos en LinkedIn, dos en Instagram, uno en X.
Los colores son verdes suaves: vamos a tiempo. Si Jose
hubiera estado atrasado, alguno aparecería en ámbar. Nunca
en rojo agresivo — esto es información, no castigo.

A la izquierda, el panel de borradores está expandido (porque
Jose tiene 12 borradores pendientes). Es una lista vertical
de mini-cards: borradores que creó en chats pero no programó
todavía. Cada uno con su red, primeras líneas de texto,
timestamp relativo.

En el centro, la grilla del mes: 7 columnas, 5 filas. Cada
celda es un día. Algunos días tienen 1 post, otros 2 o 3,
algunos están vacíos. El día de hoy (jueves) destacado con
un círculo Plum alrededor del número. Algunos posts ya están
publicados (border verde + opacidad reducida), otros
programados (border Icy Blue), otros aún en borrador con su
gradiente sutil.

Hay un día — martes 22 — donde Jose ve algo distinto: **tres
filas con un border-left común Pink Orchid continuo**, cada
una con un mini-icono de cadena al lado de la hora. Las tres
muestran "18:00" como horario. Es una publicación multi-red
que Jose programó: el mismo concepto saliendo en LinkedIn,
Instagram y X simultáneamente. El border común comunica de
un vistazo: _"estas tres están conectadas"_.

### Jose inspecciona el viernes

Quiere ver qué tiene programado mañana. Hace click en la
celda del viernes (en cualquier parte que no sea un post
específico).

**Lo que pasa:**

Se abre un panel lateral derecho que se superpone sobre la
grilla, con backdrop sutil oscureciendo el resto. Ancho
~420px.

**Header del panel:**

- "Viernes 24 de octubre"
- Debajo, en menor jerarquía: "Mañana"
- Botón X arriba a la derecha
- Botón primario "+ Crear para este día" prominente, debajo
  del título
  **Cuerpo del panel:**
  Lista de mini-cards de los posts del día ordenados por hora
  ascendente. Cada una con:
- Hora prominente a la izquierda ("10:00", "14:00", "18:00")
- Icono oficial de la red
- Badge de estado
- 2-3 líneas del texto del post
- Thumbnail de imagen si tiene
- Carpeta de origen si aplica ("De: Cliente Acme")
- Menú contextual (icono ⋮) con opciones: Ver, Editar en
  Chat, Reprogramar, Cancelar programación
  Jose ve que tiene 4 posts el viernes. Todo bien, salvo uno
  que recuerda haber querido revisar.

### Jose hace click en "Ver" de uno de los posts

Click en el menú contextual del post de las 14:00. Click en
"Ver".

**Lo que pasa:**

Se abre un modal centrado en pantalla. Backdrop oscuro sobre
todo (incluyendo el panel del día detrás). Ancho ~680px,
border-radius generoso.

El modal muestra la **card de publicación completa**,
idéntica a como se vería en Chat:

- Header con icono LinkedIn + nombre + badge "Programado"
- Indicador "✓ Guardado en Biblioteca" a la derecha
- Banner Icy Blue: "📅 Programado para viernes 24 de octubre
  a las 14:00"
- Preview real del post con avatar de Jose, su nombre,
  headline, el texto formateado, los iconos de like/comment/
  share como elementos visuales
- Border sólido Icy Blue
- Franja de meta-información: 1,243 / 3,000 caracteres,
  "Tono: Profesional · Educativo · Cercano", "~2 min lectura"
  **Footer del modal:**
  [Reprogramar] [Cancelar programación] [Editar en Chat] [Cerrar]

Jose lee el post, le gusta, y cierra el modal con Esc. Vuelve
al panel del viernes sin perder el contexto.

### Jose decide mover un post

Recordó que el lunes tiene una reunión a las 18:00 y no va
a poder responder comentarios. El post que tiene programado
ese día a esa hora debería moverse al martes.

Cierra el panel del viernes. Mira la grilla del mes. Ve el
post del lunes 27 a las 18:00.

Acá viene el momento mágico del módulo. Jose **agarra el
post del lunes con el mouse** y empieza a arrastrarlo.

**Lo que pasa visualmente:**

- En la posición original (celda del lunes): el post baja a
  opacidad ~50%, claramente "siendo movido"
- Aparece un **fantasma del post** flotante siguiendo el
  cursor — mini-card con sombra suave, ligera rotación de
  2-3° para sensación de "agarrado"
- Los días válidos como destino se marcan con highlight
  sutil: border punteado Pink Orchid + fondo levemente
  coloreado
- El día específicamente bajo el cursor tiene highlight más
  fuerte
- Los días en el pasado tienen overlay tenue gris + cursor
  "not-allowed"
  Jose mueve el cursor hacia el martes 28. La celda del martes
  se ilumina con highlight Pink Orchid. Suelta.

**Lo que pasa al soltar:**

- El post aparece instantáneamente en el martes 28 con un
  **flash visual breve** (highlight Pink Orchid que se
  desvanece en ~1 segundo)
- El lunes 27 queda vacío en esa hora
- Toast en bottom-right con icono check verde:

> ✓ Reprogramado para martes 28 a las 18:00
> [Deshacer]

El toast tiene una barra de progreso sutil indicando los 5
segundos disponibles para deshacer. Si Jose se arrepiente,
un click y vuelve el post a su posición original.

**Por qué este flujo es importante:** la acción de reprogramar
es la más común del módulo, y el drag-and-drop la hace
sentir casi gratis. Sin drag, el usuario tendría que abrir
un menú, elegir "Reprogramar", abrir un selector de fecha,
elegir nuevo día, confirmar. 5 clicks. Con drag, 1 gesto.

### Jose intenta mover otro post y aparece un conflicto

Anima al éxito, Jose decide mover también un post de
LinkedIn que tiene el miércoles 15 a las 12:00. Lo arrastra
hacia el jueves 16.

Cuando suelta sobre el jueves, **la celda del jueves se
ilumina ámbar** en lugar de Pink Orchid (señal visual
durante el hover de que algo no estaba del todo bien). Al
soltar, aparece un modal pequeño inline cerca del jueves:

> ⚠️ **Conflicto de horario**
>
> Ya tenés un post de LinkedIn a las 12:00 este día.
>
> ¿Programar a las 12:30 en su lugar?
>
> [Cambiar hora a 12:30] [Elegir otra hora] [Cancelar]

Jose hace click en "Cambiar hora a 12:30". El post se mueve,
ahora a las 12:30, y todo queda zanjado.

**Por qué este flujo es importante:** la app detecta el
conflicto pero no lo trata como error punitivo. Le sugiere
proactivamente una solución alternativa. Jose podría haber
elegido otra hora, pero la opción más rápida ya está ahí.
Es el principio de "no solo decir que no se puede, sino cómo
solucionarlo" aplicado a la programación.

**Definición técnica de conflicto:** mismo horario en la
**misma red**. Publicar en LinkedIn e Instagram a las 18:00
del mismo día **NO es conflicto** — eso es multi-canal sano.
Mismo día misma red a horas distintas tampoco es conflicto.

### Jose explora un día vacío

Sigue revisando. Ve que el sábado 25 está completamente
vacío. Hace click en la celda.

**Panel del día se abre con la variante "día vacío":**

- Header: "Sábado 25 de octubre" / "En 2 días"
- Botón "+ Crear para este día" prominente
- Cuerpo:
  - Mensaje: _"Sin publicaciones este día"_
  - Subtítulo: _"Estos son tus mejores horarios según tu Ritmo:"_
  - Chips clickeables con horarios sugeridos:
    - "10:00 · LinkedIn · +18% engagement"
    - "12:00 · Instagram · Buen horario"
    - "18:00 · LinkedIn · 🔥 Top horario"
    - "20:00 · X · +12%"
  - Link sutil abajo: "Ver tu estrategia de Ritmo →"
    Jose decide aprovechar el sábado. Click en "+ Crear para
    este día".

**Lo que pasa:**

El Calendario lo deriva al módulo Chat. Se abre un chat
nuevo con la fecha del sábado 25 precargada en el contexto
(sin hora específica — la hora se decide más adelante cuando
programe, en el drawer de programación de Chat como siempre).

El chat ya está esperando con un placeholder tipo: _"Crear
contenido para sábado 25 de octubre"_. Jose escribe su idea,
la IA genera la card de publicación, Jose la programa, y
cuando vuelve al Calendario el post ya está en su lugar.

**Por qué este flujo es importante:** la frontera entre
Calendario y Chat queda clara. El Calendario detecta el
hueco y propone llenarlo. Chat hace la creación. Una sola
fuente de creación, una sola fuente de programación, todo
conectado pero sin solapamientos.

### Jose programa un borrador con drag desde el panel izquierdo

Mira el panel de borradores a la izquierda. Tiene un borrador
de Instagram que recuerda haber escrito hace tres días y
nunca programó.

Lo agarra del panel y lo arrastra hacia el domingo 26 a las
18:00 (en vista mes el horario se asume, después se confirma).

Al soltar, en lugar de programarlo inmediatamente, se abre
el **drawer de programación de Chat** (el mismo componente
que existe en Chat) con la fecha precargada en domingo 26.
Jose elige la hora exacta (las 18:30, eligiendo de los
chips de mejores horarios), confirma.

El borrador desaparece del panel izquierdo (ya no es borrador,
ahora es post programado) y aparece en la celda del domingo
con el lenguaje visual de programado.

**Por qué este flujo es importante:** el panel de borradores
es la "bandeja de entrada editorial". Cosas que Jose creó
pero que no decidió cuándo publicar. Convertir un borrador
en programado es uno de los flujos más comunes de un creator,
y el drag desde el panel hace que ese flujo sea físicamente
satisfactorio.

### Jose cambia de vista

Quiere ver con más detalle qué tiene la semana que viene.
Click en el selector de vista, elige **Semana**.

**La vista cambia:**

- 7 columnas (Lun a Dom)
- Eje vertical de horas (6:00 a 23:00 visibles)
- Posts representados como bloques posicionados según su
  hora exacta
- Bandas de fondo levemente coloreadas en las franjas top
  del Ritmo (sin saturar, son ambientales)
  El martes a las 18:00 aparece el grupo multi-red con un
  **header del grupo** arriba de los bloques: un mini-contenedor
  con icono de cadena Pink Orchid. Sin labels (espacio reducido
  en esta vista). Los 3 bloques debajo, conectados con el
  border-left común Pink Orchid.

Si Jose quiere ver aún más detalle, click en vista **Día**:

- Una sola columna grande para el día seleccionado
- Posts del día como mini-cards más ricas, con preview de
  imagen y acciones rápidas
- Banda lateral derecha con chips de horarios óptimos del Ritmo
- El grupo multi-red aparece con su contenedor completo y
  header con acciones bulk: "[Reprogramar todas] [Cancelar
  todas]"
  Las tres vistas hablan el mismo idioma visual, solo cambia
  la densidad de información mostrada. Mes para visión macro
  del pipeline, semana para visión de cadencia operativa, día
  para foco profundo.

### Jose filtra por carpeta de cliente

Como CM, Jose maneja varias carpetas (que son tipo Projects,
no solo agrupaciones — ver `presencia-overview.md`). Cada
carpeta es un cliente distinto.

Click en el icono de filtros en la toolbar. Se abre un
popover con tres grupos de filtros:

- **Carpeta/Cliente:** lista de carpetas + opción "Todas"
- **Red social:** multi-select con todas las redes conectadas
- **Estado:** chips para Borrador, Programado, Publicado
  Jose elige solo "Cliente Acme" en carpetas. La grilla se
  actualiza: solo aparecen los posts de Acme. El contador del
  botón filtros pasa a "Filtros · 1". El panel de borradores
  también se filtra: solo borradores de Acme.

Esto es crítico para el CM. Sin esta vista filtrada, el
calendario sería ruido inservible mezclando todos los
clientes en una sola grilla. Con el filtro, cada cliente
tiene su pipeline visible y limpio.

### El cierre del flujo

En 5 minutos de uso, Jose revisó su semana, reprogramó dos
posts (uno por drag, otro por click), resolvió un conflicto
de horario, llenó un hueco creando contenido nuevo, y
filtró por cliente. Todas las acciones operativas que un
creator necesita hacer todos los días, hechas con la mínima
fricción posible.

Eso es el módulo Calendario.

---

## 3. Los componentes del Calendario y su propósito

Ahora que entendés el flujo, vamos componente por componente.

### La toolbar del Calendario

**Qué es:** la barra superior del módulo, debajo del topbar
del App Shell.

**Qué contiene (izquierda a derecha):**

- Selector de vista (Mes / Semana / Día) tipo segmented control
- Navegador temporal (chevron · etiqueta del periodo · chevron)
- Botón "Hoy" para volver al periodo actual
- Botón Filtros con contador de filtros activos
- Botón "+ Crear" prominente
  **Por qué el selector de vista es segmented control:** las
  tres vistas son mutuamente excluyentes (no podés estar en
  mes y día al mismo tiempo). Segmented control es el patrón
  estándar para esta interacción y comunica claramente que
  hay 3 opciones, no 12.

**Por qué "+ Crear" está acá y no en otro lado:** el botón
de crear contenido es la acción más deseable del producto,
como ya pasaba en Chat. Hacerla siempre accesible desde la
toolbar es estratégico. Acá específicamente, click en
"+ Crear" abre un chat nuevo SIN fecha precargada — es el
atajo equivalente a "Nuevo chat" del sidebar. La fecha
precargada solo aparece cuando se accede vía "+ Crear para
este día" desde el panel del día.

### El indicador de cadencia

**Qué es:** la barra fina debajo de la toolbar con la
cadencia semanal por red.

**Por qué existe:** la cadencia es uno de los datos más
importantes para un creator. Saber "voy 3 de 5 en LinkedIn
esta semana" le dice si va a tiempo o no. Sin esta
información visible, el creator se entera tarde y termina
publicando 5 posts el domingo a la noche para "completar la
cadencia", lo cual es pésima estrategia.

**Por qué es sutil y no protagonista:** es información
ambiental, no acción. El usuario la mira de reojo, no la
mira fijo. Si fuera muy prominente, competiría visualmente
con la grilla del mes que es lo que el usuario realmente
quiere ver.

**Por qué los colores son verde y ámbar pero nunca rojo:**
porque esto es información, no error. Rojo es para errores
y warnings críticos. Atrasarse en la cadencia no es un
error — es información útil que el creator puede o no
accionar. Ámbar es el tono perfecto: "ojo con esto" sin
"esto está mal".

**Por qué solo aparece en vista mes y semana:** en vista día
no tiene sentido medir cadencia (un día no es una semana).
Sumar el indicador en vista día sería ruido sin valor.

### El panel de borradores (lateral izquierdo)

**Qué es:** repositorio de las publicaciones creadas en
Chat que aún no tienen fecha programada. Es la "bandeja de
entrada editorial".

**Por qué existe:** un creator genera contenido en rachas
(cuando tiene inspiración). No todo lo que genera lo
programa inmediatamente — a veces quiere "dejarlo madurar"
o esperar a tener varios borradores juntos para planificar
la semana. Sin un repositorio de borradores, esas
publicaciones se pierden en chats viejos.

**Por qué está a la izquierda y no a la derecha:** el flujo
de lectura en occidente es izquierda a derecha. La izquierda
es el "origen" mental (de dónde vienen las cosas). El
calendario es el "destino" (donde se acomodan). Tener los
borradores a la izquierda + grilla a la derecha respeta
esta direccionalidad mental.

**Por qué es draggeable desde ahí:** porque programar un
borrador es **el flujo más común** del módulo. Si tener que
hacerlo requiriera abrir un menú, elegir "Programar", abrir
selector de fecha, etc., sería 5 clicks. Con drag desde el
panel a un día, es 1 gesto.

**Por qué se colapsa a rail:** cuando el usuario ya está
enfocado en la grilla y no necesita el panel, ocupar 280px
de ancho permanentemente es desperdicio. El rail (~48px)
con un contador de borradores ("12") permite que el usuario
sepa cuántos tiene pendientes sin sacrificar espacio.

**Por qué se llama "Borradores" y no "Inbox" o "Pendientes":**
naming descriptivo. Borrador es una palabra que cualquier
usuario entiende sin explicación. Inbox suena técnico,
pendiente suena a obligación.

### La grilla del mes

**Qué es:** la vista por defecto del módulo. 7 columnas ×
5-6 filas con cada celda representando un día.

**Por qué es vista mes default (no semana):** después de
discutir, decidiste que la vista mes da el sentido de
"pipeline" mejor que la vista semana. La vista mes te
permite ver de un vistazo cómo viene todo el panorama.
Semana es para zoom-in, mes es para overview.

**Por qué cap de 3 posts visibles por celda + chip "+N más":**
si mostraras todos los posts de un día con 8 publicaciones
en una celda chica del mes, sería ilegible. 3 es suficiente
para dar idea de la densidad sin saturar. El chip "+N más"
comunica "hay más" sin ocultar el dato.

**Por qué las celdas son clickeables como un todo:** click
en cualquier parte de la celda (que no sea un post
específico) abre el panel del día. Esto incluye click en el
número del día, en el espacio vacío entre posts, en el chip
"+N más". Toda el área es invitación a "ver este día".

**Por qué click en un post específico abre el modal "Ver"
en lugar del panel del día:** intención específica vs
intención general. Si hacés click en un post concreto,
querés ver ESE post. Si hacés click en la celda, querés ver
el día. Son dos intenciones distintas y la app las distingue.

### El panel de detalle del día

**Qué es:** el panel lateral derecho que se abre al hacer
click en una celda del día.

**Por qué es panel lateral y no modal flotante:** un modal
con backdrop oscuro bloquearía toda la grilla detrás. Un
panel lateral mantiene la grilla parcialmente visible al
fondo. Menos fricción, más continuidad. Es exactamente el
mismo principio que usamos en el drawer de programación de
Chat — consistencia del sistema.

**Por qué el botón "+ Crear para este día" está prominente
en el header:** porque resuelve el caso borde del día vacío
y del día con posts en el mismo gesto. Sin importar si el
día tiene 0 o 10 posts, el botón "+ Crear" está a un solo
click. No hay regla escondida sobre cuándo aparece.

**Por qué "+ Crear para este día" precarga solo la fecha (no
la hora):** porque dos lugares no deben decidir la hora. El
Calendario decide día. El Chat decide hora (en su drawer de
programación, con las sugerencias del Ritmo). Cada módulo
con su responsabilidad clara, sin solapamientos.

**Por qué el panel tiene 3 variantes:**

- **Día con posts:** lista de mini-cards, acciones por post
- **Día vacío:** estado vacío con sugerencias del Ritmo
- **Día pasado:** posts publicados, botón "+ Crear"
  desactivado, menús contextuales reducidos
  Cada variante optimiza el contenido para la intención del
  usuario en ese contexto.

### El modal "Ver"

**Qué es:** el modal centrado que se abre al hacer click en
un post (sea desde una celda del calendario o desde una
mini-card del panel del día).

**Por qué existe (en lugar de hacer que todo abra "Editar
en Chat"):** porque inspeccionar un post y editar un post
son dos intenciones distintas. A veces solo querés revisar
que el post esté bien sin abrir el chat entero de 15
mensajes donde lo creaste. El modal "Ver" satisface esa
intención sin contexto conversacional.

**Por qué es modal centrado y no panel:** porque "Ver" es
un foco temporal. Lo abrís, lo leés, lo cerrás. No es
exploratorio (como el panel del día), no es persistente
(como el panel de borradores). Modal central comunica
exactamente eso: foco temporal sobre un elemento.

**Por qué reutiliza la card de publicación de Chat:** porque
es el mismo componente. Diseñar una "vista resumen" distinta
sería duplicar el componente y crear deuda técnica. Una
sola fuente de verdad para "cómo se ve una publicación",
usada en Chat, en el modal "Ver", en cualquier lado.

**Por qué las acciones del footer cambian según el estado:**
porque las acciones disponibles son distintas para un
borrador (Programar, Editar) que para un programado
(Reprogramar, Cancelar) que para un publicado (Ver
estadísticas, Adaptar a otra red). Mostrarlas todas siempre
genera ruido. Mostrarlas contextualmente respeta la
inteligencia del usuario.

**Por qué en multi-red tiene un selector de redes arriba:**
porque cada red tiene su texto adaptado distinto, su preview
distinto, sus hashtags distintos. El usuario quiere poder
comparar las versiones sin cerrar y abrir 3 modales. El
selector le permite saltar entre versiones manteniendo el
contexto del modal.

### El drag-and-drop

**Qué es:** la interacción estrella del módulo en desktop.
El usuario puede agarrar un post (desde el panel de
borradores o desde una celda) y soltarlo en otro día/slot
del calendario.

**Por qué existe:** porque reprogramar es la acción más
común del módulo. Sin drag, requiere 5 clicks. Con drag, 1
gesto. La diferencia es enorme cuando el usuario
reprograma 10 posts por semana.

**Por qué no existe en mobile:** porque el drag-and-drop en
mobile táctil es notoriamente malo. Confunde con scroll,
los targets son chicos, la precisión es baja. En lugar de
forzar una mala experiencia móvil, en mobile usamos un menú
contextual "Reprogramar" que abre un selector de fecha/hora.
Más clicks pero mejor experiencia para el contexto.

**Por qué los highlights de destino son tan elaborados**
(border punteado Pink Orchid + fondo coloreado + ámbar para
conflicto + not-allowed para pasado): porque el drag sin
feedback claro es horrible. El usuario necesita saber en
todo momento qué va a pasar si suelta. Los highlights son
la "telegrafía visual" que comunica "este destino es válido",
"este tiene un conflicto", "este es inválido".

**Por qué hay flash visual al soltar:** confirmación. Sin
el flash, el usuario suelta y se queda con dudas de si la
acción se efectuó. El flash es el "✓" visual instantáneo
que cierra la acción.

**Por qué el toast tiene "Deshacer" con 5 segundos:** porque
reprogramar es reversible y de bajo impacto. Forzar un modal
de confirmación ("¿estás seguro?") agrega fricción innecesaria.
La técnica de "acción + ventana de deshacer" es estándar
(Gmail, Slack) precisamente porque respeta al usuario sin
ponerle obstáculos. Es exactamente la misma técnica que
usamos en Chat para cancelar programación.

### La detección de conflictos

**Qué es:** la app detecta cuando dos posts están programados
a la misma hora exacta en la misma red social, y lo marca
visualmente.

**Definición precisa:** conflicto = misma red + mismo día +
misma hora exacta. Multi-canal a la misma hora NO es
conflicto. Mismo día misma red a horas distintas tampoco es
conflicto.

**Por qué se marca pero no se bloquea:** porque el usuario
podría querer tener dos posts a la misma hora intencionalmente
(por algún caso raro). La app le informa pero no le impide.
Esto respeta su agencia.

**Por qué el color del conflicto es ámbar y no rojo:**
mismo principio que el indicador de cadencia. Información,
no error. El usuario está informado, no castigado.

**Por qué cuando el conflicto se detecta durante un drag,
la app sugiere proactivamente una hora alternativa (+30 min):**
porque la alternativa más probable que el usuario va a
elegir es justamente "20 o 30 minutos después". Pre-
sugerirla le ahorra el paso de elegir manualmente. Si no
le sirve, puede elegir otra hora con un click.

---

## 4. El tratamiento del caso multi-red

Este es un sub-componente con suficiente complejidad como
para merecer su propia sección.

### El problema que resuelve

Cuando un usuario crea contenido en Chat y le pide "adaptar
a 3 redes", el Chat genera 3 cards de publicación distintas
(una por red, cada una con texto adaptado, hashtags propios,
imagen). Si después las programa todas para el mismo día y
hora, en el Calendario aparecerían como **3 posts
independientes** que casualmente comparten fecha/hora.

Esto es problemático por dos razones:

1. Pierde la información valiosa de que son la misma
   publicación conceptualmente
2. Visualmente, satura el día con 3 entradas que ocupan 3
   slots

### La solución: agrupación visual sin pérdida de atomicidad

Las 3 publicaciones siguen siendo independientes técnicamente
(podés cancelar solo una, reprogramar solo una, ver solo
una), pero visualmente se agrupan para comunicar la
relación.

**El color de identidad del grupo:** Pink Orchid `#CDB4DB`.
Aparece consistentemente en:

- Border-left común que conecta las filas del grupo (vista mes)
- Header del grupo (vista semana, día, panel del día)
- Icono de cadena que acompaña cada elemento del grupo

### Cómo se ve en cada vista

**Vista Mes:** las N redes del grupo aparecen como filas
separadas dentro de la celda, **conectadas por un border-
left común Pink Orchid continuo**. Cada fila tiene un mini-
icono de cadena al lado de la hora. El cap de 3 visibles +
chip "+N más" sigue aplicando: si un grupo de 4 redes +
otros 2 posts saturan la celda, las reglas normales se
aplican.

**Vista Semana:** los N bloques aparecen apilados en la
misma franja horaria del mismo día, conectados por border-
left común. **Header del grupo** arriba de los bloques
con icono de cadena y contador ("3"), sin labels de
acciones bulk por el espacio reducido. Si se incluyen
acciones bulk, se muestran como mini-iconos sin texto.

**Vista Día:** las N mini-cards aparecen agrupadas dentro
de un **contenedor visual claro** con fondo Pink Orchid
muy diluido. Header del grupo prominente con:

- Icono de cadena
- Título: "Publicación multi-red · 18:00 · 3 redes"
- Acciones bulk con labels visibles: **[Reprogramar todas]**
  **[Cancelar todas]**
  Si los estados son mixtos (una publicada, dos programadas),
  el header del grupo refleja un resumen sutil ("2 programadas ·
  1 publicada") y cada mini-card individual mantiene su
  estado propio.

**Panel del día:** mismo tratamiento que vista día.
Contenedor con header + mini-cards individuales. Acciones
bulk en el header (como iconos sin label por el ancho
estrecho del panel).

### Cómo se ve el modal "Ver" para multi-red

El modal incluye un **segmented control arriba** con las N
redes como opciones. La red activa muestra su versión
completa (texto, preview, hashtags). El usuario puede saltar
entre redes con un click. El footer del modal adapta sus
acciones según el estado de la red activa.

### Qué pasa cuando una red del grupo se reprograma

Si el usuario reprograma solo una de las redes a otra hora
o día distinto, **la agrupación se rompe visualmente**. Las
N-1 redes que quedan en la hora original siguen agrupadas.
La red movida aparece sola en su nueva fecha/hora, sin
relación visual con el grupo original.

**Por qué este comportamiento:** el usuario rompió la
unidad voluntariamente al cambiar la hora. La UI lo refleja.
Si después decide volver a programar esa red a la hora
original, el grupo se reconstituye automáticamente. La
agrupación visual es una propiedad emergente de "estas
publicaciones comparten fecha+hora+origen", no un atributo
fijo.

### Por qué este tratamiento (y no otro)

Considerábamos tres modelos:

1. **Sin agrupación** (3 posts visibles separados): perdía
   la información de "son la misma publicación"
2. **Un solo elemento con icono multi-red** (1 fila con
   logos solapados): no funcionaba si los estados eran
   mixtos (ej: 1 publicada y 2 programadas en una sola fila
   ambigua)
3. **Agrupación visual manteniendo atomicidad** (el
   elegido): balance entre comunicar la relación y permitir
   acciones individuales
   El modelo elegido también permite **acciones en bulk** (que
   el Modelo 1 hacía imposible y el Modelo 2 hacía solo en
   bulk) — el usuario puede cancelar todas con un click desde
   el header del grupo, o cancelar solo una desde su mini-card.
   Tiene control granular y control de grupo, según necesite.

---

## 5. Estados especiales y por qué importan

### Estado inicial (primera vez que se entra al módulo)

**El estado:** el usuario abre el Calendario por primera vez
y no tiene nada programado todavía.

**El diseño:** grilla del mes visible al fondo pero sin
contenido. Overlay con ilustración sutil + mensaje: _"Tu
pipeline editorial vivirá acá. Empezá creando tu primer
post."_ + dos CTAs: "+ Crear mi primer post" (lleva a Chat)
y opcionalmente "Ver cómo funciona" (tour breve).

**Por qué este diseño:** el calendario vacío sin contexto
puede confundir al usuario nuevo. Pero un overlay
demasiado intrusivo bloquea la exploración. El balance:
overlay informativo no bloqueante.

### Mes/semana sin contenido

**El estado:** el usuario tiene cuenta vieja pero el periodo
actual está vacío (vino de vacaciones, no programó nada).

**El diseño:** grilla normal vacía. Mensaje sutil flotando
en el centro: _"Sin publicaciones este [periodo]. Empezá
creando algo en Chat."_ No overlay bloqueante.

**Por qué este diseño:** no es la primera vez del usuario
(no necesita onboarding). Solo necesita una invitación
suave a actuar.

### Cargando (loading)

**El estado:** la app está cargando los posts del periodo
visible.

**El diseño:** skeleton de la grilla con celdas vacías
animadas (shimmer). Skeleton del panel de borradores.
Skeleton del indicador de cadencia. Toolbar funcional
durante el loading (el usuario puede cambiar de vista
mientras carga).

**Por qué este diseño:** loading skeletons son mejores que
spinners genéricos porque comunican la estructura final.
El usuario ve "acá va a haber una grilla" mientras carga,
no "no sé qué va a pasar".

### Sin conexión

**El estado:** se cae la conexión mientras el usuario está
usando el módulo.

**El diseño:** banner sutil arriba del área de contenido:
_"Sin conexión. Las reprogramaciones se aplicarán cuando
vuelva."_ Tinte gris neutro o Icy Blue suave. NO bloquea
la app. Los drags realizados durante el offline quedan en
estado "pendiente" con icono Lucide clock. Al restaurarse
la conexión, se aplican automáticamente y el banner cambia
a "Conexión restaurada" con check verde antes de desaparecer.

**Por qué este diseño:** cortar el módulo por falta de
internet es agresivo. Mejor mantenerlo usable con queue
local de acciones pendientes. Es el mismo principio que
aplicamos en Chat.

### Canal desconectado

**El estado:** el usuario tiene posts programados para una
red que se desconectó (ej: se venció el token de LinkedIn).

**El diseño:** los posts de esa red aparecen con un overlay
sutil "Red desconectada" + botón "Reconectar" que lleva a
Configuración > Canales conectados.

**Por qué este diseño:** convertir un problema en una
oportunidad de configurar. No solo decir "este post no se
va a publicar" sino "acá está cómo arreglarlo".

### Día pasado seleccionado

**El estado:** el usuario hace click en una celda de un día
ya pasado.

**El diseño:** el panel del día se abre normal pero con
diferencias:

- Botón "+ Crear para este día" desactivado con tooltip
  _"No podés crear publicaciones en el pasado"_
- Los posts aparecen en estado publicado (con su lenguaje
  visual de border verde + opacidad reducida)
- Menú contextual reducido: solo "Ver post" y "Ver
  estadísticas" (link a Analíticas)
- Sin opciones de edición
  **Por qué este diseño:** el pasado es read-only por
  definición. Permitir crear en el pasado no tiene sentido
  (no se puede publicar retroactivamente). Pero permitir
  **inspeccionar** el pasado es muy útil — el creator
  revisa qué publicó la semana pasada, ve cómo le fue.

### Conflicto detectado pasivamente

**El estado:** ya existen dos posts en la misma red, mismo
día, misma hora (no resultado de un drag activo del usuario).

**El diseño:** mini-badge ámbar con icono de alerta en la
celda del día (vista mes) o en el borde compartido de los
bloques en conflicto (vista semana). Hover muestra detalle:
_"Tenés 2 posts de LinkedIn a las 18:00"_.

**Por qué este diseño:** el conflicto puede aparecer por
cualquier motivo (creaste dos posts en chats diferentes y
los programaste a la misma hora sin darte cuenta). La app
te lo señala para que actúes si querés, pero no te bloquea.

### Programación fallida (durante drag, conflicto, ya

descripto en sección 3)

Ya cubierto. Modal inline cerca del día con sugerencia
proactiva de hora alternativa.

---

## 6. Decisiones de producto importantes

### Por qué la vista default es Mes en todos los dispositivos

Discutimos esto a fondo. La vista mes da el sentido de
**pipeline editorial** mejor que la vista semana. En mes
ves de un vistazo cómo viene el mes entero. En semana hacés
zoom-in al detalle operativo. En día hacés zoom-in extremo.

Default mes también facilita la consistencia mental entre
desktop, tablet y mobile: el usuario aprende UNA vista
default y la aplica en todos lados. Cambiar el default por
dispositivo agregaría carga cognitiva sin valor real.

**El costo:** vista mes en mobile es apretada. Lo aceptamos
porque la consistencia rígida es más valiosa que la
adaptación oportunista. Y mitigamos el costo con dots de
color (sin texto) en mobile y celdas táctiles de 44x44px
mínimo.

### Por qué el Calendario NO crea contenido

Ya cubierto en la sección 1 pero vale repetirlo: porque un
solo motor de creación (Chat) es más mantenible que dos. El
Calendario delega creación al Chat con la fecha precargada.
Una sola fuente de verdad.

### Por qué los publicados se quedan en el Calendario

Considerábamos sacarlos del calendario después de publicarse
(porque ya son "historia" y el calendario es "futuro"). Pero
los dejamos. Razones:

1. El usuario puede querer mirar atrás operativamente ("¿qué
   publiqué la semana pasada a esta hora?")
2. El link a Analíticas desde el post publicado es un puente
   natural ("publiqué esto, ¿cómo le fue?")
3. La opacidad reducida los distingue visualmente — siguen
   ahí pero "asentados"
   **El costo:** el Calendario se llena con el tiempo. Lo
   aceptamos porque "Calendario vacío del mes pasado" es peor
   señal que "Calendario lleno de historia".

### Por qué cancelar programación tiene undo pero eliminar borrador NO

- **Cancelar programación:** acción reversible, bajo
  impacto, frecuente. Toast con "Deshacer" 5 segundos.
- **Eliminar borrador:** acción destructiva, alto impacto,
  infrecuente. Modal de confirmación.
  Razón: ajustar el nivel de fricción al nivel de impacto.
  Mismo principio que aplicamos en Chat.

### Por qué el panel de borradores está a la izquierda

Direccionalidad mental occidental (izquierda → derecha como
origen → destino). Los borradores son el origen, el
calendario es el destino. Drag desde izquierda hacia derecha
respeta esta dirección.

Si fuera al revés (panel a la derecha), el drag iría de
derecha a izquierda, contra la dirección natural de lectura.
Microfricción innecesaria.

### Por qué el indicador de cadencia muestra dots y no porcentajes

Comparamos dos diseños:

- _"LinkedIn: 60% (3/5)"_ con barra de progreso
- _"LinkedIn: ●●●○○ 3/5"_ con dots
  Elegimos dots porque son más rápidos de leer y más
  táctiles (cada dot es un post). El porcentaje requiere un
  nivel extra de procesamiento mental ("60% de qué"). Los
  dots se leen instantáneamente como objetos contables.

### Por qué los filtros son popover y no panel persistente

Considerábamos un panel persistente de filtros que mostrara
los filtros activos siempre visibles. Lo descartamos: la
mayoría del tiempo el usuario no filtra, y tener un panel
permanente sería desperdicio de espacio. Popover desplegable
es el balance: invisible cuando no se usa, accesible con un
click. El contador en el botón ("Filtros · 2") da
visibilidad sin gastar espacio permanente.

### Por qué hay tres vistas y no más

Considerábamos:

- Año (overview macro)
- Lista/Agenda (todos los posts cronológicamente)
- Día simple (un día sin grilla horaria)
  Los descartamos para V1. Razón: cada vista nueva es overhead
  para el usuario y para el código. Mes, Semana, Día cubren el
  95% de los casos. Año puede agregarse después si validamos
  necesidad. Lista/Agenda es útil pero solapa con la
  funcionalidad de búsqueda global del topbar.

---

## 7. Lo que conscientemente NO incluye el Calendario en V1

- **Creación de contenido directa.** Ya cubierto. Toda
  creación va por Chat.
- **Vista Año.** Útil para visión muy macro pero no esencial
  en V1. Puede agregarse después si se valida demanda.
- **Vista Lista/Agenda.** Posts cronológicos en una lista.
  Solapa con búsqueda global y con el panel de borradores.
  Sumar otra forma de listar publicaciones agregaría
  redundancia.
- **Acciones en bulk multi-post fuera del grupo multi-red.**
  En V1, las acciones bulk solo existen para grupos multi-red
  (que son una unidad conceptual). No hay "seleccionar varios
  posts del calendario y aplicar acción a todos". V2.
- **Calendario compartido / colaborativo.** Una cuenta es
  una persona. Los CMs freelance usan carpetas (Projects)
  para separar clientes. Multi-usuario llega en V2.
- **Sincronización con Google Calendar / iCal / Outlook.**
  Útil para creators que tienen su vida personal en otros
  calendarios y quieren ver todo junto. V2.
- **Recordatorios push / notificaciones de posts próximos.**
  Las notifs van por WhatsApp/Telegram naturalmente. No
  agregamos sistema in-app de notificaciones en V1.
- **Modo "feed preview".** Ver cómo se va a ver el feed de
  Instagram con todos los posts programados en grid. Útil
  pero específico de Instagram. Puede llegar en V2 como
  módulo o sub-vista.
- **Edición masiva de horarios.** "Mover todos los posts de
  esta semana 1 hora más tarde". Caso de uso raro. V2.
- **Auto-fill de cadencia.** "Llename los huecos de la semana
  con sugerencias de Ritmo". Interesante pero requiere mucha
  inteligencia de Ritmo para que sea útil. V2.

### Por qué importa documentar esto

Igual que en Chat: el feature creep es una tentación
constante. Tener un documento explícito de "esto no se hace
en V1 por estas razones" es protección contra agregar
features que parecen cool pero diluyen el foco.

---

## 8. Cómo se integra el Calendario con el resto del producto

### Con Chat

Es la integración más densa. El Calendario es esencialmente
"el destino" de las publicaciones que nacen en Chat.

- Las cards programadas en Chat tienen link "Ver en
  calendario" que lleva al post resaltado/scrolleado a su
  posición en el Calendario.
- El drawer de programación de Chat muestra preview de la
  semana con dots (modelo mental compartido con el
  Calendario).
- El botón "+ Crear para este día" del Calendario abre Chat
  con la fecha precargada.
- El panel de borradores muestra publicaciones generadas en
  Chat pero no programadas todavía.
- Las cards de publicación se reutilizan tal cual entre Chat
  y Calendario (modal "Ver", lista del panel del día).

### Con Ritmo

Integración rica de información estratégica que se manifiesta
operativamente:

- El indicador de cadencia del Calendario consume los
  objetivos semanales definidos en Ritmo.
- Los chips de horarios sugeridos en el panel del día (cuando
  está vacío) vienen de los mejores horarios calculados por
  Ritmo.
- Las bandas de fondo en vista semana (horarios óptimos) se
  alimentan de Ritmo.
- El indicador sutil en celdas (punto en esquina superior
  derecha) que marca "este día tiene horario óptimo no
  usado" viene de Ritmo.
- Links del indicador de cadencia llevan al módulo Ritmo
  para configurar objetivos.
  Sin Ritmo configurado, varios componentes del Calendario
  quedan con datos placeholder o ausentes. Por eso Ritmo es el
  próximo módulo en el roadmap después del Calendario.

### Con Analíticas

Integración hacia adelante:

- Los posts publicados tienen acceso a "Ver estadísticas"
  desde su menú contextual y desde el modal "Ver".
- El click lleva a Analíticas con ese post resaltado.

### Con Biblioteca

Sin integración directa visible desde el Calendario. La
Biblioteca recibe los assets generados automáticamente desde
Chat. El Calendario no genera assets, solo programa
publicaciones que ya los tienen.

### Con Configuración

- Si una red social está desconectada, los links del
  Calendario llevan a Configuración > Canales conectados.
- Los filtros por carpeta usan las carpetas configuradas por
  el usuario.
- La voz de marca configurada NO afecta directamente al
  Calendario (no hay generación de contenido), pero sí
  afecta a Chat indirectamente cuando el usuario crea desde
  "+ Crear para este día".
  Este nivel de integración es lo que hace que Presencia se
  sienta como un producto coherente. El Calendario solo no es
  nada — es valioso porque conecta a Chat (creación), Ritmo
  (estrategia) y Analíticas (evaluación) en un eje temporal
  operativo.
