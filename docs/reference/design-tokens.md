# Design tokens

> Fuente de diseño: proyecto de Claude Design **"Pastel Dreamland Adventure - HeroUI"** (`b1364a41-e973-4c87-bca4-d5de36dddc78`), archivos `colors_and_type.css` (light) y `preview/dark-mode.html` (mapeo dark). Implementados en `apps/web/src/styles/tokens.css` con Tailwind v4 (config CSS-first).

## Arquitectura de tres capas

1. **Paleta cruda** (`@theme`): escalas plum/pink/blue/neutral + pasteles de marca (`pink-orchid`, `pastel-petal`, `blush-pop`, `icy-blue`, `sky-blue`), tipografías, type scale, radius, sombras (tinte plum), easings. Genera utilities de Tailwind (`bg-plum-800`, `font-display`, `text-2xl`, `shadow-md`).
2. **Tokens semánticos** (`:root` / `[data-theme="dark"]`): `--fg-*`, `--bg-*`, `--border-*`, `--interactive-*`, `--status-*`, layout. Son los que cambian con el tema.
3. **Utilities semánticas** (`@theme inline`): `bg-app`, `bg-card`, `text-fg`, `text-fg-secondary`, `border-line`, `bg-primary`/`text-primary-fg`, `bg-ai-bg`, etc. **Esta es la capa que usan los componentes.**

## Reglas de uso

