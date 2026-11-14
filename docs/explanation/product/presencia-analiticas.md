# Presencia — Módulo Analíticas

> Este documento describe el módulo de evaluación de Presencia: Analíticas.
> Cubre QUÉ hace, POR QUÉ está diseñado así y CÓMO se siente usarlo. Para el
> producto a nivel macro, leer primero `presencia-overview.md`; para su
> gemelo que mira hacia adelante, `presencia-ritmo.md`. Diseño: proyecto
> "Presencia Analytics Overview" en Claude Design (escritorio 1440, claro; el
> oscuro y el móvil se derivan de los tokens y del patrón de Ritmo). Se
> construye en F12 sobre la ingesta de F8.7.

---

## 1. Qué es y por qué importa

### Su rol

Analíticas responde _"¿cómo me fue?"_. Es el **retrovisor**: muestra qué pasó
con cada publicación que ya salió, sin recomendar nada. Ritmo toma ese mismo
pasado y lo convierte en una decisión ("publica los martes a las 6"); Analíticas
enseña la evidencia.

| Módulo         | Mira hacia | Pregunta                              |
| -------------- | ---------- | ------------------------------------- |
| Ritmo          | Adelante   | ¿Cuándo y sobre qué debería publicar? |
| Calendario     | Ahora      | ¿Qué pasa esta semana?                |
| **Analíticas** | **Atrás**  | **¿Cómo me fue?**                     |

### Un solo número para los dos

Ritmo y Analíticas hablan de la misma materia prima, así que **calculan con la
misma fórmula** (ADR-022). Si Ritmo dice "+18%" y Analíticas "+12%" para lo
mismo, el producto se contradice sobre su propio dato y nadie puede saber cuál
está mal. Por eso ninguna de las dos pantallas calcula nada: las dos le
preguntan al mismo motor.

### El principio: un número solo vive donde puede sostenerse

Es la misma regla de honestidad de Ritmo. Aquí tiene cuatro consecuencias que
se repiten en todo el módulo:

1. **Lo que la red no reporta se dice, no se rellena.** "No disponible" nunca
   es un cero.
2. **Las redes no se comparan entre sí.** Instagram reporta alcance, TikTok
   reporta vistas: son unidades distintas. Toda comparación es contra **tu
   propio promedio en esa misma red**.
3. **Sin muestra suficiente, no hay conclusión.** Se dice cuántas
   publicaciones faltan.
4. **Coincidencia no es causa.** Los hallazgos se escriben en pasado y con su
   base: "tuvieron", no "funcionan".

---

## 2. Cómo se siente: un flujo completo

Domingo. Jose lleva dos meses publicando con Presencia.

1. Abre **Analíticas**. Arriba: "Rendimiento de 23 publicaciones · últimos 30
   días" y cuatro números con su cambio contra los 30 días anteriores.
2. **Tus mejores publicaciones:** cinco, con la primera en grande. Cada una
   dice cuánto rindió sobre su promedio en esa red.
3. **Hallazgos:** "En Instagram, tus carruseles tuvieron 2.4 veces más
   interacción que tus imágenes sueltas. Basado en 18 publicaciones." Con un
   botón: "Crear en Chat".
4. Otro hallazgo habla de su voz: "En Instagram, tus publicaciones sin emojis
   tuvieron 31% más interacción. Basado en 14." Con dos botones: "Agregar a
   «Así escribes»" y "No". Agrega el rasgo.
5. Baja a las lentes. En **Por red** ve que LinkedIn dice "No disponible":
   LinkedIn no comparte estadísticas de perfiles personales. En **Por
   publicación** ordena por fecha y abre una.
6. El detalle muestra sus métricas, cuándo se midieron y cómo le fue a la
   misma idea en otras redes. "Abrir chat de origen" lo regresa a donde la
   escribió.

Otro día, desde el Chat: en una card publicada da clic en **"Ver
estadísticas"** y cae directo en ese detalle.

---

## 3. Los componentes y su propósito

### La barra de control

- **Periodo:** 7, 30 (por defecto) o 90 días.
- **Red:** todas, o una.
- Si los datos llevan rato sin actualizarse: "Actualizado hace 6 horas".

### El resumen del periodo

Cuatro números, cada uno con su cambio contra el periodo anterior del mismo
largo.

