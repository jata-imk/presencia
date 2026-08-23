# ADR-014 · Estrategia de animación: motion + CSS, tokens obligatorios

**Decisión:** `motion` (v13, el paquete renombrado de framer-motion — mismo autor, misma API) para todo lo que entra/sale del DOM o cambia de layout. CSS puro (`@keyframes` + `transition`) para loops ambientales infinitos y micro-interacciones de hover/focus. Ninguno de los dos hardcodea su propia duración o easing — ambos leen de los mismos tokens.

**Razón:** hasta F6 PR4 el repo tenía tokens de animación (`--duration-fast/normal/slow`, `--ease-out/--ease-in-out` en `tokens.css`) definidos desde F1 y **sin un solo uso real** — cada componente nuevo decidía animar o no por su cuenta. El síntoma fue concreto: el drawer de programación (F6 PR3/PR4) aparecía sin transición porque nadie había decidido con qué mecanismo debía hacerlo.

## Reparto de responsabilidades

| Motion (JS)                                                                                  | CSS                                                                                   |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Entrada/salida del DOM (`AnimatePresence`): drawer, toasts, modales, cards nuevas en el chat | Loops infinitos: `glow-rotate`, `glow-pulse`, `shimmer`, `dot-pulse`, `stream-cursor` |
| Cambios de layout (ancho del drawer al empujar el chat, reordenamientos)                     | Micro-transiciones de hover/focus (`transition-colors`, `transition-shadow`)          |
| Gestos (drag del bottom-sheet mobile — no implementado aún, la API ya soporta el caso)       | —                                                                                     |

Pasar los loops ambientales a motion sería peor, no mejor: corren en el compositor sin tocar el hilo de JS; motion tiene que reevaluar en cada frame. Y pasar el ciclo de vida del drawer a CSS puro obliga a coordinar `display:none` a mano con `animationend` — exactamente el tipo de estado que `AnimatePresence` resuelve gratis.

## Tokens, no números sueltos

