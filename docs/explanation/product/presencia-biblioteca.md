# Presencia — Módulo Biblioteca

> Este documento describe el repositorio de imágenes de Presencia: el módulo
> Biblioteca. Cubre QUÉ hace, POR QUÉ está diseñado así y CÓMO se siente
> usarlo. Para el producto a nivel macro, leer primero `presencia-overview.md`.
> Diseño: proyecto "Presencia - Biblioteca" en Claude Design (claro y oscuro,
> 1280 / 768 / 390). Se construye en F12.

---

## 1. Qué es y por qué importa

### Su rol

Biblioteca es donde vive **cada imagen** que pasó por Presencia: las que generó
la IA y las que subió el creator. Cada una recuerda de dónde salió (su chat, su
card) y en qué publicaciones se usa. Es el "Drive creativo" de la app, con una
diferencia: nadie tiene que acordarse de guardar.

Responde una pregunta que hoy no tiene respuesta: _"¿dónde quedó aquella imagen
del café que generé hace tres semanas?"_. Hasta F12 esa imagen solo se podía
encontrar abriendo el chat correcto y la card correcta.

### Qué NO es

- **No es el archivo de tus publicaciones.** Los textos, guiones y borradores
  viven en el Chat y se ven en el Calendario; se encuentran con la búsqueda
  global (Ctrl+K). Biblioteca guarda **medios**, no posts. Versiones viejas de
  estos documentos decían que "cada publicación generada se guarda en
  Biblioteca": lo que se guarda solo es la imagen.
- **No es un editor.** Regenerar, variar el estilo o recortar se hace en la
  card, donde está el contexto de la publicación.
- **No es curada.** Todo entra solo, lo elegido y lo descartado. Quien quiera
  limpiar, borra.

### El principio: una imagen, una fila

Una imagen existe una sola vez. Si la usas en tres cards, sigue siendo una
imagen con tres usos, no tres copias. De ahí salen dos datos distintos que la
pantalla nunca confunde:

- **Dónde nació:** el chat y la card donde se generó o se subió. No cambia
  al usarla en otro lado.
- **Dónde se usa:** las cards que hoy la tienen puesta. Cambia cada vez que
  eliges otra imagen en una card.

Una imagen puede no tener ninguna de las dos: la subiste directo a Biblioteca,
o la generaste suelta (sección 4).

**Si eliminas el chat donde nació, la imagen se queda.** Pierde ese dato: el
panel dice "Sin chat de origen", "Abrir en el chat" y "Ver card" desaparecen,
y ya no se encuentra buscando el título de ese chat. Eliminar un chat nunca
elimina imágenes; eso se hace aquí.

---

## 2. Cómo se siente: un flujo completo

Martes. Jose quiere reusar una foto de su taller en un post nuevo de Instagram.

1. Abre **Biblioteca**. Arriba, cuatro atajos; abajo, sus imágenes en una
   cuadrícula pareja, agrupadas por fecha: "Hoy", "Esta semana", "Septiembre".
2. Escribe "taller" en el buscador. Encuentra tres: dos generadas y una foto
   suya. La búsqueda miró lo que pidió al generar, el texto alternativo y el
   título del chat.
3. Abre la foto. El panel de la derecha le dice que la subió él, que nació en
   el chat "Lanzamiento curso de fotografía" y que hoy no está en ninguna card.
4. Vuelve a su borrador de Instagram, toca la imagen de la card y elige
   **"Usar de Biblioteca"**. El mismo buscador, en un modal. Elige la foto y
   queda puesta.
5. De regreso en Biblioteca ve seis variantes viejas que ya no le sirven. Las
   marca y las elimina. Una estaba en una publicación programada: Presencia
   no la borra y le dice por qué.

---

## 3. Los componentes y su propósito

### Los atajos (bento)

Cuatro celdas que aplican un filtro con un clic; un segundo clic lo quita.

| Atajo                     | Qué muestra                                       |
| ------------------------- | ------------------------------------------------- |
| **Generadas esta semana** | Lo generado con IA en los últimos 7 días          |
| **Listas para publicar**  | Imágenes elegidas en cards que siguen en borrador |
| **Subidas por ti**        | Lo que subiste tú                                 |
| **Publicadas**            | Imágenes en cards ya publicadas                   |