| Número            | Qué es                                                                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Publicaciones** | Cuántas salieron en el periodo                                                                                                                                                              |
| **Alcance**       | Personas alcanzadas, sumando las redes que lo reportan. Dice cuáles                                                                                                                         |
| **Interacciones** | Me gusta + comentarios + compartidas                                                                                                                                                        |
| **Engagement**    | Con una red elegida: su tasa (interacciones entre alcance) o, si esa red no reporta alcance, interacciones por publicación. Con "Todas las redes": el desglose por red, sin un número único |

**Por qué el cuarto número no es uno solo.** Una "tasa de engagement" que mezcle
Instagram con TikTok promedia tasas con conteos: da un número que parece dato y
no tiene unidad. El diseño original lo mostraba como "4.4%"; en su lugar la
celda lista cada red con su número. Al elegir una red, vuelve a ser un solo
número.

**Cómo se compara con el periodo anterior.** El total que ves es el de hoy (lo
mismo que ves en la red). Pero el cambio "vs periodo anterior" compara cada
publicación **en sus primeras 24 horas**: si no, una publicación de hace seis
semanas siempre le ganaría a una de ayer, solo por haber tenido más tiempo. Un
tooltip lo explica.

### Tus mejores publicaciones

Las cinco que más rindieron **sobre tu promedio en su red**. Un TikTok con
"+62% sobre tu promedio en TikTok" y un post de Instagram con "+40% sobre tu
promedio en Instagram" sí se pueden ordenar entre sí; "6.8% contra 5.9%" no.

Solo aparecen publicaciones de redes donde ya hay muestra (10 medidas; ver
"Qué ventana mira cada cosa" en la sección 4). Sin eso, la sección dice qué
falta en vez de inventar un ranking.

Si la imagen de una publicación se eliminó de Biblioteca, su miniatura muestra
el ícono de su formato, igual que en el Calendario. Aplica también a la tabla
y al detalle.

### Hallazgos

Hasta tres tarjetas. Cada una dice qué se vio, **en qué red**, sobre cuántas
publicaciones, y ofrece una acción. Miran siempre tus últimos 90 días, y el
subtítulo de la sección lo dice. Detalle en la sección 5.

### Las tres lentes

Tres formas de ver las mismas publicaciones:

- **Por red.** Una tarjeta por red: su engagement, cuántas publicaciones,
  alcance (o lo que reporte), interacciones y unas barras con la evolución del
  periodo. Una red que no reporta lo dice ahí mismo, con cuántas publicaciones
  tuvo.
- **Por publicación.** Una tabla: miniatura, red y título, fecha, alcance,
  interacciones y rendimiento. Se ordena por cualquier columna.
- **Por concepto.** La misma idea publicada en varias redes, lado a lado. "Mejor
  en TikTok" sale de dónde rindió más **sobre tu promedio de esa red**, no del
  número más grande. Solo incluye lo que se adaptó a más de una red dentro de
  Presencia.

### El detalle de una publicación

Panel a la derecha (pantalla completa en móvil):

- Vista previa, red, fecha y hora de publicación.
- **Métricas:** alcance, impresiones, me gusta, comentarios y compartidas, las
  que esa red reporte. Lo que no, "No disponible", con el motivo.
- **Cuándo se midió:** "Medido hace 3 horas".
- **En otras redes:** si es parte de un concepto.
- **Acciones:** "Ver en Instagram", "Abrir chat de origen", "Adaptar a otra
  red".

### "Ver estadísticas"

El botón que estaba apagado desde F6 se prende en las cards publicadas: en el
Chat, en el panel de la publicación y en el Calendario. Lleva a Analíticas con
el detalle de esa publicación abierto.

---

## 4. Cómo se mide, sin letra chiquita

### De dónde salen los números

De la misma ingesta que Ritmo (F8.7): Presencia le pregunta a la red por cada
publicación, seguido al principio (cada hora en sus primeras 12) y cada vez
menos, hasta los 30 días. Después de eso el número se congela: es el último
que se midió.

### Qué reporta cada red

| Red                        | Qué da                                                                |
| -------------------------- | --------------------------------------------------------------------- |
| Instagram, Facebook        | Alcance, impresiones, me gusta, comentarios, compartidas              |
| TikTok, YouTube            | Me gusta, comentarios, compartidas; reportan vistas en vez de alcance |
| Threads                    | Lo que reporte de las cinco                                           |
| LinkedIn (perfil personal) | **Nada.** LinkedIn solo comparte estadísticas de páginas de empresa   |
| X                          | **Nada** por ahora                                                    |