`apps/web/src/lib/motion.ts` espeja `--duration-*`/`--ease-*` de `tokens.css` en `DURATION`/`EASE_OUT`/`EASE_IN_OUT`, más las `variants` compartidas (`fadeUp`, `drawerPush`, `sheetUp`, `toastIn`, `backdropFade`). motion no puede leer `var()` de CSS directamente, así que el espejo es manual — pero es un solo archivo, y ningún componente escribe su propia duración o curva. Misma regla que "tokens, no hex" (AGENTS.md #2), aplicada a movimiento.

## Accesibilidad

`<MotionConfig reducedMotion="user">` envuelve toda la app en `App.tsx` — respeta `prefers-reduced-motion` del SO en cualquier `motion.*` de un solo lugar, sin que cada componente lo chequee. Los `@keyframes` ambientales de CSS se apagan enteros (no solo se acortan) bajo `@media (prefers-reduced-motion: reduce)` en `app.css`: son movimiento decorativo continuo, no comunican estado — no hay razón para dejarlos correr más lento.

## Regla derivada: una sola zona de scroll por pantalla

El bug que expuso la falta de esta decisión no era solo la animación — el drawer de programación vivía como overlay `fixed inset-0`, encimado sobre el chat en vez de empujarlo, lo que producía dos scrolls superpuestos en la misma región visual. La corrección de raíz (F6 PR5, `routes/protected.tsx`) es de layout, no de animación: el App Shell es `h-dvh overflow-hidden` con un único contenedor `overflow-y-auto` para el contenido, y el drawer es un hermano flex (`motion.aside` con `width` animado) en vez de un overlay. El drawer mobile (bottom-sheet con backdrop, `role="dialog"`) sigue siendo modal de verdad — la variante desktop no lo es: no atrapa el foco ni bloquea el chat de al lado.

## Addendum (2026-08-22, F6.5 PR1) — gestos continuos y propiedades con dos escritores

El reparto de arriba manda los "cambios de layout" a motion y los "gestos" también. El sidebar redimensionable de F6.5 cae en ambas casillas y **aun así no usa motion en ninguna de las dos**. La regla que se agrega:

> Una propiedad que puede tener **dos escritores** —un gesto continuo y una animación state-driven— se anima con CSS + variable, nunca con motion.

Los dos motivos, en orden de peso:

1. **El arrastre no puede tener duración ni curva.** Un gesto pointer-driven sigue al dedo: cualquier easing lo deja corriendo atrás. No es una animación, es escritura directa al DOM (`document.documentElement.style.setProperty("--sidebar-width", …)` en cada `pointermove`, sin pasar por React).
2. **`motion.nav animate={{width}}` escribiría `style.width` inline sobre el mismo elemento cuyo ancho controla la variable del arrastre.** Dos escritores sobre una propiedad es una fábrica de bugs intermitentes. El colapso/expansión usa `transition-[width]` en CSS, y se apaga durante el gesto con `body[data-resizing]`.

Corolario de accesibilidad que no es obvio: el bloque `@media (prefers-reduced-motion: reduce)` de `app.css` solo neutraliza `animation-*`, **no `transition-*`**. La transición de ancho del sidebar necesita su propia regla, acotada al `<nav>` — un `transition: none` global mataría también las micro-transiciones de hover, que no son a lo que apunta `prefers-reduced-motion`.

El **drawer mobile del sidebar** (hamburguesa + backdrop) se suma a la lista de modales de verdad de la sección anterior: `role="dialog"`, `FloatingFocusManager`, `variants={sheetLeft}`. Mismo trato que el bottom-sheet del ScheduleDrawer, distinto de la columna in-flow de escritorio.

**Descartado — sin librería, solo transiciones CSS en cada componente:** era la opción más barata en peso de bundle, pero deja la coordinación de entrada/salida del DOM (cuándo desmontar, cómo animar `AnimatePresence`-style sin la librería) reinventada a mano en cada drawer/modal/toast nuevo — el mismo problema que llevó a esta decisión en primer lugar, solo que sin nombre.

**Bundle:** motion agrega peso real al chunk principal (~790KB sin comprimir a la fecha de este ADR, con `motion/react` incluido). Si eso se vuelve un problema, la salida es `LazyMotion` + el componente `m` (import dinámico de las features de animación) — no se aplica ahora porque no hay evidencia de que el peso importe todavía (YAGNI, AGENTS.md #6).

**Ver también:** [`docs/reference/design-tokens.md`](../../reference/design-tokens.md) §Movimiento — los tokens de duración/easing y la regla de una sola zona de scroll, documentados para consulta rápida sin tener que leer este ADR completo.

## Addendum (2026-08-24, F7 PR1) — "una zona de scroll" es por región, no por pantalla

La regla derivada de arriba se escribió mirando el bug que la produjo: el drawer de programación como overlay `fixed inset-0`, **encimado** sobre el chat, con dos ejes verticales compitiendo en la misma región visual. Al llegar el Calendario quedó claro que la formulación era más estrecha que la intención.

El Calendario tiene un panel de borradores a la izquierda con su propia lista, y un panel del día a la derecha con la suya. Son regiones **hermanas**, lado a lado: en ningún momento el usuario tiene dos scrolls bajo el mismo cursor. Prohibirlas sería aplicar la letra de la regla contra su motivo.

> **Un solo eje de scroll vertical por región.** Regiones hermanas pueden tener el suyo; lo que nunca se apilan son dos ejes en la misma región visual.

Consecuencia de layout: el App Shell sigue siendo `h-dvh overflow-hidden` con un contenedor `overflow-y-auto` **por defecto** para el `<Outlet/>`, porque las páginas viejas dependen de heredarlo. Una pantalla que maneja su propio alto lo declara en su ruta:

```tsx
// App.tsx
{ path: "/calendario", element: <CalendarioPage />, handle: { ownScroll: true } }

// protected.tsx
const ownScroll = useMatches().some((m) => (m.handle as RouteHandle)?.ownScroll);
<div className={`min-h-0 flex-1 ${ownScroll ? "overflow-hidden" : "overflow-y-auto"}`}>
```

Declarativo en la ruta y no un contexto nuevo: es información estática de la pantalla, y `useMatches()` ya la propaga sin que nadie monte un provider. Si no se apagara, el Calendario tendría el eje del shell **más** el suyo — el bug original, otra vez, por la puerta de atrás.

La grilla del mes, además, **no scrollea**: son 5-6 filas `1fr` que llenan el alto, con cap de 3 posts por celda y chip "+N más". Es la forma de tener menos ejes, no más.
