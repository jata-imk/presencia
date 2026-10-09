# ADR-015 · Menús, popovers y modales: `@floating-ui/react`

**Decisión:** `@floating-ui/react` (headless, sin componentes visuales propios) como motor de posición/interacción para todo elemento flotante — menús desplegables y diálogos modales. Dos hooks propios encima (`lib/floating/use-menu.ts`, `lib/floating/use-dialog.ts`) que exponen solo lo que cada caso necesita; los componentes visuales (`components/ui/Menu.tsx`, `components/ui/Modal.tsx`) siguen escribiendo su propio markup y clases de Tailwind — no se adopta un kit de componentes completo, solo el motor.

**Razón:** construyendo el menú "···" de un chat (F6 PR8 follow-up) apareció un bug real probando en el navegador — un menú cerca del borde inferior del sidebar se abría cortado, y por separado el click en el trigger a veces no abría nada. Revisando el resto del código, ese no era un caso aislado: el mismo patrón (`useState` + `onBlurCapture` + `absolute top-full`, sin portal, sin manejo de colisión con el viewport) estaba copiado a mano en 3-4 lugares (`ChatOptionsMenu`, `Topbar`, y una trampa de foco de ~25 líneas duplicada entre `Modal.tsx` y `QuotaExhaustedModal.tsx`). Mismo criterio que ADR-014 con `motion`: no seguir reinventando infraestructura de UI que una librería enfocada ya resuelve correctamente.

## Qué resuelve

- **Corte contra el viewport** — middleware `flip()`/`shift()` en vez de medir `getBoundingClientRect()` a mano.
- **Corte contra un ancestro con `overflow`** (la causa real del bug, no solo cosmética) — `FloatingPortal` monta en `document.body`.
- **Click intermitente** — `useClick`/`useDismiss` reemplazan el `onClick` + `onBlurCapture` a mano; desapareció al migrar (nunca se aisló la causa exacta del original, y no hizo falta: la clase de bug es justo la que esos hooks existen para evitar).
- **Trampa de foco duplicada** — `FloatingFocusManager` reemplaza los dos focus-traps escritos a mano.

## Dos primitivas — la distinción es interacción de fondo

`Menu` (no-modal, fondo interactivo: `ChatOptionsMenu`, el menú de `Topbar`) vs `Dialog`/`Modal` (modal, fondo bloqueado con overlay: los tres `Modal*.tsx` de F6 PR8, `QuotaExhaustedModal`, y el bottom-sheet mobile del `ScheduleDrawer`). El panel de escritorio del `ScheduleDrawer` no es ninguno de los dos — sigue siendo layout in-flow que empuja (ADR-014), no un elemento flotante.

## API de `Menu` — compuesta, no un array de `items`

`<Menu><Menu.Trigger/><Menu.Content><Menu.Item/></Menu.Content></Menu>`. Se descartó un array declarativo de `items` porque los menús reales de la app ya mezclan contenido condicional (el link de Configuración en `Topbar`, el mensaje de error de "Archivar" en `ChatOptionsMenu`) — un array de props no lo expresa limpio sin volverse compuesto por otro lado de todos modos.

## Fuera de alcance

Menús anidados de verdad (submenu de un item) — la arquitectura los soporta nativamente (cada submenú es su propio contexto `useFloating`), no se construye ninguno porque no hay un caso real todavía.

**Ver también:** [ADR-014](./adr-014-estrategia-de-animacion.md) — mismo criterio de "adoptar una librería enfocada en vez de reinventar", aplicado ahí a animación.

## Addendum (2026-08-24, F7 PR2) — un tercer caso: el panel inspector

Las dos primitivas se distinguían por la interacción de fondo: `Menu` no-modal, `Dialog` modal. El panel de detalle del día del Calendario no es ninguno de los dos, y no por un detalle de estilo:

- **No es `Menu`.** No cuelga de un trigger ni se posiciona contra él: ocupa el borde derecho de la región del módulo, siempre en el mismo lugar.
- **No es `Dialog`.** No hay overlay, ni trampa de foco, ni `aria-modal`. La grilla de atrás se sigue leyendo **y se sigue clickeando** — clickear otro día cambia el día del panel.

`lib/floating/use-inspector.ts` es ese tercer motor: `useDismiss` (Escape + click afuera) y nada más. Sin `useRole`, porque `role="dialog"` le anunciaría al lector de pantalla un modal que no lo es; quien lo monta pone su propio rol (`region`) y su etiqueta.

Tiene una excepción que no es cosmética: `outsidePress` ignora los clicks dentro de la grilla. Sin ella el `mousedown` cierra el panel y el `click` siguiente lo reabre para el día nuevo, con las dos animaciones enteras en el medio — un parpadeo en la interacción más común del módulo.