El primero se llama "Esta semana" en el diseño. Se renombra porque la
cuadrícula tiene un grupo de fecha con ese mismo nombre que incluye también lo
subido: dos conjuntos distintos con una sola etiqueta.

Razón: las cuatro preguntas más frecuentes ("¿qué hice esta semana?", "¿qué me
falta programar?") no deberían costar tres clics en filtros. En móvil van en
2×2, sin carrusel: un gesto horizontal escondería la mitad. Se ocultan mientras
buscas, para no competir con los resultados.

### La barra de herramientas

- **Buscador:** "Busca por prompt, texto alternativo o chat". Ignora acentos y
  filtra mientras escribes.
- **Filtros:** Origen (generada con IA / subida por ti), Red, Estado de la card
  (borrador, programado, publicado) y Elegidas / Descartadas. Un filtro activo
  muestra su valor y una ✕; "Limpiar filtros" los quita todos.
- **Cuadrícula o lista.** La lista es estilo Drive: nombre, chat, red, fecha y
  peso.
- **Sin selector de orden.** Lo más nuevo va arriba, siempre. Se agrega si
  alguien lo pide.

### La cuadrícula

Celdas cuadradas iguales; la imagen se ve **completa**, sin recortes, sobre un
fondo tenue. Así el formato real (4:5, 1:1, 16:9) se reconoce de un vistazo.

Cada celda dice su origen (IA o subida), la red y el estado de su card, y lleva
la marca "Elegida" si está puesta en una publicación. Al pasar el cursor:
abrir, descargar y copiar el prompt.

**Los recortes no aparecen.** Cuando una imagen entra a un carrusel con otra
proporción, Presencia guarda una copia recortada; es la misma imagen, así que
Biblioteca muestra solo la original y cuenta el uso del recorte como suyo.

### El panel de detalle

Se abre a la derecha y empuja la cuadrícula (pantalla completa en móvil).
Muestra:

- La imagen, con **Descargar** y **Eliminar**.
- **"Abrir en el chat"** y **"Ver card"**, si nació en uno.
- Origen, y si está "Elegida para su card" o es una "Variante descartada".
- **Prompt**, con "Copiar". Es lo que pediste tú, no la instrucción interna que
  arma Presencia con tu estilo y tu nicho. Si la imagen salió de editar otra,
  dice "Instrucción de edición".
- **Texto alternativo.** Solo lectura aquí; se edita desde la card.
- **Historial de versiones:** la original y sus ediciones, con la actual
  marcada. Se puede saltar de una a otra.
- Fecha, dimensiones, peso y formato.

### Selección múltiple

Al marcar una imagen, todas muestran su casilla y aparece una barra flotante
con **Descargar** y **Eliminar**. Mientras hay selección, tocar una imagen la
marca en vez de abrirla.

### Subir

Arrastra archivos a cualquier parte de la pantalla, o usa "Subir". JPG, PNG o
WebP de hasta 10 MB, varios a la vez, con el avance de cada uno. Los errores
dicen qué pasó y qué hacer:

- "Solo aceptamos JPG, PNG o WebP. Prueba con otro archivo."
- "El límite es 10 MB. Tu archivo pesa 14 MB. Prueba comprimirlo o sube uno
  más pequeño."

Lo subido aquí no tiene card ni chat: queda como "Subida a Biblioteca", lista
para usarse.

### "Elegir de Biblioteca"

El mismo buscador, en un modal, con tres pestañas (Todas, Generadas con IA,
Subidas por ti). Se abre desde la imagen de una card con "Usar de Biblioteca".
Si no encuentras lo que buscas, "Subir desde tu equipo" está ahí mismo.

Cualquier imagen tuya sirve para cualquier card, sin importar dónde nació. En
un carrusel con otra proporción, Presencia la recorta al entrar, como hace con
todo lo que entra a un carrusel.

---

## 4. Imagen suelta: generar sin crear un borrador

Hasta F12 una imagen solo podía nacer dentro de una card. Era un no-objetivo
escrito (`presencia-chat.md` §6): "no hay un generador de imágenes genérico
desligado de una publicación". Jose lo sacó de ahí el 2026-11-06.

**Qué cambió de opinión:** a veces la imagen viene antes que el post. Un
creator quiere el fondo para una cita, una portada, una idea visual que
todavía no sabe en qué publicación va a caer. Obligarlo a crear un borrador
que no quiere, solo para tener dónde colgar la imagen, es fricción inventada.

**Qué no cambió:** Presencia no es Midjourney. La imagen suelta se guarda en
Biblioteca para **usarse en una publicación después**. No hay galería pública,
ni estilos fuera de los siete de Presencia, ni lotes de veinte.

### Desde dónde se pide

| Entrada             | Cómo funciona                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Biblioteca**      | Botón "Generar imagen": describes lo que quieres, eliges proporción y generas                               |
| **Chat, propuesta** | Le pides una imagen al asistente; él **propone** la descripción y la proporción, y tú das clic en "Generar" |
| **Chat, directo**   | Solo si lo pides sin ambigüedad ("genera ahora una imagen de…"): la genera sin clic                         |

La propuesta es el camino normal, por la misma razón que en una card: **nada se
cobra sin que tú lo pidas**. El asistente puede sugerir una imagen porque le
pareció buena idea; gastar tu cuota es decisión tuya.

El camino directo existe porque decir "hazme una imagen de un café" y recibir
un botón se siente burocrático. Pero es estrecho a propósito: si la petición es
ambigua ("estaría bien una imagen"), Presencia propone. Y nunca más de una
imagen directa por mensaje.

En Telegram siempre es propuesta, y llega como texto con el botón "Abrir en
Presencia". Mandar la foto al chat de Telegram queda en el backlog.

### Qué se puede elegir

- **Proporción:** 1:1, 4:5 o 16:9, las mismas tres de las cards. Sin card no
  hay red que la decida. No hay vertical 9:16 (historias): ninguna card de
  Presencia la usa todavía.
- **Estilo:** por defecto el de tu Voz de marca. En Biblioteca se puede
  cambiar para esa imagen entre los siete estilos, igual que al generar en una
  card. En el chat no hay selector: usa el de tu voz, y si quieres otro se lo
  dices al asistente en la descripción.
- **Una imagen por clic**, igual que en una card (decisión del 2026-10-07).

### Cómo se cobra

Igual que la imagen de una card: mismo asiento en el ledger, mismo costo, y
solo cuando la imagen se entrega. Si falla o el proveedor la rechaza, no se
cobra. El botón muestra el porcentaje de cuota, nunca créditos.

### Solo imagen

- **Video con IA** sigue fuera (overview §8): caro, lento y de calidad dudosa.
- **Audio** no tiene dónde usarse: ninguna red de Presencia publica audio
  suelto, y las notas de voz de Telegram se transcriben y no se guardan.

---

## 5. Estados especiales

### Vacía

"Aquí vivirán todas tus imágenes. Cada imagen que generes desde una card del
chat se guarda sola, con su chat y su card de origen. También puedes subir las
tuyas." Con dos salidas: "Ir a Chats" y "Subir imágenes". La barra de
herramientas no aparece: no hay nada que filtrar.

### Sin resultados

"Sin resultados para «atardecer en la playa»" o "Ninguna imagen coincide con
estos filtros", y debajo qué se buscó: "Buscamos en prompts, textos
alternativos y títulos de chats. Prueba con otras palabras o quita algún
filtro." Un botón limpia todo.

### Cargando

Esqueletos con proporciones reales, para que la cuadrícula no brinque al
llegar las imágenes.

### Error

"No pudimos cargar tu Biblioteca. Tus imágenes siguen guardadas. Revisa tu
conexión e inténtalo de nuevo." Lo primero que se aclara es que no perdió
nada.

### Eliminar

Siempre pide confirmación y no tiene deshacer: "Se eliminará «cafe-luz.png» de
tu Biblioteca y no podrás recuperarla."

Lo que pasa depende de dónde esté puesta la imagen:

| La imagen está en…                        | Qué pasa                                                                                                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ninguna card                              | Se elimina                                                                                                                                                     |
| Un borrador (o una publicación que falló) | Se elimina y esa card se queda sin imagen. La confirmación dice cuántos borradores la pierden                                                                  |
| Una publicación **programada**            | **No se elimina.** "Esta imagen está en una publicación programada de Instagram. Cancela la programación para eliminarla."                                     |
| Una publicación ya publicada              | Se elimina. La publicación en la red no cambia; dentro de Presencia (Calendario, Analíticas) su miniatura pasa al ícono de su formato. La confirmación lo dice |

**Por qué se bloquea la programada.** El diseño original avisaba "la card se
quedará sin imagen" y dejaba seguir. Eso sería mentira: al programar, la imagen
ya se entregó al proveedor de publicación, así que el post saldría con ella de
todos modos. Las alternativas eran tumbar la programación desde un clic en
otra pantalla (demasiado daño para un gesto de limpieza) o borrar y dejar que
se publique (el aviso tendría que decir "igual va a salir"). Bloquear y decir
qué hacer es lo único que no sorprende.

En una selección múltiple, las bloqueadas se quedan y las demás se eliminan;
el resultado dice cuáles y por qué.

---

## 6. Decisiones de producto importantes

### Por qué cuadrícula pareja y no masonry

Masonry luce más, pero con proporciones mezcladas rompe el orden de lectura y
deja huecos irregulares al final de cada grupo de fecha. La cuadrícula pareja
se lee de izquierda a derecha, los encabezados de fecha cortan limpio y la
selección múltiple sigue un orden predecible. Es la vista de archivos de
Figma, no un tablero de Pinterest: se viene a encontrar, no a inspirarse.

### Por qué todo entra solo

Guardar a mano es una decisión más por imagen, y la respuesta casi siempre
sería "sí". El costo de guardar de más es un borrado; el de no guardar es una
imagen perdida que ya se pagó.

### Por qué se usa por referencia y no se copia

Si usar una imagen en otra card creara una copia, Biblioteca se llenaría de
duplicados idénticos y "¿dónde se usa esta imagen?" dejaría de tener respuesta.
La excepción es el recorte de carrusel, que sí es otro archivo, y por eso se
esconde detrás de su original.

### Por qué eliminar es definitivo

Una papelera es un segundo lugar donde viven las cosas, con su propia pantalla
y su propio vaciado. El creator que pide eliminar quiere que desaparezca. La
confirmación protege del clic equivocado; la papelera se agrega si aparecen
pérdidas reales.

### Por qué el prompt que se muestra es el tuyo

Al generar, Presencia arma una instrucción larga con tu estilo, tu nicho y el
encuadre de la red. "Copiar prompt" entrega lo que **tú** pediste: es lo que
reconoces y lo que tiene sentido pegar en otro lado. Las imágenes anteriores a
F10.6 solo tienen la instrucción completa, y eso es lo que muestran.

---

## 7. Lo que conscientemente NO incluye en V1

- **Video y audio.** Solo imágenes (sección 4).
- **Documentos (PDF, texto).** Los adjuntos del chat siguen viviendo en su
  chat. Los archivos de referencia de una carpeta llegan con las carpetas con
  contexto (F12.7).
- **Carpetas, etiquetas o álbumes dentro de Biblioteca.** La organización es
  la búsqueda y los filtros.
- **Publicaciones de texto.** Biblioteca guarda medios (sección 1).
- **Editar, regenerar o variar desde Biblioteca.** Se hace en la card.
- **Editar el texto alternativo desde Biblioteca.** Se edita en la card.
- **Ordenar** por otra cosa que no sea la fecha.
- **Papelera y deshacer.**
- **Generar varias imágenes a la vez.**
- **Proporción vertical 9:16** para historias.
- **Mandar la imagen por Telegram.**
- **Fotos de referencia para la Voz de marca** (tu cara, tu producto). Sigue
  en el backlog desde F12.5; cuando llegue, saldrán de Biblioteca.

---

## 8. Cómo se integra con el resto del producto

**Con Chat:** cada imagen que se genera o se sube en una card aparece en
Biblioteca sola, con su chat de origen. "Abrir en el chat" regresa a él. El
asistente puede proponer imágenes sueltas (sección 4).

**Con las cards:** "Usar de Biblioteca" pone cualquier imagen tuya en
cualquier card. El historial de versiones de una card incluye la imagen que
trajiste de fuera.

**Con Calendario:** el filtro "Estado de la card" y el atajo "Listas para
publicar" leen el mismo estado que el Calendario.

**Con Analíticas:** las miniaturas de Analíticas son estas imágenes. Eliminar
la de una publicación ya publicada deja su ícono de formato allá; los números
no cambian.

**Con Configuración (Voz de marca):** el estilo de imagen de la voz se aplica
a las imágenes sueltas. El botón de «Tus ejemplos» que decía "Elegir de
Biblioteca" pasa a "Elegir de tus publicadas": un ejemplo de voz es un post,
no una imagen (ver `presencia-configuracion-voz-de-marca.md`).

**Con Carpetas (F12.7):** los archivos de una carpeta van a salir de aquí. Por
eso desde F12 una imagen no depende de ningún chat ni de ninguna card para
existir. Las carpetas no se construyen en esta fase.

---

## 9. Pendiente de diseño (brief para Claude Design)

Dos piezas de este módulo no están en el proyecto "Presencia - Biblioteca". Se
diseñan antes de construirse; el resto ya está.

### 9.1 Modal "Generar imagen" (Biblioteca)

**Dónde:** botón "Generar imagen" en el encabezado de Biblioteca, junto a
"Subir". También en el estado vacío, como tercera salida.

**Qué pide:**

- Un campo de texto: "Describe la imagen que quieres". Hasta 2000 caracteres.
- Proporción: 1:1, 4:5, 16:9 (segmentado, con la silueta de cada una).
- Estilo: muestra el de tu Voz de marca, con la opción de cambiarlo solo para
  esta imagen (los 7 estilos de F10.6, el mismo selector de la card). El
  bloque del chat (9.2) no lleva selector de estilo.
- Botón "Generar · X% de tu cuota". Nunca créditos.

**Estados a dibujar:**

| Estado    | Qué se ve                                                                                                                   |
| --------- | --------------------------------------------------------------------------------------------------------------------------- |
| Reposo    | El formulario                                                                                                               |
| Generando | El formulario bloqueado y la imagen en proceso (10 a 60 s). Se puede cerrar el modal: la imagen llega igual a la cuadrícula |
| Lista     | La imagen, con "Generar otra" y "Cerrar". Usarla en una publicación se hace desde la card, con "Usar de Biblioteca"         |
| Falló     | "No pudimos generar la imagen. No se cobró." + "Reintentar"                                                                 |
| Rechazada | El proveedor no la quiso generar: "No pudimos generar eso. Prueba describirla de otra forma. No se cobró."                  |
| Sin cuota | El mismo modal de cuota del chat                                                                                            |

**En la cuadrícula:** mientras genera, una celda en proceso arriba de "Hoy".

**Anchos:** 1280 y 390, claro y oscuro.

### 9.2 La imagen en el chat

**Dónde:** dentro de la respuesta del asistente, como bloque propio (no es una
card de publicación: no tiene red, ni estado, ni panel).

**Estados a dibujar:**

| Estado            | Qué se ve                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| Propuesta         | La descripción, la proporción (editable) y "Generar · X% de tu cuota"                                     |
| Generando         | El mismo bloque con la imagen en proceso. También es el estado inicial cuando el creator la pidió directo |
| Lista             | La imagen, "Ver en Biblioteca" y "Descargar"                                                              |
| Falló / Rechazada | Mismo copy que el modal, con "Reintentar"                                                                 |
| Sin cuota         | "Te quedaste sin cuota este mes" + "Ver plan"                                                             |

**Reglas:** el bloque sobrevive a recargar la página en cualquier estado. La
propuesta nunca caduca: se puede generar días después.

**Anchos:** el chat a 1280 (con y sin panel abierto) y 390, claro y oscuro.
