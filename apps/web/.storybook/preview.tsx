import type { PublicationCardDto } from "@presencia/shared";
import type { Decorator, Preview } from "@storybook/react-vite";
import { useCardsStore } from "../src/stores/cards-store.js";
import "../src/styles/app.css";
import { installMockApi } from "./mock-api.js";

// Las pocas rutas de /api/* que piden los componentes conectados (ADR-027).
installMockApi();

type Tema = "light" | "dark" | "ambos";

/**
 * El tema, con el mismo mecanismo que la app (ADR-016): `data-theme` y
 * `colorScheme` en `<html>`. "Lado a lado" pinta la historia dos veces: los
 * tokens se declaran en `[data-theme]` además de `:root` (tokens.css), así
 * que un `<div data-theme="dark">` los recalcula para su subárbol, también los
 * derivados (`color-mix` de otro token), igual que el variant `dark:`
 * (app.css). Sirve para revisar claro y oscuro de un vistazo: el dark mode
 * existió desde F1 sin correr nunca.
 *
 * Límite conocido: lo que se pinta en un portal a `<body>` (tooltips, menús,
 * modales) queda en claro aun en la mitad oscura, porque `<html>` es claro en
 * este modo. Para revisarlos, usa "Oscuro".
 */
const withTema: Decorator = (Story, context) => {
  const tema = (context.globals.tema ?? "light") as Tema;
  const base = tema === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = base;
  document.documentElement.style.colorScheme = base;
  if (tema !== "ambos") return <Story />;
  return (
    <div className="grid gap-px bg-line md:grid-cols-2">
      <div data-theme="light" className="bg-app p-4 text-fg" style={{ colorScheme: "light" }}>
        <Story />
      </div>
      <div data-theme="dark" className="bg-app p-4 text-fg" style={{ colorScheme: "dark" }}>
        <Story />
      </div>
    </div>
  );
};

const viewport = (
  name: string,
  width: number,
  height: number,
  type: "mobile" | "tablet" | "desktop",
) => ({
  name,
  styles: { width: `${String(width)}px`, height: `${String(height)}px` },
  type,
});

const preview: Preview = {
  decorators: [withTema],
  // Las cards vivas de la historia (`parameters.cards`), en el store normalizado
  // que leen CompactCard y AssistantMessage. Antes de pintar, no durante: un
  // setState en el render avisaría que se actualiza otro componente.
  beforeEach: ({ parameters }) => {
    const cards = (parameters.cards ?? []) as PublicationCardDto[];
    useCardsStore.setState({ byId: Object.fromEntries(cards.map((c) => [c.id, c])) });
  },
  globalTypes: {
    tema: {
      description: "Tema de la interfaz",
      toolbar: {
        title: "Tema",
        icon: "mirror",
        items: [
          { value: "light", title: "Claro" },
          { value: "dark", title: "Oscuro" },
          { value: "ambos", title: "Lado a lado" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { tema: "light" },
  parameters: {
    layout: "padded",
    // Los anchos que revisa cada PR de UI (AGENTS.md, flujo de una fase).
    viewport: {
      options: {
        movil: viewport("Móvil · 390", 390, 844, "mobile"),
        tablet: viewport("Tablet · 768", 768, 1024, "tablet"),
        laptop: viewport("Laptop · 1024", 1024, 800, "desktop"),
        escritorio: viewport("Escritorio · 1440", 1440, 900, "desktop"),
      },
    },
    controls: { expanded: true },
  },
};

export default preview;
