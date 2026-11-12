import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter, Route, Routes } from "react-router";
import type { PropuestasDeVozDto } from "@presencia/shared";
import { resetVozVivaStore } from "../../stores/voz-viva-store.js";
import { ConfiguracionLayout } from "./layout.js";

// El shell de Configuración (F9.7). La historia existe por el punto en «Voz de
// marca» (F12.5): aparece cuando «Aprender de mis ediciones» tiene propuestas.
// En escritorio va en el sub-sidebar; por debajo de `md`, en la pestaña.

const CON_PROPUESTA: PropuestasDeVozDto = {
  aprender: true,
  edicionesParaRevisar: 5,
  propuestas: [
    {
      id: "emojis",
      origen: "regla",
      mensaje: "Quitaste emojis en 4 de tus últimas 5 publicaciones.",
      rasgo: "Casi sin emojis",
      evidencia: [],
    },
  ],
};

function Shell() {
  return (
    <MemoryRouter initialEntries={["/configuracion/mi-perfil"]}>
      <Routes>
        <Route path="/configuracion" element={<ConfiguracionLayout />}>
          <Route
            path="*"
            element={<p className="text-sm text-fg-secondary">Contenido de la sección.</p>}
          />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

const meta = {
  title: "Configuración/Shell",
  render: () => <Shell />,
  // El store es uno para toda la app: cada historia arranca limpia antes de montar.
  beforeEach: () => {
    resetVozVivaStore();
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const ConPropuestas: Story = {
  name: "Punto en Voz de marca (hay propuestas)",
  parameters: { api: { "/api/brand-voice/propuestas": { body: CON_PROPUESTA } } },
};

export const SinPropuestas: Story = {
  name: "Sin propuestas",
  parameters: {
    api: {
      "/api/brand-voice/propuestas": {
        body: { ...CON_PROPUESTA, propuestas: [] } satisfies PropuestasDeVozDto,
      },
    },
  },
};