- Componentes usan la capa 3 (semántica) siempre que exista; la capa 1 solo para casos genuinamente decorativos de marca. **Nunca hex** (regla dura #2 de AGENTS.md).
- Dark mode: atributo `data-theme="dark"` en `<html>`, escrito por un script inline en `index.html` antes del primer paint y sincronizado después por `useThemeSync()` (**ADR-016**); variante `dark:` de Tailwind configurada sobre ese atributo. Nota clave del diseño: en dark, el elemento activo/CTA primario **invierte** a Blush Pop con texto plum (`--interactive-primary`). Además del mapeo de abajo, voltean en dark: `--status-*-bg` (los tintes claros se leían como bloques luminosos sobre una card oscura), `--shadow-*` (las rgba plum son invisibles sobre `#0f0a12`; se refuerzan con negro real), `--scrollbar-thumb` y `--brand-monochrome` (X/TikTok/Threads, cuyo logo negro desaparecía).
- Layout: `--sidebar-width` (220px), `--sidebar-width-collapsed` (56px), `--sidebar-width-min`/`-max` (200/320px), `--topbar-height` (56px), `--content-max-w` (800px) — vía valores arbitrarios (`w-(--sidebar-width)`). **`--sidebar-width` es el default, no la ley:** desde F6.5 el usuario arrastra el borde del sidebar y el valor elegido se escribe **inline sobre `<html>`** (`applySidebarWidth` en `stores/sidebar-store.ts`), que gana al `:root` por origen sin pelear especificidad. El `<nav>` nunca lleva un `style` de ancho propio — si lo llevara, cualquier re-render durante el arrastre re-aplicaría el valor viejo de React y la barra saltaría hacia atrás a mitad del gesto.
- Duraciones: `--duration-fast/normal/slow` (150/250/350ms) con `--ease-out` como default de entrada. Ver §Movimiento para cómo se usan de verdad (ADR-014).

## Dark mode — mapeo canónico

| Token                    | Light                | Dark                  |
| ------------------------ | -------------------- | --------------------- |
| `bg-app`                 | `#F5F0F8` (plum-50)  | `#0F0A12`             |
| `bg-surface`             | `#FAFAFA`            | `#150D1A`             |
| `bg-card`                | `#FFFFFF`            | `#1A0F20`             |
| `border-default`         | `#EBEBEB`            | `#2D1F38`             |
| `fg-primary`             | `#1A1A1A`            | `#E8DDEE` (plum-100)  |
| `fg-secondary`           | `#6B7280`            | `#C4A8D4`             |
| `fg-muted`               | `#9CA3AF`            | `#6B5A78`             |
| `interactive-primary`    | `#3D2645` (plum-800) | `#FFAFCC` (blush-pop) |
| `interactive-primary-fg` | `#FFFFFF`            | `#3D2645`             |

## Trampa conocida: modificador de opacidad (`/40`) sobre tokens indirectos

**No uses `border-info/40`, `bg-warning-bg/60`, `text-fg-inverse/60`, etc.** — Tailwind v4 (config CSS-first) genera esa clase con `color-mix()` solo cuando puede resolver el color en el propio `@theme`; nuestros tokens de capa 2/3 son _cadenas_ de `var()` (`--color-info: var(--status-info)`, y `--status-info` a su vez puede ser otro `var()`). Con esa indirección, Tailwind **compila sin error y sin avisar, pero no emite ninguna regla CSS** — el elemento queda sin ese borde/fondo, invisible hasta que alguien inspecciona el DOM. Se detectó así en F6 PR4 (drawer y cards con bordes/fondos "fantasma").

**Solución aplicada:** para cada combinación semántica+opacidad que un componente necesita de verdad, se define su propio token con `color-mix()` explícito en `tokens.css` (sin modificador de Tailwind) — ver `--status-success-border`, `--status-warning-border`, `--status-error-border`, `--status-info-border`, `--status-ai-border`, `--fg-inverse-muted`, `--fg-inverse-subtle`, `--fg-inverse-faint`, registrados en `@theme inline` como `--color-*-border` / `--color-fg-inverse-*`. Se usan como clase normal (`border-info-border`), nunca con `/NN`.

**Regla práctica:** antes de usar un modificador de opacidad sobre cualquier color que no sea un color crudo de Tailwind (`white`, `black`) o de la capa 1 declarada directo en `@theme` con un hex literal (`pink-orchid`, `blush-pop`, etc. — aun así, **verificado que tampoco funciona** para esos: ver arriba), da por hecho que no va a compilar y define el token específico. Verificar generación real: `grep "nombre-clase" dist/assets/index-*.css` tras un build — si no aparece, no se generó.

## Trampa hermana: valores de `@theme` que Tailwind inlinea (sombras)

Misma familia que la de arriba, distinto mecanismo, encontrada en el code review de F6.5.

**Redefinir `--shadow-*` bajo `[data-theme="dark"]` no hace nada.** Tailwind v4 resuelve los valores de `@theme` **en tiempo de build** y hornea el color dentro de la utility, porque necesita partirlo para poder inyectar `--tw-shadow-color`:

```css
/* lo que Tailwind genera a partir de --shadow-lg: 0 2px 8px rgba(61,38,69,.08) */
.shadow-lg {
  --tw-shadow: 0 2px 8px var(--tw-shadow-color, #3d264514), ...;
}
```

El `#3d264514` es literal: para cuando el navegador aplica `[data-theme="dark"]`, la utility ya no consulta `--shadow-lg`. El bloque dark parece correcto, compila, y no cambia un solo píxel.

**Solución aplicada:** el valor en `@theme` referencia otro token para el COLOR, y ese es el que voltea por tema:

```css
@theme {
  --shadow-lg: 0 2px 8px var(--shadow-tint-md), 0 8px 32px var(--shadow-tint-lg);
}
:root {
  --shadow-tint-md: rgba(61, 38, 69, 0.08);
}
[data-theme="dark"] {
  --shadow-tint-md: rgba(0, 0, 0, 0.45);
}
```

Un `var()` sobrevive al inlineado (`var(--tw-shadow-color, var(--shadow-tint-md))`) y se resuelve en runtime.

**Regla práctica:** cualquier token de `@theme` que tenga que cambiar con el tema debe llevar el valor variable dentro de un `var()` anidado, no como literal. Y la verificación es la misma que la trampa anterior: mirar el CSS generado (`grep -o "\.shadow-lg{[^}]*}" dist/assets/index-*.css`), no el fuente.

## Tokens del Calendario (`--cal-*`, F7)

La grilla saca casi todo de `--status-*`: la píldora "programado" usa el mismo lenguaje que el badge Programado de la card en Chat (`--status-info-bg` / `-border`), la de "publicado" el de éxito y la de borrador el de `--status-ai`. Que se vea igual en los dos módulos no es coincidencia, es el punto.

Lo único que necesitó tokens nuevos es lo que `--status-*` no cubre:

| Token                | Claro      | Oscuro             | Para qué                                                         |
| -------------------- | ---------- | ------------------ | ---------------------------------------------------------------- |
| `--cal-scheduled-fg` | `#2C5480`  | `#A8CDF5`          | Texto sobre la píldora programada (el fondo se invierte en dark) |
| `--cal-published-fg` | `#2F7D52`  | `#7FD6A4`          | Ídem, publicada                                                  |
| `--cal-draft-fg`     | `#5B4569`  | `--color-plum-200` | Ídem, borrador                                                   |
| `--cal-day-out-bg`   | `#FCFBFD`  | `#120B16`          | Celda de un día de otro mes                                      |
| `--cal-group-bg`     | orchid 12% | orchid 16%         | Fondo del contenedor de grupo multi-red                          |

Utilities: `text-cal-scheduled-fg`, `text-cal-published-fg`, `text-cal-draft-fg`, `bg-cal-day-out`, `bg-cal-group`.

El día de otro mes se **hunde** un escalón por debajo de `--bg-card` en los dos temas (`#FCFBFD` bajo el blanco, `#120B16` bajo el `#1A0F20`). El sentido es el mismo y solo cambia el valor: alejarse del primer plano es lo que se lee como "este día no es de este mes", y hacia dónde queda ese alejamiento depende del tema.

Los del arrastre llegaron con el PR que los pinta:

| Token                  | Cómo se calcula                          | Para qué                       |
| ---------------------- | ---------------------------------------- | ------------------------------ |
| `--cal-drop-valid`     | `--status-ai` 14% sobre `--bg-card`      | Día donde sí se puede soltar   |
| `--cal-drop-target`    | `--status-ai` 32% sobre `--bg-card`      | El día bajo el cursor          |
| `--cal-drop-conflict`  | `--status-warning` 18% sobre `--bg-card` | Choque de horario en ese día   |
| `--cal-drop-past-veil` | `--bg-app` 55% sobre transparente        | Capa sobre los días ya pasados |

Ninguno necesita override en oscuro: se derivan de tokens que **ya** voltean, así que no pueden quedar desincronizados si `--status-ai` o `--bg-card` cambian. El velo usa `--bg-app` porque se invierte solo — en claro acerca la celda al fondo de la app, en oscuro la hunde; el efecto que se lee ("esto se aleja") es el mismo en los dos.

### Tercera trampa: dos utilities sobre la misma propiedad

Entre dos utilities que tocan lo mismo gana **la que Tailwind emite última**, no la que esté después en el atributo `class`. La celda del calendario trae su `bg-card`, su `border-transparent` y —si es hoy— su `inset-ring-primary`; el estado de destino quiere pisar los tres. Los offsets reales en el CSS generado:

| Utility              | Offset | Contra                        | Resultado si se apilan         |
| -------------------- | ------ | ----------------------------- | ------------------------------ |
| `border-ai`          | 16 766 | `border-transparent` (17 420) | el borde punteado **no se ve** |
| `border-warning`     | 17 459 | `border-transparent` (17 420) | sí se ve                       |
| `inset-ring-ai`      | 28 163 | `inset-ring-primary` (28 282) | en HOY el anillo **no se ve**  |
| `inset-ring-warning` | 28 351 | `inset-ring-primary` (28 282) | sí se ve                       |

Dos estados hermanos con comportamiento distinto sin que nadie lo decidiera, y el caso perdido siempre es el mismo: el día de hoy, justo donde más importa ver dónde va a caer la publicación.

**La salida no es pelear la cascada, es no apilar.** Cuando el veredicto de arrastre pinta la celda, sus clases base (`bg-*`, `border-transparent`, `inset-ring-primary`) directamente no se emiten — ver `OVERRIDES_CELL` en `MonthGrid.tsx`. Lo mismo con `--cal-drop-*`, que se mezclan contra `--bg-card` en vez de contra `transparent` para no depender de qué haya debajo.

Ninguno de estos tres bugs aparecía revisando qué clases estaban aplicadas: estaban todas. Solo salen midiendo el estilo computado o leyendo el CSS generado.

## Movimiento (ADR-014)

Decisión completa en [ADR-014](../explanation/decisions/adr-014-estrategia-de-animacion.md); acá el resumen operativo.

- **`motion`** (paquete renombrado de framer-motion, `apps/web/src/lib/motion.ts`) para entrada/salida del DOM y cambios de layout: drawer, toasts, modales, cards nuevas. `DURATION`/`EASE_OUT`/`EASE_IN_OUT` en ese archivo son el espejo en JS de `--duration-*`/`--ease-*` — motion no puede leer `var()` de CSS. Variants compartidas: `fadeUp`, `drawerPush`, `sheetUp`, `sheetLeft` (drawer mobile del sidebar), `collapseSection` (acordeón de carpetas), `toastIn`, `backdropFade`. `components/ui/Modal.tsx` acepta `align="top"` e `initialFocus` — los usa la paleta ⌘K, que es un combobox: sus opciones están fuera del tab order y el foco tiene que quedarse en el input.
- **CSS puro** (`@keyframes` en `app.css`) para loops ambientales infinitos (`glow-rotate`, `glow-pulse`, `shimmer`, `dot-pulse`, `stream-cursor`) y micro-transiciones de hover/focus. Nunca al revés.
- **Ningún componente hardcodea su propia duración/easing** — mismo criterio que "tokens, no hex" (AGENTS.md #2), aplicado a movimiento.
- **Accesibilidad:** `<MotionConfig reducedMotion="user">` en `App.tsx` cubre todo `motion.*` de una vez; los `@keyframes` ambientales se apagan enteros bajo `@media (prefers-reduced-motion: reduce)` en `app.css` (no se acortan — son decorativos, no comunican estado).
- **Un solo eje de scroll vertical por región** (precisado en el addendum de F7 — antes decía "por pantalla"): el App Shell (`routes/protected.tsx`) es `h-dvh overflow-hidden`, con un contenedor `overflow-y-auto` **por defecto** para el `<Outlet/>` — que la ruta puede apagar declarando `handle: { ownScroll: true }` cuando maneja su propio alto (el Calendario, F7). El drawer de programación es un hermano flex (`motion.aside` con `width` animado) en desktop, nunca un overlay `fixed inset-0` — eso fue lo que producía scrolls encimados (F6 PR4→PR5). En mobile sí es bottom-sheet modal con backdrop.

## Pendientes

- **Fuentes:** hoy vía Google Fonts (`@import` en `app.css`); auto-hostear (woff2 en el repo o bucket) antes de lanzar — privacidad y latencia.
- Los assets de marca (`isotipo.png`, `logotipo.png`) del proyecto de diseño se importan junto con el App Shell (F6 PR5) — pendiente de que Jose los baje de Claude Design a `apps/web/public/assets/`; hasta entonces el avatar de IA cae a un círculo plum sin glifo.
- Iconografía: Lucide (stroke 1.5px) — `lucide-react` instalado en F6 PR4. Nota: esta versión no trae ícono de marca de YouTube (`Youtube` no existe en el paquete) — se usa `SquarePlay` genérico en `components/cards/NetworkLogos.tsx`. Varios nombres de íconos "clásicos" (`AlertTriangle`, `CheckCircle2`, `MoreHorizontal`, `BarChart3`...) tampoco están declarados como export directo en esta versión — sí existen como alias re-exportado del nombre nuevo (`TriangleAlert as AlertTriangle`, etc., ver `dist/lucide-react.d.ts`); si TypeScript se queja de un nombre de ícono, revisar ahí antes de asumir que no existe.