### Los cuatro estados de una publicación

| Estado             | Cuándo                                                                                                      | Qué se ve                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Medida             | Tiene números                                                                                               | Sus métricas                                                        |
| Métricas en camino | Salió hace poco y la red aún no reporta                                                                     | "Métricas en camino. Instagram suele tardar unas horas en reportar" |
| No reporta         | La red contestó sin números                                                                                 | "No disponible", con el motivo de esa red                           |
| Sin medición       | Presencia no pudo seguirla (se publicó por un proveedor que no devuelve el identificador de la publicación) | "Sin medición para esta publicación"                                |

Son estados distintos del mundo, no grados del mismo vacío. Decirle "sigue
publicando para ver tus números" a alguien con perfil personal de LinkedIn
sería prometerle algo que nunca va a llegar.

### Qué ventana mira cada cosa

El periodo elegido (7, 30 o 90 días) decide **qué publicaciones se listan**.
No decide con cuántas se saca un promedio: con 7 días casi nadie tendría
muestra, y las secciones aparecerían y desaparecerían al cambiar el selector.

| Qué                                                          | Ventana                                                                                                        |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Resumen, lentes, tabla                                       | Las publicaciones del periodo elegido                                                                          |
| Cambio "vs periodo anterior"                                 | El periodo elegido contra el anterior del mismo largo                                                          |
| "Tu promedio en esa red" (mejores, rendimiento, "Mejor en…") | El periodo elegido o los últimos 30 días, lo que sea más largo. Con 30 días es el mismo promedio que usa Ritmo |
| Hallazgos                                                    | Siempre los últimos 90 días, sin importar el selector. La sección lo dice: "En tus últimos 90 días"            |

Los umbrales (10 publicaciones medidas en la red, 5 por grupo) se cuentan
dentro de esa ventana, no dentro del periodo elegido.

---

## 5. Hallazgos, y la voz

### Qué es un hallazgo

Una diferencia en **tus** publicaciones, dentro de **una** red, que aguanta
tres pruebas:

1. **Muestra:** al menos 5 publicaciones en cada grupo comparado y 10 en esa
   red. Es el mismo umbral de Ritmo: dos umbrales para la misma pregunta
   ("¿alcanza la muestra?") serían dos respuestas distintas.
2. **Tamaño:** una diferencia de al menos 25%.
3. **No depende de un golpe de suerte:** si quitas la mejor publicación del
   grupo ganador, la diferencia sigue ahí. Un solo post viral no es un patrón.

Todo se compara a las 24 horas de publicado, para que la edad no decida.

### Qué se compara

| Tipo                  | Ejemplo                                                                                                           | Acción                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **Formato**           | Carrusel contra imagen suelta; video contra texto                                                                 | "Crear en Chat"                   |
| **Día de la semana**  | Martes y jueves contra el resto                                                                                   | "Ver en Ritmo"                    |
| **Rasgo de tu texto** | Con y sin emojis, con y sin hashtags, corto contra largo, abre con pregunta o no, con y sin signos de exclamación | "Agregar a «Así escribes»" / "No" |

Los rasgos se leen del texto que se publicó, no del borrador.

### Cómo se dice

> En Instagram, tus publicaciones sin emojis tuvieron 31% más interacción que
> las que sí llevan. Basado en 14 publicaciones (6 sin, 8 con).

- **En pasado.** "Tuvieron", nunca "funcionan mejor" ni "te conviene".
- **Con su red y su base**, siempre.
- **Sin causa.** Presencia vio una coincidencia en tus datos; no sabe por qué
  pasó. Puede que los posts sin emojis fueran, además, los de un tema que le
  importa más a tu audiencia.

### La voz ↔ el engagement

Cuando el hallazgo es sobre un rasgo de tu texto, es también una pista sobre
tu voz. Funciona igual que «Aprender de mis ediciones»
(`presencia-configuracion-voz-de-marca.md`, sección 14), con otra evidencia:
allá, lo que tú corriges; aquí, cómo le fue.

- **"Agregar a «Así escribes»"** suma el rasgo ("Casi sin emojis") a tu Voz de
  marca. Desde ahí, lo que Presencia escriba por ti lo respeta.
- **"No"** se anota: ese hallazgo no vuelve a preguntar con la misma
  evidencia, solo con publicaciones posteriores.
- **Si tu voz ya lo dice** ("Sin emojis"), el hallazgo se muestra sin botón:
  confirma lo que ya haces.
