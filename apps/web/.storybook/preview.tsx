import type { PublicationCardDto } from "@presencia/shared";
import type { Decorator, Preview } from "@storybook/react-vite";
import { useCardSelectionStore } from "../src/stores/card-selection-store.js";
import { useCardsStore } from "../src/stores/cards-store.js";
import { usePublicationPanelStore } from "../src/stores/publication-panel-store.js";
import { useToastStore } from "../src/stores/toast-store.js";
import "../src/styles/app.css";
import { installMockApi, usarRespuestas, type RespuestaDeHistoria } from "./mock-api.js";

// Las pocas rutas de /api/* que piden los componentes conectados (ADR-027).
installMockApi();

type Tema = "light" | "dark" | "ambos";

/**
 * El tema, con el mismo mecanismo que la app (ADR-016): `data-theme` y
 * `colorScheme` en `<html>`. "Lado a lado" pinta la historia dos veces: cada
 * mitad lleva `data-theme` y `data-theme-scope`, y los tokens semánticos se
 * declaran también en `[data-theme-scope]` (tokens.css), así que cada mitad
 * los recalcula para su subárbol, también los derivados (`color-mix` de otro
 * token), igual que el variant `dark:` (app.css). Sirve para revisar claro y
 * oscuro de un vistazo: el dark mode existió desde F1 sin correr nunca.
 *
 * Límites conocidos de "Lado a lado":
 * - Lo que se pinta en un portal a `<body>` (tooltips, menús, modales) queda
 *   en claro aun en la mitad oscura, porque `<html>` es claro. Usa "Oscuro".
 * - Las dos copias comparten los stores (cards, panel, selección): abrir el
 *   panel o seleccionar en una mitad cambia también la otra. Para interactuar,
 *   usa un solo tema.
 */
const withTema: Decorator = (Story, context) => {
  const tema = (context.globals.tema ?? "light") as Tema;
  const base = tema === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = base;
  document.documentElement.style.colorScheme = base;
  if (tema !== "ambos") return <Story />;
  return (
    <div className="grid gap-px bg-line md:grid-cols-2">
      <div
        data-theme="light"
        data-theme-scope
        className="bg-app p-4 text-fg"
        style={{ colorScheme: "light" }}
      >
        <Story />
      </div>
      <div
        data-theme="dark"
        data-theme-scope
        className="bg-app p-4 text-fg"
        style={{ colorScheme: "dark" }}
      >
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
  // Cada historia arranca con los stores limpios: lo que una dejó (el panel que
  // abrió el auto-abrir de CardBlock, una selección, un toast, sus cards) no se
  // cuela en la siguiente. Las cards vivas de la historia (`parameters.cards`) van al store
  // normalizado, con su lista por chat. Antes de pintar, no durante: un
  // setState en el render avisaría que se actualiza otro componente.
  beforeEach: ({ parameters }) => {
    usarRespuestas((parameters.api ?? {}) as Record<string, RespuestaDeHistoria>);
    usePublicationPanelStore.setState(usePublicationPanelStore.getInitialState(), true);
    useCardSelectionStore.setState(useCardSelectionStore.getInitialState(), true);
    useToastStore.setState(useToastStore.getInitialState(), true);
    const cards = (parameters.cards ?? []) as PublicationCardDto[];
    const chatIds: Record<string, string[]> = {};
    for (const c of cards) if (c.chatId) (chatIds[c.chatId] ??= []).push(c.id);
    useCardsStore.setState(
      {
        ...useCardsStore.getInitialState(),
        byId: Object.fromEntries(cards.map((c) => [c.id, c])),
        chatIds,
      },
      true,
    );
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
