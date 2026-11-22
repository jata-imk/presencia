import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router";
import { AnaliticasPage } from "./analiticas.js";
import {
  REDES_RECONECTAR,
  RESUMEN_CERO,
  RESUMEN_COMPLETO,
  RESUMEN_DESACTUALIZADO,
  RESUMEN_POCA,
  RESUMEN_TIKTOK,
  rutasDeAnaliticas,
} from "../stories/fixtures/analiticas.js";

// La pantalla de Analíticas entera (F12), con la API de ejemplo. El mock
// responde por ruta sin mirar el query string, así que cambiar el periodo o la
// red no cambia los números: cada estado es su propia historia. Los estados
// sueltos (tarjetas de red, filas de la tabla, la celda con muchas redes)
// viven en "Analíticas/Estados".
//
// Para revisar escritorio y móvil, cambia el ancho con la barra de Storybook:
// la pantalla se acomoda al ancho de su contenedor, no al de la ventana.

const meta = {
  title: "Analíticas/Pantalla",
  component: AnaliticasPage,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story, { parameters }) => (
      <MemoryRouter initialEntries={[(parameters.ruta as string | undefined) ?? "/analiticas"]}>
        <div className="h-[1000px]">
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof AnaliticasPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Completa: Story = {
  name: "Completa · por red",
  parameters: { api: rutasDeAnaliticas(RESUMEN_COMPLETO) },
};

export const PorPublicacion: Story = {
  name: "Completa · por publicación",
  parameters: {
    ruta: "/analiticas?lente=publicacion",
    api: rutasDeAnaliticas(RESUMEN_COMPLETO),
  },
};

export const UnaRedSinAlcance: Story = {
  name: "Una red sin alcance (TikTok)",
  parameters: { ruta: "/analiticas?red=tiktok", api: rutasDeAnaliticas(RESUMEN_TIKTOK) },
};

export const PocaData: Story = {
  name: "Poca data",
  parameters: { api: rutasDeAnaliticas(RESUMEN_POCA) },
};

export const CuentaPorReconectar: Story = {
  name: "Cuenta por reconectar",
  parameters: { api: rutasDeAnaliticas(RESUMEN_COMPLETO, REDES_RECONECTAR) },
};

export const Desactualizada: Story = {
  name: "Datos desactualizados",
  parameters: { api: rutasDeAnaliticas(RESUMEN_DESACTUALIZADO) },
};

export const CeroAbsoluto: Story = {
  name: "Cero absoluto",
  parameters: { api: rutasDeAnaliticas(RESUMEN_CERO) },
};

export const Cargando: Story = {
  parameters: {
    api: {
      "/api/analiticas/resumen": { pending: true },
      "/api/analiticas/redes": { pending: true },
      "/api/analiticas/publicaciones": { pending: true },
    },
  },
};

export const ErrorAlCargar: Story = {
  name: "Error al cargar",
  parameters: {
    api: {
      "/api/analiticas/resumen": { status: 500, body: { message: "Error interno" } },
      "/api/analiticas/redes": { status: 500, body: { message: "Error interno" } },
      "/api/analiticas/publicaciones": { status: 500, body: { message: "Error interno" } },
    },
  },
};

export const ErrorEnUnaLente: Story = {
  name: "Error en una lente",
  parameters: {
    api: {
      ...rutasDeAnaliticas(RESUMEN_COMPLETO),
      "/api/analiticas/redes": { status: 500, body: { message: "Error interno" } },
    },
  },
};
