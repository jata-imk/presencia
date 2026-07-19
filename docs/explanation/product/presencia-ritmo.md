# Presencia — Módulo Ritmo

> Este documento describe el control estratégico de Presencia:
> el módulo Ritmo. Cubre QUÉ hace, POR QUÉ está diseñado así,
> y CÓMO se siente usarlo. Para entender el producto a nivel
> macro, leer primero `presencia-overview.md`. Ritmo es el
> PRODUCTOR de los datos que el Chat (`presencia-chat.md`) y el
> Calendario (`presencia-calendario.md`) ya consumen: si esos
> dos módulos son los que muestran cadencia, horarios y
> tendencias, Ritmo es la cocina donde esos datos nacen.

---

## 1. Qué es el módulo Ritmo y por qué importa

### Su rol en el producto

Si el Chat es el corazón creativo (donde nace el contenido) y
el Calendario es el control temporal (qué se publica cuándo),
Ritmo es el **control estratégico**. Es donde el usuario decide
_cómo quiere jugar_: a qué ritmo publica, en qué horarios pega
mejor, y sobre qué temas vale la pena hablar esta semana.

Ritmo responde una pregunta distinta a la de los otros módulos:
_"¿cuándo y sobre qué debería publicar?"_. No es operativa
("¿qué pasa esta semana?" es del Calendario) ni evaluativa
("¿cómo me fue?" es de Analíticas). Es **anticipatoria**: mira
hacia adelante.

### Su diferencia con Calendario y Analíticas

Es importante entender por qué Ritmo, Calendario y Analíticas
son módulos distintos, porque a primera vista pueden parecer
solapados. Son tres verbos distintos del flujo de trabajo:

- **Ritmo** mira hacia **adelante**. Es estrategia: cuántos
  posts por semana, mejores horarios, tendencias del nicho,
  propuestas de tema. Responde _"¿cuándo y sobre qué debería
  publicar?"_.
- **Calendario** está en el **medio**. Es lo operativo, el
  "ahora y lo ya agendado". Responde _"¿qué pasa esta
  semana?"_.
- **Analíticas** mira hacia **atrás**. Es evaluación: qué
  funcionó, qué no, comparativas. Responde _"¿cómo me fue?"_.
  Ritmo y Analíticas son los dos extremos del eje temporal, y por
  eso es fácil confundirlos: ambos hablan de "performance". Pero
  el verbo es opuesto. Analíticas te dice _qué pasó_ con un post
  que ya saliste a publicar. Ritmo toma ese pasado (vía la data)
  y lo convierte en una **recomendación hacia el futuro**.
  Analíticas es el retrovisor; Ritmo es el GPS.

### El problema específico que resuelve

Sin Ritmo, un creator vive a ciegas sobre tres preguntas que
no puede contestar solo:

1. ¿Estoy publicando lo suficiente, o ya me apagué otra vez?
2. ¿A qué hora me conviene publicar para que me vean?
3. ¿De qué hablo esta semana que no sea lo de siempre?
   La primera la sufre en carne propia: el creator publica en
   rachas (ver `presencia-overview.md`), una semana lleno de
   energía y tres semanas en silencio. La inconsistencia es el
   enemigo #1, y nadie tiene un espejo que se la muestre a tiempo.

La segunda la resuelve hoy con intuición o con tablas genéricas
de internet ("el mejor horario para Instagram es las 6pm")
que no tienen nada que ver con SU audiencia.

La tercera es la peor: el bloqueo de "no sé qué postear". La
página en blanco mata más contenido que la falta de talento.

Ritmo ataca las tres de un solo lienzo.

### La filosofía: Ritmo NO crea contenido

Esta es la misma decisión central que rige al Calendario, y
vale repetirla porque la tentación es fuerte: Ritmo propone
temas virales, así que es naturalísimo querer meterle un botón
de "escribir el post aquí mismo". Pero conscientemente
decidimos que NO.

**Razón:** Presencia tiene **un solo motor de creación**, que
es el Chat. Si Ritmo también creara contenido, terminaríamos
con dos motores sincronizados a la fuerza — el clásico
**monolito moderno con doble implementación de lo mismo**.
Cualquier feature nueva del Chat habría que portarla a Ritmo y
viceversa, hasta volver el producto imposible de mantener.