- **Si tu voz dice lo contrario** ("Usa muchos emojis"), no hay "Agregar". El
  hallazgo dice "Tu voz dice «Usa muchos emojis»" y ofrece "Revisar mi voz",
  que lleva a Configuración › Voz de marca, y "No", que hace lo mismo que en
  una propuesta: se anota y no vuelve con la misma evidencia. Presencia nunca
  cambia ni quita un rasgo por su cuenta.
- **La propuesta también aparece en Configuración › Voz de marca**, junto a
  las de tus ediciones, con el mismo punto de aviso. Decidir en un lugar la
  resuelve en los dos.
- **Con «Aprender de mis ediciones» apagado**, las propuestas no aparecen en
  Configuración. El hallazgo en Analíticas sigue ahí: es un dato sobre tus
  publicaciones, y viniste a verlo.

**Nada cambia sin que digas que sí.** Es la misma promesa de toda la voz viva.

---

## 6. Estados especiales

### Cero absoluto

Sin publicaciones: "Todavía no hay datos. Cuando publiques tus primeras
piezas, aquí vas a ver cómo te fue." Con "Crear mi primera publicación".

### Poca data

Hay publicaciones pero no alcanzan para comparar. Los números se muestran; los
cambios dicen "Sin periodo anterior para comparar"; Hallazgos dice "Con unas
publicaciones más encontraremos patrones en tu contenido". Nada se inventa.

### Métricas en camino

Una publicación de hace dos horas aparece con su aviso azul en vez de ceros.

### Red que no reporta

LinkedIn personal y X: su tarjeta en "Por red" lo dice y cuenta sus
publicaciones. No es un error ni algo que el creator pueda arreglar.

### Cuenta por reconectar

La red sí reporta, pero la conexión se cayó: "Necesitamos permiso para ver tus
estadísticas de Instagram" + "Reconectar", que lleva a Configuración › Canales
conectados.

### Datos desactualizados

Si la última medición tiene horas: "Actualizado hace 6 horas" en la barra de
control. Lo demás se ve igual; es una nota, no una alarma.

### Cargando

Esqueletos con la forma real de cada sección.

### Error

"No pudimos cargar tus analíticas. Tus datos siguen ahí. Inténtalo de nuevo."

- "Reintentar". (El diseño no lo traía.)

### Publicación fuera del periodo

Si "Ver estadísticas" abre una publicación más vieja que el periodo elegido,
el detalle abre igual. La lista de atrás no cambia.

---

## 7. Decisiones de producto importantes

### Por qué una vista y no tabs por sección

Mismo razonamiento que Ritmo: resumen, mejores y hallazgos son lo que se lee
de un vistazo; las lentes son para escarbar. Una sola pantalla, ordenada de
lo que se mira a lo que se consulta.

### Por qué las lentes sí son tabs

Las tres muestran **lo mismo** cortado distinto. Verlas a la vez sería repetir
la información tres veces.

### Por qué "sobre tu promedio" y no el número crudo

El número crudo premia a la red, no a la publicación. Un TikTok mediocre
siempre va a tener más vistas que un gran post de LinkedIn. "Sobre tu promedio
en esa red" responde lo que el creator quiere saber: cuáles de **mis**
publicaciones salieron mejor de lo normal.

### Por qué los hallazgos piden tanto para aparecer

Un hallazgo falso es peor que ninguno: el creator cambia su contenido por un
ruido. Con 5 contra 5 publicaciones la estadística es frágil; por eso además
del umbral se pide una diferencia grande y que no dependa de un solo post. Los
primeros meses habrá pocos hallazgos, y está bien.

### Por qué el hallazgo de voz propone y no aplica

Presencia ve coincidencias, no causas. La decisión de cambiar cómo suena una
marca es del creator, y con un clic es suficiente fricción para que sea suya.

### Por qué sin librería de gráficas

Las únicas gráficas son barras chicas. Se dibujan a mano, como los mapas de
calor de Ritmo y el Calendario (ADR-018): una librería pesaría más que todo lo
que se dibuja.

---

## 8. Lo que conscientemente NO incluye en V1

El diseño de Claude Design dibuja más de lo que V1 construye. Lo que queda
fuera, y por qué:

- **Tipo de contenido por IA** (educativo, personal, promocional…), su columna
  y su filtro. Necesita clasificar cada publicación con un modelo. Es el
  insight del overview ("tus posts educativos…") y es el primer candidato
  cuando V1 esté en uso.
