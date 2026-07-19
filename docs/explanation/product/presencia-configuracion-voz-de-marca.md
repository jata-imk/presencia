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

El paso "Voz" del onboarding (paso 2 de 5, no-skippable) ya captura una
versión mínima: mercado, nicho/audiencia, registro/tono. Es, en
términos de código, el **constructor con los parámetros obligatorios**
— lo mínimo para que el objeto `VozDeMarca` exista y no truene el
resto de la app.

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

---

## 3. Tipo de input por campo

| Campo                                       | Tipo de input                               | Por qué                                                                                                                                           |
| ------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mercado, nicho/audiencia, temas clave, CTAs | Chips + texto libre                         | Mismo patrón que el onboarding: listas abiertas con sugerencias, el usuario reconoce el patrón porque ya lo vio en paso 2 de 5.                   |
| Modismos permitidos/prohibidos              | Tag input libre (sin presets)               | Nadie va a adivinar qué modismo específico querés prohibir — es vocabulario abierto y personal, no una lista de opciones que se puedan pre-armar. |
| Anglicismos                                 | Toggle sí/no                                | Es binario de verdad, no necesita más granularidad.                                                                                               |
| Formalidad                                  | Slider continuo                             | Ver sección 4.                                                                                                                                    |
| Ejemplos de referencia                      | Selector de Biblioteca + upload/pegar texto | Ver Bloque D.                                                                                                                                     |

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
necesita ser rápido (3 campos, ~20 segundos, ver overview) — una
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

---

## 5. El preview: botón manual, no automático

Confirmado: **botón "Ver ejemplo"**, generación bajo demanda, consume
créditos.

**Por qué esto era la decisión correcta:** un preview que regenera en
cada tecla estaría quemando créditos por _configurar_, no por
_crear_ — rompe la transparencia de costos que el resto del producto
cuida con obsesión (el indicador "≈2 créditos" de Chat, siempre
visible ANTES de gastar, según overview sección 6). Sería el
equivalente a que una herramienta te cobre por cada intento de
`git status`.

**Implicaciones de diseño:**

- El botón muestra el costo antes de generar: **"✨ Ver ejemplo (≈2
  créditos)"** — mismo patrón visual que el indicador de costo del
  input de Chat.
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

## 6. Estados especiales

### Voz de marca sin configurar a fondo (solo onboarding)

**El estado:** el usuario completó el onboarding (3 campos) pero nunca
entró a Configuración a profundizar.

**El diseño:** la pantalla no está vacía — muestra los 3 campos del
onboarding ya poblados, y el resto de los campos (modismos, CTAs,
ejemplos) vacíos con copy invitador, NO bloqueante: _"Agrega esto para
que tu contenido suene aún más a vos."_ El Chat sigue funcionando
perfecto solo con los 3 campos base — Voz de marca profunda mejora la
calidad, no es un gate.

### Sin ejemplos de referencia cargados

**El diseño:** los 2 slots del Bloque D se muestran vacíos con CTA
suave: _"Elegí un post de tu Biblioteca o pegá uno tuyo"_. Sin esto,
la IA sigue generando con las reglas de tono/registro — los ejemplos
son un plus, no un requisito.

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

### Por qué el preview es manual y con costo visible

Transparencia de créditos es un principio no negociable del producto
(ver overview sección 6). Un preview "gratis y automático" en
apariencia estaría escondiendo consumo real, o forzaría subsidiar esa
pantalla de forma no transparente.

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

**Con Ritmo:** ninguna directa. Ritmo usa vertical/región del
onboarding para el _grounding_ de tendencias (`presencia-ritmo.md`
sección 9), pero no consume tono/registro — las tendencias son sobre
_qué está pegando_, no sobre _cómo sonás vos_.

**Con Calendario:** ninguna, explícitamente documentado en
`presencia-calendario.md` sección 8 ("La voz de marca configurada NO
afecta directamente al Calendario... pero sí afecta a Chat
indirectamente").

**Con Biblioteca:** los ejemplos de referencia del Bloque D se
eligen desde ahí (ver sección 2). Es la única integración bidireccional
de esta pantalla.

---

## Próximo paso

Con esto ya tengo base sólida para armar el prompt real hacia Claude
Design. ¿Seguimos directo a construirlo, o querés ajustar algo de este
documento primero?
