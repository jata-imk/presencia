# ADR-027 · Storybook: catálogo local de estados de UI

**Decisión:** `apps/web` tiene Storybook (10.6.1, framework `@storybook/react-vite`) como catálogo **local** de los estados de UI: `pnpm storybook`, puerto 6006. Cada estado nuevo de UI llega con su historia en el mismo PR (convención en AGENTS.md). Las historias viven junto a su componente (`Componente.stories.tsx`) y los datos de ejemplo en `src/stories/fixtures/`, construidos contra los tipos reales.

**Razón:** varios estados solo existen en vivo. Detener en el segundo justo, cortar la red, quedarse sin cuota, una card programada o publicada, una imagen generando: no había forma de verlos sin provocarlos a mano (F10.8.2, 2026-10-11). Dos lecciones del proyecto apuntaban al mismo hueco:

- el dark mode existió desde F1 sin correr nunca, y aparecieron 4 bugs al activarlo;
- 3 bugs de layout de F7 pasaron con aserciones en verde.

Ver cada estado en claro y oscuro, a cada ancho y sin backend ataca las dos cosas.

## Cómo está armado

- **Vite y Tailwind tal cual:** react-vite carga el `vite.config.ts` de la web, así que Tailwind v4 (`@tailwindcss/vite`) y los tokens llegan igual que en la app. El preview importa `src/styles/app.css`.
- **Tema con el mecanismo de ADR-016:** `data-theme` y `colorScheme` en `<html>`, desde un control propio del toolbar (Claro, Oscuro y **Lado a lado**). "Lado a lado" pinta la historia dos veces, en un `<div data-theme="light">` y otro `data-theme="dark"`. Funciona porque los tokens oscuros se definen en `[data-theme="dark"]` y no solo en `<html>`, igual que el variant `dark:`. No se usa `@storybook/addon-themes`: un decorator de 20 líneas hace lo mismo y suma el lado a lado.
- **Viewports:** 390, 768, 1024 y 1440, los anchos que revisa cada PR de UI.
- **Addon de accesibilidad** (`@storybook/addon-a11y`) para la auditoría de foco y contraste de F13.
- **Tooling:**
  - `.storybook/*.ts(x)` está en el `include` del tsconfig de la web, porque el lint con `projectService` lo exige.
  - `eslint-plugin-storybook` aplica sus reglas a `*.stories.tsx`.
  - `storybook-static/` se ignora en git y prettier.
  - Turbo tiene la tarea `storybook` (persistente, depende de `^build` porque la web consume shared desde `dist/`).

## Qué no entra (decisión de Jose, plan de F10.8.3)

- **CI:** ni el addon de Vitest (las historias como tests en Chromium) ni `build-storybook`. Las historias están en `src/`, así que `pnpm typecheck` y `pnpm lint`, que sí corren en CI, las compilan. Una historia que truena en runtime se descubre al abrirla.
- **Publicar el build:** solo local.
- **MSW:** los componentes atados a stores o red se cubren con un stub de `fetch` para `/api/*` y sembrando los stores en un decorator (PR3 de la fase).

## Cuándo reevaluar

- Si una historia rota llega a `main` más de una vez: agregar el addon de Vitest a CI. Cuesta ~1–2 min por instalar Chromium.
- Si hace falta revisar desde el teléfono o compartir con alguien: publicar el build estático.
- Si los mocks a mano de `fetch` y stores se vuelven frágiles: MSW (`msw-storybook-addon`).

## Descartado

- **Galería casera en `/dev/estados`.** Con más módulos se convertiría en un Storybook a medias, sin viewports, accesibilidad ni tests.
- **Chromatic u otro servicio de regresión visual.** Es infra externa y de pago para un founder solo.
- **Chats sembrados como única herramienta.** Prueban el flujo real contra la API, pero no cubren lo que solo pasa en vivo (sin cuota, un rechazo 413). Se suman como complemento en `seed:dev` (PR4 de la fase).

**Ver también:** ADR-016 (tema) y `docs/how-to/ver-estados-en-storybook.md`.
