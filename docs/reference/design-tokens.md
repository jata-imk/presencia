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

## Pendientes

- **Fuentes:** hoy vía Google Fonts (`@import` en `app.css`); auto-hostear (woff2 en el repo o bucket) antes de lanzar — privacidad y latencia.
- Los assets de marca (`isotipo.png`, `logotipo.png`) del proyecto de diseño se importan junto con el App Shell (post-F1).
- Iconografía: Lucide (stroke 1.5px) — se agrega `lucide-react` cuando entren las pantallas.
