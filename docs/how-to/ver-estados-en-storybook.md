# Ver los estados de UI en Storybook

Storybook es el catálogo local de estados de la web (ADR-027). Sirve para revisar un componente en todos sus estados, en claro y oscuro y a cada ancho, sin levantar la API ni provocar el estado a mano.

## Levantarlo

```bash
pnpm storybook
```

Abre `http://localhost:6006`. Turbo compila antes `@presencia/shared`, porque la web lo consume desde `dist/`. No hace falta la API ni la base.

## Qué revisar en cada historia

- **Tema** (toolbar, ícono de espejo): **Claro**, **Oscuro** o **Lado a lado**. "Lado a lado" pinta la historia dos veces, una en cada tema, para compararlos de un vistazo. Lo que se abre flotando (tooltips, menús, modales) se pinta fuera de la historia y queda en claro en ese modo: para revisarlo, usa **Oscuro**. Las dos copias comparten los stores, así que abrir el panel o seleccionar una card en una mitad cambia la otra: para interactuar, usa un solo tema.
- **Ancho** (toolbar, ícono de viewport): Móvil 390, Tablet 768, Laptop 1024 y Escritorio 1440. Son los mismos anchos que revisa cada PR de UI.
- **Accesibilidad** (panel "Accessibility"): contraste, roles y etiquetas.
- Para la vista general del chat, abre **Chat → Conversación · Estados del turno**: todos los estados del turno en una conversación de ejemplo.

Una historia también se abre sola, sin la interfaz de Storybook, con su tema en la URL:

```
http://localhost:6006/iframe.html?id=chat-conversacion--historial&viewMode=story&globals=tema:ambos
```

Así la recorre Playwright en la verificación de un PR.

## Escribir una historia

Va junto al componente, como `Componente.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { notice } from "../../stories/fixtures/chat.js";
import { TurnStatusCard } from "./TurnStatusCard.js";

const meta = {
  title: "Chat/Estado del turno",
  component: TurnStatusCard,
  args: { notice: notice(), failedAgain: false, apiError: null, onRetry: fn() },
} satisfies Meta<typeof TurnStatusCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Fallo: Story = { args: { notice: notice({ status: "failed" }) } };
```

- **Datos de ejemplo** en `src/stories/fixtures/`, construidos contra los tipos reales (`lib/chat-types.ts`, `lib/turn-status.ts`). Si cambia un tipo, la historia deja de compilar en vez de mostrar un estado que ya no existe.
- **Callbacks con `fn()`:** quedan registrados en el panel "Actions".
- **Un estado nuevo de UI llega con su historia en el mismo PR** (AGENTS.md, Convenciones).
- **Componentes atados a stores o a la API** (las cards, `AssistantMessage`):
  - **Cards vivas:** se declaran en `parameters.cards` y el preview las siembra en `useCardsStore` antes de pintar (`beforeEach`). Fixtures en `src/stories/fixtures/cards.ts`.
  - **Red:** `.storybook/mock-api.ts` responde `/api/images/config` y la sesión (`/api/auth/get-session`, con zona horaria). Cualquier otra ruta de `/api/*` responde 503 con un aviso `[storybook] Sin backend` en consola: si aparece, a esa historia le falta su respuesta de ejemplo.
  - **Imágenes:** `/api/assets/<id>/content` sale de `src/stories/fixtures/assets/<id>/content` (`staticDirs` en `main.ts`). Para la imagen de ejemplo usa `IMAGEN_DEMO`.

## Probar el flujo real contra la API

Storybook muestra los estados; para probar recargar, Reintentar y Editar contra la API, `pnpm --filter @presencia/api seed:dev` siembra la carpeta **"Estados del turno"** en la cuenta de dev: un historial con cada estado viejo y un chat por cada estado accionable (detenida antes de empezar, detenida con texto, falló, falló con texto, sin respuesta). Se recrea en cada corrida, también con la cuenta ya existente: si Reintentar o Editar gastaron un estado, volver a correr el seed lo repone.

## Compilar el catálogo

```bash
pnpm --filter @presencia/web build-storybook
```

Deja el build estático en `apps/web/storybook-static/` (ignorado en git). No corre en CI (ADR-027): úsalo para comprobar que ninguna historia rompe el build antes de un PR grande.
