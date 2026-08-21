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