### Por qué no lleva backdrop

El doc de producto pedía uno, pero su propia justificación es _"un panel lateral mantiene la grilla parcialmente visible al fondo"_ — y un backdrop la oscurece, o sea lo contrario de lo que argumenta. La otra alternativa coherente con ADR-014 (empujar in-flow, como el panel de escritorio del `ScheduleDrawer`) reflowearía las siete columnas del mes en cada apertura, encogiendo las celdas justo cuando el usuario quiere compararlas con lo que está leyendo. Overlay sin backdrop conserva las dos cosas: la grilla legible y su tamaño.

El modal "Ver" sí es `Dialog` de verdad, y por la razón opuesta: es un foco temporal sobre un elemento, se abre, se lee y se cierra.

## Addendum (2026-08-26, F7 PR5) — items de casilla

`Menu.Item` acepta `checked`, y con eso se renderiza como `menuitemcheckbox` (con `aria-checked`) y **no cierra el menú** al activarse. `keepOpen` permite lo segundo sin lo primero.

Salió del popover de filtros del Calendario: marcar una red no es "elegir y salir", el menú tiene que seguir abierto para marcar la siguiente y ver la grilla cambiar detrás. La primera versión usaba `<button role="menuitemcheckbox">` sueltos dentro de `Menu.Content` y eso parecía equivalente — no lo era: los items se registran en el `listRef` de `use-menu`, que es de donde `useListNavigation` saca las flechas. Con botones propios el contenedor anunciaba `role="menu"` sobre una lista vacía: ↑/↓ no hacían nada y las opciones solo se alcanzaban con el mouse.

Regla que deja: **todo lo enfocable dentro de `Menu.Content` es `Menu.Item`**. Si necesita otro comportamiento, se le agrega una prop al primitivo; no se escribe un botón al lado.

## Addendum (2026-09-03, F7.1) — la cuarta primitiva: `Tooltip`

`lib/floating/use-tooltip.ts` + `components/ui/Tooltip.tsx`. Se justifica con el mismo criterio que el inspector: no encaja en ninguna de las que hay. No es `Menu` (no se abre con click ni tiene items navegables), no es `Dialog` (no bloquea nada) y no es `Inspector` (no vive abierto ni lo cierra el usuario) — se abre solo al apuntar o al enfocar, y se va igual de solo.

Reemplaza al atributo `title` nativo en 28 sitios. El nativo no se puede estilar, tarda cerca de un segundo, no responde al foco de teclado en varios navegadores y se esconde a los pocos segundos aunque el puntero siga encima.

Tres decisiones que quedan fijas:

- **API de envoltura, no compuesta.** Los 28 casos son "un elemento, un texto", así que `<Tooltip label="…"><button/></Tooltip>` clonando el hijo. `Trigger`/`Content` sería ceremonia sin ganancia; `Menu` es compuesto porque sus menús mezclan botones con contenido condicional, que no es el caso acá.
- **Sin flecha.** No se usa el middleware `arrow` de floating-ui: un globito pegado al elemento ya dice de quién habla, y la flecha obliga a un nodo extra que hay que reposicionar en cada `flip`.
- **Un botón deshabilitado no emite eventos de puntero**, y justo los tooltips que más falta hacen cuelgan de botones apagados ("Próximamente", "Ver en la red"). Cuando el hijo trae `disabled`, el ancla pasa a ser un `<span tabIndex={0}>` que sí los recibe — y de paso el globito también sale con teclado.

**Trampa que costó un PR:** floating-ui posiciona por defecto con `transform: translate(x, y)`, y el globito entra con una animación de motion, que escribe **su propio** `transform` sobre el mismo nodo. El de motion gana y el tooltip aparece pegado en la esquina superior izquierda (0,0). Por eso `use-tooltip` pide `transform: false`, que posiciona con `top`/`left` reales y le deja el `transform` libre a motion. `Menu` no lo necesita porque no anima nada.

Se cuela en silencio: el globito tiene el texto correcto, el tema correcto y el z-index correcto — lo único que está mal es dónde aparece. **Verificar un flotante es medir su caja contra la de su ancla**, no leer su contenido.

Dos límites, a propósito:

- **Un tooltip nunca es la única fuente de una etiqueta.** En táctil no hay hover y el globito no existe: donde el `title` era lo único que nombraba un control (los iconos del sidebar colapsado), el `aria-label` se queda puesto.
- **`Menu.Item` conserva el `title` nativo.** El item ya usa su ref para registrarse en el `listRef` de `use-menu` —de ahí salen las flechas— y envolverlo le robaría ese anclaje. Además un globito dentro de un menú ya abierto y flotando sobre el contenido no aporta nada.
