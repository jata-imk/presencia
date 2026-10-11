import type { Decorator, Preview } from "@storybook/react-vite";
import "../src/styles/app.css";

type Tema = "light" | "dark" | "ambos";

/**
 * El tema, con el mismo mecanismo que la app (ADR-016): `data-theme` y
 * `colorScheme` en `<html>`. "Lado a lado" pinta la historia dos veces: los
 * tokens oscuros se definen en `[data-theme="dark"]` (tokens.css), no solo en
 * `<html>`, así que un `<div data-theme="dark">` los redefine para su
 * subárbol, igual que el variant `dark:` (app.css). Sirve para revisar claro y
 * oscuro de un vistazo: el dark mode existió desde F1 sin correr nunca.
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
