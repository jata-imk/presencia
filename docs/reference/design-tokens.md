# Design tokens

> Fuente de diseño: proyecto de Claude Design **"Pastel Dreamland Adventure - HeroUI"** (`b1364a41-e973-4c87-bca4-d5de36dddc78`), archivos `colors_and_type.css` (light) y `preview/dark-mode.html` (mapeo dark). Implementados en `apps/web/src/styles/tokens.css` con Tailwind v4 (config CSS-first).

## Arquitectura de tres capas

1. **Paleta cruda** (`@theme`): escalas plum/pink/blue/neutral + pasteles de marca (`pink-orchid`, `pastel-petal`, `blush-pop`, `icy-blue`, `sky-blue`), tipografías, type scale, radius, sombras (tinte plum), easings. Genera utilities de Tailwind (`bg-plum-800`, `font-display`, `text-2xl`, `shadow-md`).
2. **Tokens semánticos** (`:root` / `[data-theme="dark"]`): `--fg-*`, `--bg-*`, `--border-*`, `--interactive-*`, `--status-*`, layout. Son los que cambian con el tema.
3. **Utilities semánticas** (`@theme inline`): `bg-app`, `bg-card`, `text-fg`, `text-fg-secondary`, `border-line`, `bg-primary`/`text-primary-fg`, `bg-ai-bg`, etc. **Esta es la capa que usan los componentes.**

## Reglas de uso

- Componentes usan la capa 3 (semántica) siempre que exista; la capa 1 solo para casos genuinamente decorativos de marca. **Nunca hex** (regla dura #2 de AGENTS.md).
- Dark mode: atributo `data-theme="dark"` en `<html>`; variante `dark:` de Tailwind configurada sobre ese atributo. Nota clave del diseño: en dark, el elemento activo/CTA primario **invierte** a Blush Pop con texto plum (`--interactive-primary`).
- Layout: `--sidebar-width` (220px), `--topbar-height` (56px), `--content-max-w` (800px) — vía valores arbitrarios (`w-(--sidebar-width)`).
- Duraciones: `--duration-fast/normal/slow` (150/250/350ms) con `--ease-out` como default de entrada.

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

## Pendientes

- **Fuentes:** hoy vía Google Fonts (`@import` en `app.css`); auto-hostear (woff2 en el repo o bucket) antes de lanzar — privacidad y latencia.
- Los assets de marca (`isotipo.png`, `logotipo.png`) del proyecto de diseño se importan junto con el App Shell (post-F1).
- Iconografía: Lucide (stroke 1.5px) — `lucide-react` instalado en F6 PR4. Nota: esta versión no trae ícono de marca de YouTube (`Youtube` no existe en el paquete) — se usa `SquarePlay` genérico en `components/cards/NetworkLogos.tsx`.