En cambio, cuando una propuesta de Ritmo prende la chispa, el
botón **deriva al Chat con el tema y el formato precargados en
el contexto**. Exactamente el mismo patrón que "+ Crear para
este día" del Calendario. Ritmo propone, el Chat ejecuta. Una
sola fuente de creación, todos los demás módulos son satélites.

### La filosofía 2: Ritmo es el productor, no solo una pantalla

Ritmo es raro entre los módulos porque buena parte de su valor
**no se ve dentro de Ritmo**. Es el productor de seis datos que
otros módulos ya esperan recibir (detallado en la sección 8).
Si Ritmo no existe o está mal configurado, el Calendario
muestra cadencia en placeholder y el drawer del Chat no tiene
horarios que sugerir. Por eso Ritmo no es opcional: es la
fuente de verdad de la capa estratégica del producto entero.

---

## 2. Cómo se siente usar Ritmo: un flujo completo

Para entender el módulo, lo mejor es seguir un flujo completo.
Vamos con Jose, el founder, que lleva un par de meses usando
Presencia y abre Ritmo un domingo a la tarde para planear su
semana.

### Domingo a la tarde, Jose abre Ritmo

Click en "Ritmo" en el sidebar. El módulo carga y, a diferencia
del Calendario (que es una grilla), lo que ve Jose es un
**dashboard de una sola vista** que se scrollea de arriba a
abajo. No hay tabs ni sub-pantallas: todo vive en un solo
lienzo, ordenado por frecuencia de uso (lo que se revisa a
diario arriba, la configuración abajo).

### Lo primero que ve: la cabecera de estrategia

Arriba de todo, una cabecera grande y respirada, en Space
Grotesk de buen tamaño:

> **Tu ritmo esta semana**
> Modo: **Crecer** 🚀 · 🔥 Racha de 5 días publicando

El "Modo" es su objetivo activo (editable). La racha es lo
primero que le pega: "5 días seguidos". Es información, sí,
pero diseñada para **motivar** — el mismo gancho psicológico de
no querer romper la cadena.

### El momento que deslumbra: el heatmap de cadencia

Debajo de la cabecera, el héroe visual del módulo: un **heatmap
estilo "contribuciones de GitHub"**. Una grilla de las últimas
~16 semanas, columnas por semana, filas por día. Cada celda es
un día, y su intensidad de color comunica cuántos posts publicó
ese día:

- Celda vacía: tono tenue, casi fondo.
- Pocos posts: Pink Orchid claro.
- Muchos posts: Blush Pop fuerte.
  De un vistazo, Jose ve **el patrón de su consistencia**: los
  huecos (semanas que se apagó) saltan como zonas oscuras, las
  rachas como zonas encendidas. Hover sobre una celda muestra el
  detalle: _"3 posts · 14 oct"_. Un toggle sutil le deja ver el
  agregado o desglosar por red.

Esto es lo que pidió Jose y lo que define el carácter del
módulo: deslumbra por **composición** (densidad visual + efecto
racha), no por circo. No hay neon ni glassmorphism ni rebotes
— solo la paleta de la marca usada con escala y contraste. Es
"calmado pero que pega", coherente con el design system.

### Más abajo: la cadencia objetivo por red

Jose scrollea. Aparece la cadencia objetivo, una fila por cada
red conectada con dots tipo Calendario:

> Instagram ●●●○○ 3/5 esta semana
> Facebook ●●○○ 2/4
> TikTok ●○○ 1/3

Verde si va a tiempo, ámbar si está atrasado, **nunca rojo**
(es información, no castigo — mismo principio que el indicador
de cadencia del Calendario). Cada objetivo es **editable**:
Ritmo trae un default sugerido por nicho y objetivo, pero Jose
puede subirlo o bajarlo. Un mini-texto honesto aclara cuándo es
sugerencia: _"Sugerido para tu nicho"_.

### El segundo heatmap: mejores horarios

Sigue scrolleando. Aparece otro mapa de calor que **rima
visualmente** con el primero pero hace otro trabajo: una grilla
de día-de-semana (7 columnas) × franjas horarias (filas). La
intensidad marca dónde su audiencia engancha más. Las mejores
ventanas resaltan, y las celdas fuertes muestran el "+%"
concreto:

