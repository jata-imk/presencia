# Presencia — Configuración: Voz de marca (Decisiones de producto)

> Este documento resuelve la sub-sección más crítica de Configuración:
> **Voz de marca**. No es diseño visual — es la capa de decisiones de
> producto previa, con el mismo nivel de profundidad que las secciones
> 2-3 de `presencia-calendario.md` y `presencia-ritmo.md`. Sirve de
> base para el prompt real hacia Claude Design.
>
> Contexto heredado: `presencia-overview.md` (sección 3, "La página de
> Configuración") ya deja claro el rol de Voz de marca ("alimenta TODO
> el output de la IA") y que el "Tono" no es un módulo aparte — vive
> acá. Este doc no repite esa base, la extiende.

---

## 1. Qué es y por qué importa

### Su rol

Voz de marca es la **fuente de verdad persistente** de cómo suena el
usuario. Todo lo que genera el Chat —en cualquiera de los tres
arquetipos de card (visual-first, guion-de-video, texto-first)— lee de
acá. Si esto está mal configurado, el producto entero suena a "IA
genérica hablando español de aeropuerto", que es exactamente lo que
Presencia existe para evitar.

### Su relación con el onboarding: supraconjunto editable, una sola fuente de verdad

El primer paso del onboarding ("¿Cómo hablas?", no se puede saltar)
captura la versión mínima: mercado y región, nicho, registro. Es, en
términos de código, el **constructor con los parámetros obligatorios**
— lo mínimo para que el objeto `VozDeMarca` exista y no truene el
resto de la app. Desde F12.5 el onboarding además captura evidencia
(sus publicaciones) y termina con un post en su voz: ver sección 13.

Configuración > Voz de marca es el **mismo objeto**, con las
propiedades opcionales expuestas y editables. No son dos sistemas que
conviven — sería el mismo error que el producto evita religiosamente
en Chat/Calendario/Ritmo (dos motores sincronizados a la fuerza, el
monolito moderno con doble implementación). El onboarding escribe
directo a los campos de Voz de marca; Configuración es donde se
refina después. Un solo estado, una sola fuente de verdad.

### Su relación con "Estilo de respuesta" (Chat)

Ya está resuelto conceptualmente en el overview: un solo lugar
canónico para el tono (acá), y el selector ad-hoc de Chat
(Conciso/Explicativo/Creativo) es una capa distinta y complementaria
—ajuste puntual de una respuesta, no del registro de marca—. Lo que
faltaba resolver era cómo la pantalla lo comunica sin ambigüedad:

**Decisión:** nota fija arriba de Voz de marca, siempre visible (no
un tooltip escondido):

> _"Esta es tu voz base y persistente — define cómo suena TODO tu
> contenido. Para ajustar el tono de un mensaje puntual, usa 'Estilo
> de respuesta' dentro del Chat."_

Con link inverso desde el selector de Chat: _"Ver mi Voz de marca →"_.

_F12.5 ("Voz de marca v3"): la nota se volvió la bajada del título —
"Así suena todo lo que escribimos por ti. Para ajustar un solo mensaje,
usa «Estilo de respuesta» en el Chat."—, siempre visible, sin caja
aparte que compita con «Así escribes»._
Barato de implementar, mata la confusión de raíz sin necesitar
explicación cada vez.

---

## 2. Los campos, definitivos

Organizados en 4 bloques. El orden importa: de lo más heredado del
onboarding a lo más nuevo/opcional.

### Bloque A — Identidad y audiencia (extiende onboarding)

- **Mercado** (país + región): heredado, editable.
- **Nicho/audiencia**: heredado (chips + texto libre), con espacio
  para profundizar (edad, intereses, pain points) que el onboarding
  no pedía por tiempo.
- **Categoría** (vertical): la del catálogo cerrado, con opción de
  "detectar por mi nicho". De ahí cuelgan las tendencias.
- **Objetivo (Modo)**: `Crecer`, `Mantener` o `Lanzar algo`, con
  opción de "deducirlo de mis metas" — que es el default y sale de
  lo que contestó en el onboarding. No es un campo de voz: es de
  estrategia, y vive acá porque es donde el chip de Ritmo promete
  que se cambia. Mueve la meta semanal que Ritmo propone, así que
  la pantalla dice qué implica en vez de guardarlo en silencio.

### Bloque B — Registro y tono (el corazón cultural)

- **Slider de formalidad** (ver sección 4 — reemplaza/extiende el
  single-select del onboarding).
- **Modismos permitidos / prohibidos**: dos listas de tag input libre
  (no chips preseteados — ver sección 3).
- **Anglicismos**: toggle sí/no.

### Bloque C — Contenido

- **Temas clave / pilares de contenido**: chips + texto libre.
- **CTAs preferidos**: chips + texto libre (ej. "Sígueme para más
  tips", "Escríbeme por DM", "Link en bio").

### Bloque D — Ejemplos de referencia (few-shot simple — V1 confirmado)

- **1-2 posts propios** como ejemplo de referencia para la IA.
- **Sin gestión avanzada**: no hay reordenar, no hay editar metadata,
  no hay versionado. Es literalmente "acá van hasta 2 ejemplos, subilos
  o reemplazalos".
- **Origen del contenido**: en vez de pedirle al usuario que
  re-tipee o pegue texto desde cero, dejalo **elegir de su
  Biblioteca** (posts ya creados y guardados automáticamente — ver
  `presencia-chat.md` sección 5, "Por qué guardar en biblioteca es
  automático"). Ya vive ahí; reusarlo es gratis en fricción. Pegar
  texto manual queda como alternativa para quien no tiene nada
  todavía. _(Esto es una recomendación mía, no una pregunta abierta —
  avisame si preferís que sea solo texto pegado.)_
  **Por qué solo 1-2 y no una biblioteca completa de ejemplos:** cada
  ejemplo que se manda como few-shot es contexto real que viaja en cada
  generación — más ejemplos = más tokens = más costo real por
  generación, no solo complejidad de UI. Con 1-2 alcanza para anclar el
  "cómo suena" sin que la Voz de marca se vuelva una feature de gestión
  de biblioteca paralela.

  _Decisión de F12 (2026-11-13):_ Biblioteca quedó como repositorio de
  **imágenes**, no de posts, así que "Elegir de Biblioteca" ya no tiene
  destino. La intención se conserva con otro nombre: **"Elegir de tus
  publicadas"**, un selector de publicaciones ya publicadas. Hasta que
  se construya (en F12), el botón sigue apagado.

---

## 3. Tipo de input por campo

| Campo                                       | Tipo de input                        | Por qué                                                                                                                                            |
| ------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mercado, nicho/audiencia, temas clave, CTAs | Chips + texto libre                  | Mismo patrón que el onboarding: listas abiertas con sugerencias, el usuario reconoce el patrón porque ya lo vio en paso 2 de 5.                    |
| Modismos permitidos/prohibidos              | Tag input libre (sin presets)        | Nadie va a adivinar qué modismo específico quieres prohibir — es vocabulario abierto y personal, no una lista de opciones que se puedan pre-armar. |
| Anglicismos                                 | Toggle sí/no                         | Es binario de verdad, no necesita más granularidad.                                                                                                |
| Formalidad                                  | Slider continuo                      | Ver sección 4.                                                                                                                                     |
| Ejemplos de referencia                      | Selector de publicadas + pegar texto | Ver Bloque D. El diseño decía "Selector de Biblioteca"; desde F12 es "Elegir de tus publicadas".                                                   |

---

## 4. El slider de formalidad y su fricción con el onboarding

Elegiste slider continuo en vez de preset fijo. Es la decisión
correcta para esta pantalla — pero genera una reconciliación que hay
que resolver explícitamente, porque el onboarding usa un
**single-select categórico** ("registro/tono", default
neutro-profesional).

**La reconciliación:** el single-select del onboarding no desaparece
ni se vuelve dos sistemas paralelos — se convierte en **anclas sobre
el mismo slider**. Cada opción categórica del onboarding (Informal,
Neutro-profesional, Técnico, De barrio) mapea a una posición fija en
el spectrum 0-100. Elegir "Neutro-profesional" en el onboarding no es
más que soltar el pin del slider en, por ejemplo, la posición 50. En
Configuración, el usuario ve el mismo slider pero puede moverlo a
cualquier punto intermedio (ej. 62, "un poco más formal que neutro
pero no tan técnico").

**Por qué esto es correcto y no una inconsistencia:** el onboarding
necesita ser rápido (un click por registro, con una frase de ejemplo
de cada uno) — una
categoría de un click es más rápido que arrastrar un slider a ciegas
sin saber qué extremos representa. Configuración es _set-and-forget_
(la tocás una vez, ajustás de vez en cuando — mismo patrón que la
cadencia objetivo de Ritmo), así que ahí sí vale la pena el control
fino.

**Por qué NO seguimos el patrón de dots/dots-percentage de Calendario
y Ritmo acá:** en esos módulos, la razón para usar dots en vez de
porcentaje es que son **información ambiental de un vistazo**
("¿voy a tiempo con mi cadencia?" en medio segundo). Formalidad no es
información ambiental que mirás de reojo — es una configuración que
ajustás deliberadamente una vez y te queda. Ahí el slider gana porque
el usuario SÍ quiere el control granular, no una lectura instantánea.

**Las etiquetas visuales del slider** (para que no sea un número
pelado sin sentido): mostrar 3-4 zonas etiquetadas a lo largo del
track (De barrio · Casual · Neutro-profesional · Técnico/formal), con
el pin mostrando su posición exacta pero el usuario razonando en
zonas, no en números — mismo principio de "objetos contables" que el
resto del producto aplica, adaptado a un slider.

**Qué le llega al modelo (F12.5).** Hasta F12 le llegaba solo la etiqueta
("Registro: casual.") y cada modelo la entendía a su modo. Ahora cada zona
trae una guía de qué significa (largo de frase, cercanía, coloquialismos,
tecnicismos), la misma tabla que pinta el slider, así que la zona que ve el
usuario y la que recibe el modelo no pueden discrepar. La región funciona
igual: el modelo sabe en qué parte de México está su público y usa
referencias locales cuando aportan, pero los regionalismos salen solo de los
ejemplos del creator o de sus modismos permitidos. Un yucateco que no escribe
"uay" no debe recibir posts con "uay": eso es caricatura, no voz. Al creator
el chat le habla siempre neutro-profesional; el registro es para lo que
escribe por él. El detalle técnico vive en el addendum F12.5 de ADR-006.

---

## 5. El preview: botón manual, no automático

Confirmado: **botón "Ver ejemplo"**, generación bajo demanda, consume
cuota.

**Por qué esto era la decisión correcta:** un preview que regenera en
cada tecla estaría quemando cuota por _configurar_, no por _crear_ —
rompe la disciplina de consumo intencional que el resto del producto
cuida con obsesión. Sería el equivalente a que una herramienta te
cobre por cada intento de `git status`.

**Actualizado 2026-08-09 (F5, addendum ADR-012):** el indicador
"≈2 créditos" de Chat se descartó — nunca se muestra un número
crudo de créditos. El botón de este preview no debe mostrar uno
tampoco; el costo intencional del botón manual (vs. automático) es
la decisión de diseño que sigue vigente, no el número.

**Implicaciones de diseño:**

- El botón dice **"✨ Ver ejemplo"**, sin costo numérico. La
  transparencia de consumo vive en el banner de cuota y en la página
  "Créditos y plan" de Configuración, no por acción individual.
- El ejemplo generado es **efímero**: no se guarda en Biblioteca, no
  aparece como borrador en el panel de Calendario. Es un post
  sintético de demostración, no contenido real del usuario. Esto hay
  que dejarlo explícito en el copy ("Este es solo un ejemplo, no se
  guarda") para que no genere confusión tipo "¿por qué tengo un
  borrador random en mi Calendario?".
- **Qué arquetipo usa el preview:** recomiendo texto-first como
  demo canónica (es el arquetipo más simple de renderizar y el que
  mejor comunica "tono" en una sola lectura — imagen y guion de video
  distraen del objetivo real, que es _leer cómo suena_). _(Asunción
  mía — decime si preferís mostrar los 3 arquetipos o dejarlo para
  cuando armemos el prompt visual.)_

---

### Cómo quedó implementado (F9.7, 2026-09-27)

- **Botón "Ver ejemplo de tu voz"** al pie de la página, sin precio (el
  mock traía "≈2 créditos"; el addendum de ADR-012 lo prohíbe). Abre un
  modal con el post, el aviso "Este es solo un ejemplo, no se guarda",
  "Regenerar" y "Cerrar".
- **Usa la voz GUARDADA.** Antes de pedirlo se manda lo que el
  autoguardado tenga pendiente (sección 11), para que un cambio de hace
  medio segundo no quede fuera.
- **Mismo modelo y mismo system prompt que el chat** (`voice_preview`
  enruta a `AI_MODEL_CHAT`; `buildSystemPrompt`). Un ejemplo escrito con
  un modelo más barato mentiría sobre lo que el chat produce después.
- **Texto-first, Instagram, sobre su primer tema clave** (o su nicho),
  cerrando con uno de sus CTAs si tiene, y sin inventar datos del negocio.
- **Se cobra por tokens, como un turno de chat**, sin deduplicar: es
  efímero y cada click es una llamada real. Con la cuota agotada sale el
  mismo modal de cuota que en el chat y en Ritmo.
- **F12.5: se guarda el último, sin historial** (backlog "Guardar el último
  ejemplo de voz"). Sigue sin ser un borrador ni ir a Biblioteca, pero ya no
  se pierde al cerrar el modal: la pantalla lo muestra al volver. La API lo
  guarda desde F12.5 PR3; la pantalla lo pinta con la Voz de marca
  reorganizada (PR5), que también cambia el aviso "no se guarda".

## 6. Estados especiales

### Voz de marca sin configurar a fondo (solo onboarding)

**El estado:** el usuario completó el onboarding (3 campos) pero nunca
entró a Configuración a profundizar.

**El diseño:** la pantalla no está vacía — muestra los 3 campos del
onboarding ya poblados, y el resto de los campos (modismos, CTAs,
ejemplos) vacíos con copy invitador, NO bloqueante: _"Agrega esto para
que tu contenido suene aún más a ti."_ (tuteo mexicano — regla dura
#1 de AGENTS.md; corregido en F4 PR 4/4, el original tenía voseo). El
Chat sigue funcionando
perfecto solo con los 3 campos base — Voz de marca profunda mejora la
calidad, no es un gate.

### Sin ejemplos de referencia cargados

**El diseño:** los 2 slots del Bloque D se muestran vacíos con CTA
suave: _"Elige un post de tu Biblioteca o pega uno tuyo"_ (tuteo). Sin esto,
la IA sigue generando con las reglas de tono/registro — los ejemplos
son un plus, no un requisito. _(F12: el copy pasa a "Elige una de tus
publicadas o pega una tuya" cuando se construya el selector; ver la
decisión en el Bloque D.)_

### Modismos en conflicto (mismo modismo en permitidos Y prohibidos)

**El diseño:** si el usuario escribe el mismo término en las dos
listas, warning ámbar inline (mismo principio de "información, no
error" que Calendario y Ritmo): _"Este término está en las dos
listas — lo vamos a tratar como prohibido por seguridad."_ Prohibido
gana por default (menos riesgoso que arriesgar un modismo no deseado
en contenido público).

---

## 7. Decisiones de producto — recapitulación razonada

### Por qué supraconjunto editable y no dos sistemas separados

Mismo principio que rige Chat/Calendario/Ritmo: una sola fuente de
verdad por concepto. Onboarding y Configuración comparten el mismo
objeto de datos; el onboarding es solo la puerta de entrada rápida.

### Por qué slider acá pero dots/chips en el resto del producto

Depende de la intención de lectura: información ambiental de un
vistazo (Calendario, Ritmo) pide dots; configuración deliberada de
set-and-forget con necesidad de matiz (formalidad) pide slider.

### Por qué el preview es manual, no automático

Consumo intencional es un principio no negociable del producto (ver
overview sección 6). Un preview "gratis y automático" en apariencia
estaría escondiendo consumo real, o forzaría subsidiar esa pantalla
de forma no transparente — aunque, desde el addendum de ADR-012
(2026-08-09), esa transparencia se expresa en cuota/publicaciones,
nunca en un número crudo por botón.

### Por qué pocos ejemplos de referencia (1-2) y sin gestión avanzada

Dos razones combinadas: costo real de contexto por generación (más
ejemplos = más tokens en cada llamada), y disciplina de scope — este
producto documenta explícitamente qué NO hace en cada módulo
precisamente para no caer en feature creep. Una "biblioteca de
ejemplos" con reordenar/versionar sería una mini-feature con vida
propia que no pedimos resolver ahora.

### Por qué modismos son tag input libre y no chips preseteados

Vocabulario regional específico del usuario, no una taxonomía que se
pueda anticipar con opciones fijas.

---

## 8. Lo que conscientemente NO incluye esta sesión (V1)

- **Gestión avanzada de ejemplos de referencia** (reordenar, editar
  metadata, versionado, más de 2 slots). V2.
- **Auto-detección de tono desde el historial de posts** (que la IA
  infiera la voz automáticamente en vez de que el usuario la
  configure a mano). Interesante pero es una apuesta de producto
  distinta y arriesgada (¿y si infiere mal?); no en esta sesión.
  _F12.5 lo reconcilia sin contradecirlo:_ destilar la voz parte de
  publicaciones que el **creator pega a propósito** (onboarding) y
  devuelve una **propuesta** que él ve, corrige y confirma antes de que se
  guarde nada. "¿Y si infiere mal?" se responde con "él lo ve y lo
  arregla". Lo que sigue fuera es lo automático y silencioso: leer su
  historial y cambiar la voz sin preguntar. La voz viva (aprender de sus
  ediciones) sigue la misma regla: propone, nunca cambia sola.
- **Slider de formalidad distinto por red social** (ej. más formal en
  LinkedIn, más relajado en TikTok). Complejidad real, V2.
- **Preview de los 3 arquetipos simultáneos.** V1 muestra uno
  (texto-first) como demo canónica — ver sección 5.

### Aclaración de un solapamiento existente (no nuevo, pero vale documentarlo)

`presencia-chat.md` ya establece que las carpetas tipo Projects
pueden tener **instrucciones personalizadas (system prompt específico
por carpeta)** — esto es cómo un CM freelance maneja voces distintas
por cliente. Voz de marca en Configuración es la **voz default/
personal** del usuario; las instrucciones de carpeta son un **override
parcial** para ese contexto específico. No son el mismo sistema, y no
hace falta que lo sean — pero vale la pena que el prompt de diseño
para Claude Design deje una nota de que Voz de marca es "tu voz
cuando no estás en una carpeta con contexto propio", para que no
parezca que compiten.

---

## 9. Integración con el resto del producto

**Con Chat:** integración total y directa. Cada campo de Voz de marca
alimenta el output de la IA en los 3 arquetipos de card. El chip de
contexto "🧠 Recordando tu voz de marca..." linkea directo acá.

**Con Ritmo:** por las tendencias, no por el tono. La búsqueda de
tendencias usa el nicho, la región, la audiencia y el objetivo de este
Bloque A como base de su prompt (ADR-024), pero no consume
tono/registro: las tendencias son sobre _qué está pegando_, no sobre
_cómo suenas tú_. Lo que afina esa búsqueda vive en su propia
sub-página, Configuración › Tendencias (sección 10).

**Con Calendario:** ninguna, explícitamente documentado en
`presencia-calendario.md` sección 8 ("La voz de marca configurada NO
afecta directamente al Calendario... pero sí afecta a Chat
indirectamente").

**Con Biblioteca:** ninguna para los ejemplos de referencia. El diseño
los elegía desde ahí, pero Biblioteca quedó como repositorio de imágenes
(F12): los ejemplos se eligen de las publicaciones publicadas (Bloque D).
Lo que sí comparten es el estilo de imagen de la voz, que se aplica a las
imágenes sueltas (`presencia-biblioteca.md`, sección 4).

---

## 10. La sub-página hermana: Tendencias (F9.6)

Configuración › Tendencias, en el grupo CONTENIDO junto a Voz de marca,
personaliza **qué** busca Ritmo cuando sale a buscar tendencias. No es
parte de la voz porque no cambia cómo suena nada: cambia de dónde vienen
los temas.

### Lo que se ve primero: el default

Arriba, antes de cualquier campo, la página dice qué se busca **si no se
toca nada**: el nicho, la región y el objetivo, en las mismas palabras
que llegan al prompt, en español. Ese texto lo arma la API con la misma
función que escribe el prompt (`baseDeBusqueda`), así que no puede
prometer un nicho y buscar en otro. Debajo, una línea que manda a Voz de
marca a cambiarlos: ahí viven, y duplicarlos acá serían dos fuentes de
verdad.

### Los cuatro campos, todos opcionales

| Campo                         | Input                    | Qué hace                                                                                                                                                                                                                                                                                                                     |
| ----------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tus fuentes**               | tag input, máx. 10       | Medios o sitios que la persona sigue. Se guarda el **dominio**: pegar `https://www.canal10.tv/nota/123` deja `canal10.tv`. Van al prompt como `site:` y la búsqueda los prioriza, pero completa con otras fuentes si no alcanzan. Lo que no es un dominio se rechaza al escribirlo, con el texto a la vista para corregirlo. |
| **Qué quieres que busquemos** | textarea, 500 caracteres | Temas, enfoques o formatos, en sus palabras. Manda sobre el enfoque por defecto.                                                                                                                                                                                                                                             |
| **Qué no quieres ver**        | textarea, 500 caracteres | Lo que prefiere dejar fuera aunque se esté moviendo.                                                                                                                                                                                                                                                                         |
| **Idiomas**                   | un switch por idioma     | Español (default) y/o inglés. El último encendido no se puede apagar. Aunque la fuente esté en inglés, lo que llega va escrito en español.                                                                                                                                                                                   |

Los dos textos entran al prompt **como dato, no como instrucción**:
delimitados, y con los guardrails del sistema después, diciendo que nada
de ese bloque los anula (ADR-024, "El prompt va en capas"). Por eso un
texto raro solo puede cambiar _qué_ se busca, nunca las reglas.

### Cuándo aplica

Guardar no dispara una búsqueda ni cobra nada: los cambios se aplican
en el siguiente refresco, sea el semanal o uno adelantado desde Ritmo
("Actualizar ahora", `presencia-ritmo.md`). La página lo dice al pie.
Como el resto de Configuración, se guarda sola (sección 11); acá cada
cambio manda la configuración entera, porque el endpoint la reemplaza.

### Lo que NO está (V1)

- **El tono y el formato de las tarjetas de tendencia.** Se consideró y
  quedó fuera de F9.6: la tarjeta es de Ritmo y se ve igual para todos.
- **Cuentas o hashtags de una red.** Una fuente es un sitio que la
  búsqueda web puede acotar; seguir cuentas exigiría la API de cada red.

---

## Próximo paso

Con esto ya tengo base sólida para armar el prompt real hacia Claude
Design. ¿Seguimos directo a construirlo, o quieres ajustar algo de este
documento primero?

---

## 11. Se guarda sola (F9.7)

Configuración no tiene botón "Guardar": cada campo se guarda solo y dice
que lo hizo con una marca verde "✓ Guardado" junto a su label, que se
apaga a los dos segundos. Decidido con Jose el 2026-09-27, siguiendo el
mock de Claude Design. El motivo es quitar el "se me olvidó guardar": en
una página larga, el botón quedaba abajo de todo.

Cómo se comporta, y por qué:

- **Los textos esperan a que dejes de escribir** (~0.8 s); los chips, los
  switches y los selects se guardan al momento. Salir de la página manda
  lo que falte.
- **Nunca viajan dos guardados a la vez.** Lo que se cambia mientras uno
  viaja sale después, junto. Así una respuesta vieja no pisa un cambio
  nuevo en el servidor.
- **Un error se dice debajo del campo**, y se queda hasta que el campo
  vuelve a cambiar, que es también la forma de reintentar. Lo que la
  pantalla ya sabe que el servidor rechazaría (un país de una letra, el
  nicho vacío) no se manda: se avisa ahí mismo.
- **"Prohibido gana" sigue valiendo** (sección 6), pero ahora el servidor
  lo aplica en un segundo y el chip desaparece de permitidos. Por eso,
  además del aviso de conflicto mientras escribes, queda un aviso de lo
  que se movió: _"«neta» estaba en las dos listas — lo dejamos solo en
  prohibidos, por seguridad."_
- **Los ejemplos de referencia son la excepción**: pegar tiene su propio
  "Guardar" en la ranura. Un post pegado a medias no es un ejemplo, y
  guardarlo mientras se pega alimentaría cada generación con basura.
- **"Elegir de Biblioteca"** se ve deshabilitado, con un tooltip de
  "Próximamente". No se prende cuando llegue el módulo Biblioteca, que es
  de imágenes: se reemplaza por "Elegir de tus publicadas" (decisión de
  F12 en el Bloque D).

Lo que técnicamente lo sostiene: `apps/web/src/lib/autoguardado.ts`
(probado con timers falsos) y el hook `use-autoguardado.ts`.

---

## 12. La sub-página hermana: Estilo visual (F10.6)

Con qué estilo se generan las imágenes cuando el creator no pide otro.
Vive bajo CONTENIDO, después de Tendencias, y se guarda en la misma Voz de
marca (`image_style`). Diseño: "Configuracion v2" en Claude Design.

- **Galería de 7 estilos**, cada uno con la misma escena de ejemplo para
  que se comparen estilos y no escenas. Cuatro columnas en escritorio, dos
  en tablet y en móvil. Tocar el círculo lo elige; el resto de la tarjeta
  abre el detalle.
- **Se guarda al elegir**, sin botón, con un toast que dice en qué se van
  a generar las imágenes. Es un solo valor: no hace falta la marca
  "✓ Guardado" por campo de la sección 11.
- **Primer uso:** si nunca eligió (NULL), un aviso dice que empezamos con
  Fotográfico natural. Se va en cuanto elige cualquiera, incluso el mismo.
- **Detalle:** tres ejemplos más (comida, persona, producto), en modal en
  escritorio y en hoja inferior en móvil, con "Usar este estilo".
- **El estilo es el default, no una jaula:** en cada imagen, el chip
  "Estilo: X" del panel elige otro (arranca en el de la última imagen de
  esa card, o en este si no hay), y si la descripción pide un estilo, manda
  ella. Cambiar el chip no genera nada ni toca el default; el link "Cambiar
  tu estilo por defecto" del chip trae a esta página.
- **Identidad visual · Próximamente:** logo, colores de marca y plantillas.
  Se anuncia para que se entienda que el estilo no es lo mismo que la
  marca visual, pero nada de eso es V1.

Lo que NO está (V1): estilos propios o subir una referencia, mezclar dos
estilos, un estilo por carpeta o por red, y **3D**: venía en el diseño, pero
el generador no lo entrega con comida ni con lugares (ADR-025).

---

## 13. El onboarding como captura de voz (F12.5)

Diseño: "Onboarding v2" en Claude Design (proyecto "Presencia - Onboarding").
Antes el onboarding recogía **declaraciones** ("mi tono es cercano"); ahora
recoge **evidencia** y termina entregando algo, no un "listo". Cinco pasos:

1. **¿Cómo hablas?** País, zona (chips: Norte, Bajío, Occidente, Centro,
   Sureste, Toda la república) y estado o ciudad; nicho; registro, con una
   frase de ejemplo por registro. La región se guarda como "ciudad, zona"
   ("Tekax, Sureste") para que la macro-región salga aunque el pueblo no esté
   en el catálogo. Si la ciudad sí está, ella decide y la zona no la pisa:
   `resolveMacroRegion` da prioridad a un estado o ciudad sobre un nombre de
   zona ("CDMX, Centro" es CDMX y "León, Centro" es el Bajío). Es el único
   paso obligatorio.
2. **¿Cómo escribes?** De 1 a 3 publicaciones suyas, pegadas tal cual, y
   "¿Algo que nunca dirías?" (opcional). "Aún no publico" lo salta. Al
   seguir, la destilación arranca en segundo plano: mientras conecta su red,
   el modelo ya está leyendo.
3. **¿Dónde publicas?** Conectar una red con el mismo flujo de Canales
   (`use-conectar-red.ts`). Se puede omitir. Antes decía "Muy pronto": la
   publicación existe desde F6/F7.5 y nadie había vuelto a este paso.
4. **¿Qué buscas?** Metas (Crecer audiencia, Monetizar, Mantener
   consistencia, Ahorrar tiempo). De ahí se deriva el Modo de Ritmo, así que
   el texto dice eso y no "el primero marca el ritmo", que traía el mock y no
   es lo que pasa.
5. **Así suenas.** Lo que notamos en sus publicaciones («Así escribes»,
   rasgos editables) y un post en su voz. "Ajustar" reescribe el post con los
   rasgos editados; "Se oye como yo → Crear mi primer post" lo lleva al chat
   con ese borrador escrito en la caja, sin mandarlo.

**La voz es del creator, también aquí.** Destilar devuelve una propuesta; lo
que se guarda es lo que él ve en pantalla, y lo puede corregir ahí mismo. El
registro que eligió en el paso 1 no lo pisa la destilación: de la evidencia
salen los rasgos, los modismos, los CTAs reutilizables y sus dos primeras
publicaciones como ejemplos de referencia. Sin publicaciones, lo que dijo
que nunca diría entra como rasgo «Nunca: …».

**Cuesta lo de dos acciones suyas:** destilar (`voice_distill`) y el post
(`voice_preview`), cobrados como cualquier otra generación. Volver al paso 5
sin cambiar nada no vuelve a pedir ni a cobrar nada. Con la cuota agotada,
el modal de siempre, y se puede entrar sin borrador.

---

## 14. La página reorganizada (F12.5, "Voz de marca v3")

Diseño: "Voz de marca v3" en Claude Design. Mismos campos de siempre, en un
orden que va de lo que el creator entiende de un vistazo a lo técnico. Es la
misma idea que el resumen de memoria de ChatGPT: lo primero que ve es qué
sabe Presencia de cómo escribe, no un formulario.

1. **Así escribes.** La tarjeta protagonista: de 0 a 8 rasgos legibles
   ("Frases cortas", "Nunca: «¡Hola, familia!»"), cada uno editable en su
   lugar, con "Agregar rasgo". Los escriben el onboarding (destilados de sus
   publicaciones y confirmados por él), él a mano, o una propuesta de
   "Aprender de mis ediciones" que aceptó (F12.5 PR6). Sin rasgos, invita a
   escribir uno o a pegar una publicación en «Tus ejemplos».
2. **Tus ejemplos.** Las dos ranuras de siempre y, debajo, **el último
   ejemplo generado** en línea, ya no en un modal que se perdía al cerrarlo.
   Si la voz cambió después de escribirlo, lo dice ("Tu voz cambió desde este
   ejemplo"): el servidor guarda el ejemplo sin mover `updated_at`, que solo
   se mueve cuando cambia algo que suena (no con Tendencias ni el estilo de
   imagen), y lo fecha con el mismo reloj, así que la comparación es honesta. Regenerar sigue siendo manual y sin precio en
   el botón; el diseño traía "≈2 créditos" y no va (addendum ADR-012).
3. **Identidad y audiencia**, más **Datos fijos de tu marca**: horario,
   dirección, WhatsApp, link de reservas, precios base, hasta 1000
   caracteres. Llegan al chat en su propio bloque, como dato, con la regla de
   usarlos tal cual y preguntar lo que falte. La nota "En una carpeta, sus
   instrucciones mandan sobre esto" anticipa las carpetas con contexto.
4. **Memoria.** "Recordar entre chats" (on/off) y "Borrar todo lo que
   recuerdo" con confirmación. Ver `presencia-chat.md`, "La memoria entre
   chats". Apagada, la pantalla lo dice: no busca en sus chats anteriores y
   no guarda nada nuevo para recordar.
5. **Ajustes finos**, plegado, con su resumen en una línea ("Casual · 3
   modismos permitidos · Anglicismos: sí · 2 temas"): formalidad, modismos,
   anglicismos, temas y CTAs, igual que antes. Siguen ahí para quien los
   quiera; solo dejaron de competir con lo que más pesa.

**Aprender de mis ediciones** (F12.5 PR6) va entre «Así escribes» y «Tus
ejemplos». Es la voz viva: cuando el creator edita un borrador antes de
programarlo, la diferencia entre lo que escribió la IA y lo que salió dice
algo de su voz. Nada cambia sin que diga que sí.

- **Reglas, gratis y al vuelo.** Cuatro reglas deterministas
  (`packages/shared/src/voz-viva.ts`): quitó emojis, quitó hashtags, recortó
  el texto a 70% o menos, quitó signos de exclamación. Una regla propone
  cuando, de las últimas 6 publicaciones donde aplica (el borrador tenía de qué
  quitar), en al menos 4 se ve el cambio. Las programadas sin tocar también
  cuentan, en contra: dejar los emojis es decir que estaban bien. Se miran las
  programadas, publicadas y fallidas (no borradores ni canceladas), una por
  grupo multi-red, y solo de chats que escriben con esta voz (las de un chat
  ya borrado cuentan como de la voz default: en V1 ninguna carpeta tiene voz
  propia). "Lo que escribió la IA" es su última versión escrita por la IA: si
  el creator le pidió "Más corto", lo que recortó la IA no cuenta como recorte
  suyo, y restaurar su propia edición no la vuelve texto de la IA. Quitar ™ o
  © de una marca no cuenta como quitar emojis.
- **Cada propuesta dice qué notó y qué se suma** ("Quitaste emojis en 4 de tus
  últimas 5 publicaciones. Se suma a «Así escribes»: Casi sin emojis"), con
  "Ver evidencia": la línea del borrador tachada y la de su edición.
- **"Agregar"** suma el rasgo por el mismo autoguardado que editar «Así
  escribes» a mano (un solo escritor de `style_notes`). **"No"** se anota: la
  regla no vuelve a preguntar con la misma evidencia, solo con publicaciones
  posteriores. Si ya tiene un rasgo que lo dice ("Sin emojis"), no se propone; uno que
  dice lo contrario ("Usa muchos emojis") o solo comparte la palabra ("Abre con
  una pregunta corta") no la calla.
- **«Revisar mis ediciones»** busca con IA lo que las reglas no ven ("cambiaste
  «chido» por «padre»"). A pedido y cobrado (`voice_distill`), sin precio en
  el botón; necesita al menos 2 publicaciones editadas. Sus propuestas son
  efímeras: viven en la pantalla hasta que dice "Agregar" o "No".
- **Un punto en «Voz de marca»** del sub-nav de Configuración cuando hay
  propuestas. Es el único aviso: no hay notificaciones en la app (overview §8).
- **Interruptor** en la tarjeta. Apagado, no hay propuestas ni revisión (la
  API también se niega a revisar: no manda las ediciones al modelo ni cobra).

**Más compacta (F12.5, a pedido de Jose).** Configuración se sentía "muy
grande y separada". Inputs y selects bajaron de ~42 a ~36 px (texto de 14 a
13 px), los chips de ~46 a ~38 px, las secciones tienen menos padding y huecos
de 16 px en vez de 20, y las ayudas y errores quedaron en 11.5 px pegados a su
campo. Vive en las piezas compartidas (`primitivas.tsx`, `campo-estilo.ts`,
`TagInput`), así que todas las páginas de Configuración cambian igual. El
editor del panel de publicación comparte `Textarea` y `TagInput` y quedó
consistente.

El onboarding tiene sus piezas propias (`components/onboarding/Piezas.tsx`:
título, etiquetas, chips, campos y botones) y recibió la misma escala en un
PR aparte. Medido en el navegador (Chromium, protocolo de DevTools), no
calculado: campos y botones de 36.6 px con `text-sm` (13 px), igual que un
campo de Configuración; chips de 30.8; título de 22 px; ayudas de 11.5 y
errores de 12. En "Así suenas" el botón de cierre va en su propio renglón,
porque junto a ← y "Ajustar" se partía en dos y estiraba los tres a ~55 px.