- **Historial importado.** Publicaciones anteriores a Presencia, con su marca
  "Importada". Depende de un endpoint del proveedor que nadie ha sondeado.
- **Métricas de cuenta:** seguidores, visitas al perfil, alcance de la cuenta.
  La ingesta es por publicación; esto sería otra tabla y otro job, y nacería
  vacío.
- **Reporte en PDF** y **filtro por carpeta o cliente.** Son la herramienta
  del community manager; van cuando las carpetas sean clientes (F12.7).
- **Periodo personalizado.** Tres ventanas alcanzan, y las publicaciones dejan
  de medirse a los 30 días.
- **Guardadas, tiempo de visualización, espectadores únicos.** La ingesta
  normaliza cinco métricas.
- **Gráfica de evolución por publicación.** Los datos existen; el detalle
  muestra el último número.
- **Comparar redes entre sí** y **benchmarks contra otros creators.**
- **Predicción** ("este post va a explotar"). Mismo no-objetivo que en Ritmo.
- **Actualización en vivo.** Los números cambian cada hora; se refrescan al
  entrar.

---

## 9. Cómo se integra con el resto del producto

**Con Ritmo:** mismo motor, verbo opuesto. El hallazgo de día de la semana
manda a Ritmo, que es donde se decide el horario.

**Con Chat:** "Ver estadísticas" en las cards publicadas trae aquí. "Crear en
Chat" de un hallazgo abre un chat nuevo con el formato precargado, como las
propuestas de Ritmo. "Abrir chat de origen" regresa a donde nació la
publicación.

**Con Calendario:** "Ver estadísticas" en las publicaciones del pasado.

**Con Configuración (Voz de marca):** los hallazgos de rasgos proponen
ajustes a «Así escribes» (sección 5).

**Con Biblioteca:** las miniaturas son las imágenes de Biblioteca. Si una se
elimina, la publicación muestra el ícono de su formato; sus números no
cambian.

---

## 10. Pendiente de diseño (brief para Claude Design)

El proyecto "Presencia Analytics Overview" cubre el núcleo en escritorio y
claro. Falta una pieza nueva y dos ajustes; el oscuro y el móvil se derivan en
código.

### 10.1 El hallazgo de voz (pieza nueva)

**Dónde:** en "Hallazgos", junto a los de formato y día. Misma tarjeta, con
otra acción.

**Contenido:** la frase del hallazgo, su base ("Basado en 14 publicaciones (6
sin, 8 con)") y una línea chica que diga qué se agregaría: "Se suma a «Así
escribes»: Casi sin emojis".

**Variantes a dibujar:**

| Variante             | Qué se ve                                                                            |
| -------------------- | ------------------------------------------------------------------------------------ |
| Propone              | "Agregar a «Así escribes»" (primario) y "No"                                         |
| Agregado             | Confirmación en la misma tarjeta: "Agregado a tu voz" + "Ver mi voz"                 |
| Ya lo dice tu voz    | Sin botones: "Tu voz ya lo dice: «Sin emojis»"                                       |
| Contradice tu voz    | "Tu voz dice «Usa muchos emojis»" + "Revisar mi voz" y "No"                          |
| «Así escribes» lleno | 8 rasgos ya: "Tu voz ya tiene 8 rasgos. Quita uno para agregar este." + "Ver mi voz" |

**Referencia:** la tarjeta de propuesta de «Aprender de mis ediciones» en
"Voz de marca v3". Debe sentirse de la misma familia.

**Anchos:** 1440 y 390, claro y oscuro.

### 10.2 Ajuste: la celda de engagement con "Todas las redes"

En lugar de "4.4%", una lista corta: logo de la red, su número y su unidad
("5.2%" o "86 por publicación"), hasta 4 redes. Con una red elegida, vuelve al
número grande del diseño actual.

### 10.3 Ajuste: "Tus mejores publicaciones"

El número grande de cada tarjeta pasa de "6.8% engagement" a "+62% sobre tu
promedio en TikTok". El número crudo queda como dato secundario.

### 10.4 Lo que se quita del diseño

El botón "Generar reporte", el filtro "Todas las carpetas", "Personalizado" en
el periodo, la columna y el filtro "Tipo de contenido", la marca "Importada",
el bloque "Métricas de cuenta", y en el detalle las filas de guardadas, tiempo
promedio y espectadores únicos (sección 8).