> Mar 18:00 · +18% · 🔥 Top horario

Jose nota algo importante: ese "+18%" **solo aparece donde hay
data suficiente**. En las redes donde apenas lleva unos posts,
en lugar del número ve la versión honesta: _"Horarios
recomendados para tu nicho"_ (genéricos), sin inventar
porcentajes que no se sostienen. Y LinkedIn (que tiene como
perfil personal) muestra un estado degradado: _"Esta red no
reporta horarios propios"_.

### El corazón cultural: tendencias

Jose llega a la sección que más usa: **Tendencias**. Una lista
de cards de temas que se están moviendo en SU nicho y SU
región, escritas en español mexicano e idioma visual (Reel,
carrusel, gancho), no traducción de tendencias gringas:

> **Rutinas de productividad sin apps de pago** 🔥 Subiendo
> Está pegando en TikTok MX como Reels de "un día en mi vida".
> _Visto en TikTok MX · hace 2 días_

Cada card tiene una señal de fuerza **cualitativa** (🔥 Subiendo
/ 📈 Estable / ✨ Nuevo), NO un porcentaje inventado, y **cita
su fuente** de forma sutil. Jose confía en ellas precisamente
porque no huelen a número sacado de la manga.

### De tendencia a acción: las propuestas

Al final, la sección de **Propuestas**: publicaciones concretas
que Ritmo arma a partir de los temas virales, cada una con su
formato recomendado y un gancho:

> 🎬 **Reel** · "3 apps gratis que reemplazan a las de pago"
> Gancho: "Dejá de pagar suscripciones, ve esto 👇"
> [Crear en Chat]

Jose ve una que le late. Click en **"Crear en Chat"**.

**Lo que pasa:** Ritmo lo deriva al módulo Chat. Se abre un
chat nuevo con el tema Y el formato (Reel) precargados en el
contexto. El Chat ya está esperando para generar el guion (el
arquetipo de video corto, ver `presencia-chat.md`). Ritmo no
creó nada — solo prendió la chispa y pasó la estafeta.

### El cierre del flujo

En 5 minutos, Jose vio su consistencia de un golpe (heatmap),
ajustó su cadencia objetivo, confirmó sus mejores horarios,
revisó qué se mueve en su nicho, y arrancó la creación de un
Reel desde una propuesta. Toda la capa estratégica del trabajo
de un creator, resuelta en un solo lienzo y derivando la
creación al único lugar donde se crea.

Eso es el módulo Ritmo.

---

## 3. Los componentes de Ritmo y su propósito

### La cabecera de estrategia

**Qué es:** la franja superior del dashboard, con el objetivo
activo ("Modo") y el estado de racha.

**Por qué existe:** Ritmo es el módulo más abstracto del
producto (estrategia, no objetos concretos como posts). Una
cabecera que personaliza ("Tu ritmo esta semana") y motiva
(la racha) le da un ancla emocional al usuario apenas entra.

**Por qué la racha es protagonista:** porque la consistencia es
el problema #1 del creator, y la racha es la forma más visceral
de hacerla visible. Es el mismo gancho psicológico de GitHub y
Duolingo: ver "5 días" te dan ganas de no romperla. Pero ojo
(ver sección 5): la racha NUNCA se inventa. Día 1 no hay racha.

**Por qué el "Modo" / objetivo está acá:** porque amarra todo
lo demás. Una cadencia de "3 por semana" sin un para-qué es un
número arbitrario. Atarla a un objetivo ("Crecer", "Mantener",
"Lanzar algo") le da sentido a la sugerencia.

### El heatmap de cadencia (el hero visual)

**Qué es:** la grilla estilo contribuciones de GitHub que
muestra la actividad de publicación del usuario en el tiempo
(últimas ~16 semanas), con intensidad de color por cantidad de
posts por día.

