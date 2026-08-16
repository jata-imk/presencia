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

**Descartado — sin librería, solo transiciones CSS en cada componente:** era la opción más barata en peso de bundle, pero deja la coordinación de entrada/salida del DOM (cuándo desmontar, cómo animar `AnimatePresence`-style sin la librería) reinventada a mano en cada drawer/modal/toast nuevo — el mismo problema que llevó a esta decisión en primer lugar, solo que sin nombre.

**Bundle:** motion agrega peso real al chunk principal (~790KB sin comprimir a la fecha de este ADR, con `motion/react` incluido). Si eso se vuelve un problema, la salida es `LazyMotion` + el componente `m` (import dinámico de las features de animación) — no se aplica ahora porque no hay evidencia de que el peso importe todavía (YAGNI, AGENTS.md #6).

**Ver también:** [`docs/reference/design-tokens.md`](../../reference/design-tokens.md) §Movimiento — los tokens de duración/easing y la regla de una sola zona de scroll, documentados para consulta rápida sin tener que leer este ADR completo.