**Por qué existe:** convierte un dato abstracto ("tu
consistencia") en una imagen que se lee en menos de un segundo.
Los huecos y las rachas son visuales, no numéricos. Es la
materialización del problema de las "rachas" que sufre el
creator.

**Por qué estilo GitHub y no un gráfico de barras:** porque el
heatmap comunica **patrón a lo largo del tiempo** mejor que
cualquier barra. Un gráfico de barras te dice "publicaste X
esta semana"; el heatmap te muestra tu historia entera de
consistencia de un solo golpe. Y tiene el bonus del efecto
racha (la cadena visual que no querés romper).

**Por qué es el hero del módulo:** es lo que pidió el founder
("deslumbrar, motivar") y es el componente que más
personalidad le da a Ritmo sin traicionar el design system. Lo
"atrevido" viene de la escala y la densidad, no de efectos.

**Por qué el hover es obligatorio:** sin tooltip ("3 posts · 14
oct"), el heatmap es decoración bonita pero muda. El hover lo
convierte de adorno en información.

### La cadencia objetivo por red

**Qué es:** una fila por red conectada con dots (●●●○○ 3/5) que
muestran el objetivo semanal y el avance, editable.

**Por qué dots y no porcentajes:** mismo razonamiento que el
indicador de cadencia del Calendario. Los dots se leen
instantáneamente como objetos contables (cada dot es un post);
el porcentaje exige un paso extra de procesamiento mental.

**Por qué sugerir-y-editar y no manual puro ni automático
puro:** manual puro arranca en página en blanco (parálisis);
automático puro le quita agencia al usuario (contradice "el
humano sigue siendo el director"). El punto medio es que Ritmo
sugiera un default por nicho/objetivo y el usuario lo ajuste.

**Por qué verde/ámbar y nunca rojo:** atrasarse en la cadencia
no es un error, es información que el creator puede o no
accionar. Rojo es para errores. Ámbar es "ojo con esto" sin
"esto está mal".

**Por qué comparte lenguaje visual con el Calendario:** porque
es literalmente el mismo dato. La cadencia que el usuario fija
en Ritmo es la que el Calendario muestra en su barra de
indicador. Una sola fuente de verdad, presentada con el mismo
vocabulario en los dos lados.

### El heatmap de mejores horarios

**Qué es:** la grilla día-de-semana × franja horaria con la
intensidad marcando el engagement promedio, y el "+%" en las
mejores ventanas.

**Por qué un segundo heatmap (y no otra cosa):** porque rima
con el de cadencia y reaprovecha el lenguaje visual. Dos mapas
de calor con la misma energía, dos trabajos distintos. La
coherencia visual reduce la carga de aprendizaje.

**Por qué debe ser más compacto que el de cadencia:** porque si
los dos heatmaps tienen el mismo tamaño, el usuario se confunde
de cuál es cuál. El de cadencia es el hero (grande); el de
horarios es de trabajo (compacto).

**Por qué el "+%" es condicional:** ver sección 5. Solo aparece
con suficiente data del usuario. Antes de eso, horarios
genéricos con label honesto. Mostrar "+18% para ti" sin tener
ni un post suyo sería el código que miente.

### La sección de tendencias

**Qué es:** el feed de temas que se están moviendo en el nicho
y región del usuario, en español mexicano e idioma visual.

**Por qué es el corazón cultural:** es donde el moat se vuelve
producto (ver sección 4). Una IA genérica te da tendencias
gringas traducidas; Ritmo te da las de TU mercado en TU
registro. Sin esto, Ritmo es una cáscara de otro programador
de posts más.

**Por qué señal cualitativa (🔥/📈/✨) y no porcentaje:** porque
el "+24%" de una tendencia no tiene fuente real de dónde
salir. Inventarlo sería vaporware métrico. Una señal cualitativa
comunica la fuerza sin prometer una precisión que no tenemos.

**Por qué cada card cita su fuente:** porque la confianza en
una tendencia depende de que NO parezca inventada. "Visto en
TikTok MX · hace 2 días" le dice al usuario que esto es real y
fresco, no una alucinación de la IA.

### La sección de propuestas

**Qué es:** publicaciones concretas que Ritmo arma a partir de
los temas virales, cada una con formato recomendado (badge
Reel/Carrusel/Post) y un gancho.

**Por qué existe (separada de tendencias):** una tendencia es
un _tema_ ("rutinas de productividad sin apps de pago"); una
propuesta es una _publicación concreta_ lista para crear ("Reel:
3 apps gratis que reemplazan a las de pago"). La propuesta es
el puente entre "qué se mueve" y "qué hago yo con eso".

**Por qué el botón lleva al Chat y no crea aquí:** ley del
producto. Una sola fuente de creación = el Chat (ver sección
1). El botón abre Chat con tema + formato precargados.

**Por qué la propuesta sugiere formato visual:** porque el
público es visual-first. Proponer "escribí un post de LinkedIn"
para un creator de TikTok sería hablarle en el idioma
equivocado. Las propuestas hablan en Reel, carrusel, gancho.

---

## 4. El corazón cultural: cómo se generan las tendencias

Esta es la pieza con más complejidad y más riesgo del módulo,
y por eso merece su propia sección. Es donde el moat cultural
deja de ser teoría y se vuelve dato en pantalla.

### El problema que resuelve

El diferenciador #1 de Presencia es la profundidad cultural
(ver `presencia-overview.md`): hablarle al creator mexicano en
su idioma y conocer las tendencias de SU mercado. Una IA
genérica global (ChatGPT, el Manus que Meta metió en WhatsApp)
te da tendencias gringas traducidas — el "español de
aeropuerto". Ritmo tiene que dar lo contrario.

### Lo que NO funciona (y por qué lo descartamos)

Considerábamos cinco fuentes de tendencias:

1. **Scraping de las redes.** Descartado. Frágil de mantener
   (cada update de las plataformas rompe el scraper, el clásico
   código que hoy jala y mañana truena), legalmente gris, y le
   raspás la cancha al dueño del estadio (Meta). Single point of
   failure que encima te puede mandar al abogado.
2. **API de tendencias de terceros.** Descartado como fuente
   principal. Casi todas son gringas y en inglés; te darían
   tendencias de allá que habría que traducir = exactamente el
   español de aeropuerto que es el enemigo. Mata el moat.
3. **La IA inventándolas de su entrenamiento.** Descartado. Un
   modelo tiene fecha de corte (su conocimiento se congela en
   un punto del pasado). Pedirle "tendencias" a secas produce
   alucinaciones o cosas viejas con cara de frescas. Código que
   miente.
4. **Data de las redes del propio usuario.** No sirve para
   esto: eso es performance (qué le funcionó A ÉL), no
   tendencias del nicho. Sirve para horarios (sección 5), no
   para "qué está pegando ahorita".

### La solución: generación aterrizada (grounded generation)

La fuente elegida es el LLM **+ búsqueda web en tiempo real**,
filtrada por la vertical y región del usuario (capturadas en
onboarding) y reescrita en español mexicano e idioma visual.

En cristiano: el modelo no inventa ni sueña; sale a buscar a la
web lo que de verdad se está moviendo, y usa su capacidad de
lenguaje para **enmarcarlo culturalmente** (contarlo como se
cuenta en México, en formato Reel/carrusel/gancho). La búsqueda
web pone los pies en la tierra (frescura, fuente real); el LLM
pone el marco cultural. No es magia: es el modelo razonando con
los pies en el suelo en vez de soñando.

### La honestidad como requisito de diseño

Dos reglas no negociables que nacen de esta arquitectura:

1. **Señal de fuerza cualitativa, no porcentaje inventado.** Las
   tendencias muestran 🔥 Subiendo / 📈 Estable / ✨ Nuevo. NO un
   "+24%" que no tiene de dónde salir. El número solo vive donde
   hay fuente real, que es en horarios (sección 5).
2. **Fuente citada siempre.** Cada tendencia dice de dónde
   salió ("Visto en TikTok MX · hace 2 días"). Si la fuente se
   cae o no hay resultados, el estado vacío es honesto (sección
   6), no se rellena con humo.

### La verdad incómoda sobre V1

Aun con grounded generation, V1 va a ser más modesto que la
fantasía. "Tendencias hiperlocales de Mérida en tiempo real" es
el caso más difícil del producto entero. Para V1 apuntamos a
"temas moviéndose en tu nicho/país" con fuente citada, y
dejamos lo hiperlocal como ambición declarada, no como promesa
incumplida. Es mejor prometer poco y cumplir que prometer un
radar de tendencias de barrio que no podemos sostener.

---

## 5. La fuente de datos de horarios y el problema del cold-start

La otra pieza técnica meaty del módulo: de dónde sale el "+%" de
los mejores horarios, y qué muestra Ritmo cuando el usuario es
nuevo y no tiene data.

### De dónde sale la data de horarios

La publicación y las analíticas se apoyan en **PostFast** (ver
`presencia-overview.md`). Su API (vía MCP) expone una
herramienta de analíticas que regresa, por cada post publicado,
métricas de engagement (impresiones, alcance, likes, comments,
shares, interacciones totales), filtrable por fecha y cuenta,
con histórico. Cubre Facebook, Instagram, Threads, LinkedIn
Pages, TikTok, YouTube y Pinterest.

**Lo importante de entender:** PostFast da la **materia prima**
(engagement por post), NO da "tus mejores horarios" ya
masticados. El cálculo lo hace **Ritmo**, agregando los posts
del usuario por hora-del-día y día-de-semana. El "+18%" =
engagement promedio a esa hora vs el promedio general del
usuario.

### El problema de la significancia estadística

El "+18%" es honesto **solo con suficientes posts**. Con 5
posts, decir "+18% a las 18:00" es ruido disfrazado de señal.
El concepto técnico se llama **significancia estadística**:
necesitás un N suficiente para que el patrón no sea pura
casualidad (como sacar tres águilas seguidas y decir que la
moneda está cargada).

Por eso el "+%" es condicional: aparece solo cuando hay volumen
para sostenerlo. Antes de eso, horarios genéricos honestos.

### El cold-start: qué muestra Ritmo el día 1

Un usuario nuevo no tiene historial ni data propia, así que no
se puede calcular nada de lo suyo. La solución es estándar:
arrancar con **heurísticas genéricas por nicho/red** (tablas de
mejores horarios que ya existen por plataforma) + lo capturado
en onboarding (vertical, región, audiencia).

La clave es la **honestidad del copy** en cada fase:

- **Día 1 (cero data):** _"Horarios recomendados para tu
  nicho"_ — genérico, sin "+%" ni racha falsa. El heatmap de
  cadencia está vacío con copy invitador.
- **Poca data (N insuficiente):** el heatmap empieza a
  llenarse; horarios aún genéricos; todavía SIN "+%".
- **Full (con histórico):** todo personalizado, "+%" reales,
  racha viva.
  La transición de "horarios de tu nicho" a "TUS horarios" es
  gradual y honesta. Nunca le ponemos "+18% para ti" cuando
  todavía no tiene ni un post. Ese es el mismo principio de
  honestidad que mata al "+24%" de las tendencias.

### El gotcha de LinkedIn

LinkedIn solo da analíticas de Páginas (empresa), NO de
perfiles personales — es un límite de LinkedIn, no de PostFast.
Como LinkedIn es red secundaria en Presencia, lo aguantamos,
pero hay que diseñar el estado degradado: _"Esta red no reporta
horarios propios"_.

---

## 6. Estados especiales y por qué importan

### Cold-start (primera vez, sin data)

**El estado:** el usuario nuevo abre Ritmo sin historial.

**El diseño:** heatmaps vacíos con copy invitador ("Aquí va a
vivir tu estrategia"); horarios genéricos por nicho con label
honesto; cadencia con default sugerido; **tendencias y
propuestas SÍ funcionan** (no dependen de data propia, salen de
grounded generation). El módulo se siente útil desde el día 1
aunque el usuario no haya publicado nada.

**Por qué este diseño:** un Ritmo vacío total el día 1 haría
sentir al usuario que el módulo no sirve hasta dentro de un mes.
Que tendencias y propuestas funcionen desde el arranque le da
valor inmediato mientras junta su propia data.

### Poca data (N insuficiente)

**El estado:** el usuario tiene algunos posts pero no suficientes
para estadística confiable.

**El diseño:** heatmap de cadencia empezando a llenarse;
horarios todavía genéricos; SIN "+%". Mensaje sutil: _"Seguí
publicando para desbloquear tus horarios personalizados"_.

**Por qué este diseño:** honestidad estadística. Mostrar
números personalizados con data insuficiente sería engañar al
usuario con precisión falsa.

### Full (con histórico suficiente)

**El estado:** el usuario tiene volumen para estadística
confiable.

**El diseño:** todo personalizado — "+%" reales en horarios,
racha viva, heatmap denso. Es el estado "premium" del módulo.

### Cargando (loading)

**El diseño:** skeletons con shimmer que respetan la estructura
(la silueta de los heatmaps, las filas de cadencia, las cards de
tendencia). Nada de spinners genéricos.

**Por qué este diseño:** los skeletons comunican la estructura
final ("acá va a haber un heatmap") mientras carga. Mismo
principio que el Calendario y el Chat.

### Sin conexión

**El diseño:** banner sutil no bloqueante arriba del contenido,
tinte gris neutro o Icy Blue suave: _"Sin conexión. Los datos
pueden no estar actualizados."_ El módulo sigue mostrando lo
último que cargó.

**Por qué este diseño:** cortar el módulo por falta de internet
es agresivo. Mejor mantenerlo usable con la data en caché.
Mismo principio que Chat y Calendario.

### Red sin analíticas (LinkedIn personal)

**El diseño:** en la sección de horarios, esa red muestra un
estado degradado claro: _"Esta red no reporta horarios
propios"_, con explicación al hover de que es un límite de la
plataforma.

**Por qué este diseño:** no esconder la limitación ni fingir
datos. Decir la verdad de por qué falta el dato.

### Tendencias sin resultados / fuente caída

**El diseño:** estado vacío honesto: _"No encontramos
tendencias frescas de tu nicho ahorita. Probá refrescar en un
rato."_ NUNCA rellenar con tendencias inventadas para que se
vea lleno.

**Por qué este diseño:** es la regla de oro del módulo. El
momento de tentación de meter humo es justo cuando no hay datos.
Resistirlo es lo que mantiene la confianza.

---

## 7. Decisiones de producto importantes

### Por qué dashboard de una vista y no tabs

Las cuatro funciones (cadencia, horarios, tendencias,
propuestas) no pesan igual en frecuencia de uso. Cadencia y
horarios son configuración (los tocás una vez, ajustás de vez
en cuando — set-and-forget). Tendencias y propuestas son lo que
revisás seguido (el feed estratégico vivo).

Tabs trataría las cuatro como iguales, y no lo son. El
dashboard de una vista permite ordenarlas por frecuencia (lo
vivo arriba, la config abajo) y da el sentido de "mi estrategia
de un vistazo" mejor que cuatro pestañas separadas. El costo es
una pantalla más larga; lo aceptamos porque el scroll es barato
y la separación en tabs habría escondido el feed que es lo que
más se usa.

### Por qué señal cualitativa en tendencias y "+%" solo en horarios

Mismo principio de honestidad aplicado dos veces. El "+%" de
horarios sale de data real del usuario (PostFast), así que es
defendible. El "+%" de tendencias no tiene fuente — sería un
número inventado. Por eso las tendencias usan señal cualitativa
(🔥/📈/✨) y los horarios sí muestran el porcentaje (cuando hay
significancia). El número solo vive donde puede sostenerse.

### Por qué la cadencia es sugerir-y-editar

Ni manual puro (página en blanco = parálisis) ni automático
puro (le quita agencia al usuario). El punto medio respeta la
promesa del producto: el humano sigue siendo el director
creativo; Ritmo solo le pone un buen punto de partida.

### Por qué Ritmo dispara creación pero no crea

Una sola fuente de creación = el Chat. Si Ritmo creara, sería
el monolito moderno con doble implementación. Ritmo propone y
deriva al Chat con contexto precargado. Misma arquitectura que
"+ Crear para este día" del Calendario.

### Por qué "atrevido" sin romper el design system

El founder pidió deslumbrar; el design system pide calma (sin
neon, glassmorphism, bounces ni spring physics). No es pleito:
lo atrevido viene de **escala, contraste tipográfico y un
momento hero de data-viz** (el heatmap), no de efectos baratos.
El heatmap pega un madrazo visual usando solo la paleta de la
marca con densidad y composición. "Calmado con personalidad",
que es exactamente el tono del producto.

### Por qué dos heatmaps y no uno

El de cadencia (actividad en el tiempo) y el de horarios
(día × hora) son datos distintos que se benefician del mismo
lenguaje visual. Reusar el patrón reduce la carga de
aprendizaje. La regla: el de cadencia es el hero (grande), el
de horarios es de trabajo (compacto), para que no compitan.

---

## 8. Lo que conscientemente NO incluye Ritmo en V1

- **Creación de contenido directa.** Toda creación va por Chat.
  Ritmo propone y deriva.
- **Tendencias hiperlocales en tiempo real (nivel ciudad).**
  Ambición declarada, no promesa de V1. Arrancamos con nivel
  nicho/país y fuente citada.
- **El "+%" en tendencias.** Sin fuente real, no se muestra.
  Señal cualitativa en su lugar.
- **Auto-fill de cadencia ("llename los huecos de la semana").**
  Requiere mucha inteligencia para ser útil de verdad. V2.
  (También listado como no-incluido en el Calendario.)
- **Predicción de virality / "este post va a explotar".**
  Promesa que no podemos sostener con la data disponible. Sería
  el código que miente a otro nivel. No en V1.
- **Benchmarks contra otros creators / competidores.** Requiere
  data de terceros que no tenemos limpia. V2.
- **Configuración fina de la fuente de tendencias** (elegir
  manualmente qué cuentas o hashtags monitorear). V2; en V1 la
  vertical/región del onboarding alimenta todo.
- **Recordatorios push de "te toca publicar".** Las notifs van
  por Telegram/WhatsApp naturalmente. No hay sistema in-app de
  notificaciones en V1 (consistente con overview y calendario).

### Por qué importa documentar esto

Igual que en Chat y Calendario: el feature creep es tentación
constante, y Ritmo es especialmente vulnerable porque "predecir
tendencias" suena infinitamente expandible. Tener explícito qué
NO se hace —y por qué— protege el foco y, sobre todo, protege
la honestidad del módulo (que es su activo más frágil).

---

## 9. Cómo se integra Ritmo con el resto del producto

Ritmo es el **productor** de la capa estratégica. Su valor se
manifiesta tanto adentro (el dashboard) como afuera (los datos
que alimenta en otros módulos). Estos son los seis puntos donde
Ritmo entrega datos que otros módulos ya esperan recibir:

### Con Chat

- Las **2 cards dinámicas "🔥 Tendencia"** del estado vacío del
  Chat vienen de las tendencias de Ritmo.
- Los **chips de horarios óptimos** del drawer de programación
  del Chat (el "18:00 +18% engagement") vienen de los mejores
  horarios calculados por Ritmo.
- Cuando una propuesta de Ritmo se acciona, abre un chat nuevo
  con el tema y formato precargados.

### Con Calendario

- El **indicador de cadencia** del Calendario (los dots por red)
  consume los objetivos semanales definidos en Ritmo.
- Los **chips de horarios sugeridos** en el panel de día vacío
  del Calendario vienen de Ritmo.
- Las **bandas de fondo en vista semana** del Calendario
  (horarios óptimos) se alimentan de Ritmo.
- El **puntito de "horario óptimo no usado"** en las celdas del
  Calendario viene de Ritmo.
  Sin Ritmo configurado, varios de estos componentes del
  Calendario quedan en placeholder o ausentes. Por eso, en el
  roadmap, Ritmo es el módulo que sigue después del Calendario:
  cierra el circuito estratégico que esos consumidores ya esperan.

### Con Analíticas

Comparten la fuente de datos (PostFast) pero con verbo opuesto.
Analíticas muestra el pasado crudo (qué pasó con cada post);
Ritmo destila ese pasado en recomendación futura (mejores
horarios, qué tan consistente vas). El "+%" de horarios de
Ritmo y los reportes de Analíticas se alimentan de la misma
materia prima, presentada para dos intenciones distintas.

### Con Configuración (Voz de marca y onboarding)

- La **vertical y región** capturadas en onboarding alimentan
  el grounding de las tendencias (de qué mercado es el usuario,
  a qué audiencia le habla). Sin ese paso, las tendencias
  arrancan a ciegas sobre lo que más diferencia al producto.
- El **objetivo** ("Modo: Crecer") y la cadencia configurada en
  Ritmo persisten como parte del perfil estratégico del usuario.

### Con Biblioteca

Sin integración directa. Ritmo no genera assets; propone temas
que, al accionarse, generan contenido en el Chat, y es el Chat
el que guarda en Biblioteca.

Este nivel de integración es lo que hace que Presencia se sienta
como un producto coherente y no como módulos sueltos. Ritmo solo
sería un dashboard bonito; conectado, es el cerebro estratégico
que le da contexto al Chat y datos al Calendario.
