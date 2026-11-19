import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router";
import { LibraryPage } from "./biblioteca.js";
import {
  LIBRARY_DETAIL_ROUTES,
  LIBRARY_PAGE,
  LIBRARY_SUMMARY,
  LIBRARY_SUMMARY_EMPTY,
} from "../stories/fixtures/library.js";

// La pantalla de Biblioteca entera (F12), con la API de ejemplo. Aquí se
// puede buscar, filtrar, cambiar a lista, abrir el detalle de una imagen y
// marcar varias (eliminar responde con el error de "Sin backend"); como la API de
// ejemplo responde siempre lo mismo, filtrar no cambia lo que se ve. Los
// estados sueltos (sin resultados, cargando, subidas, arrastre) viven en
// "Biblioteca/Estados".
//
// Para revisar los tres acomodos, cambia el ancho con la barra de Storybook:
// la pantalla se acomoda al ancho de su contenedor, no al de la ventana.

const meta = {
  title: "Biblioteca/Pantalla",
  component: LibraryPage,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={["/biblioteca"]}>
        <div className="h-[900px]">
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof LibraryPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ConImagenes: Story = {
  name: "Con imágenes",
  parameters: {
    api: {
      "/api/library": { body: LIBRARY_PAGE },
      "/api/library/summary": { body: LIBRARY_SUMMARY },
      ...LIBRARY_DETAIL_ROUTES,
    },
  },
};

export const Vacia: Story = {
  name: "Vacía",
  parameters: {
    api: {
      "/api/library": { body: { items: [], nextCursor: null } },
      "/api/library/summary": { body: LIBRARY_SUMMARY_EMPTY },
    },
  },
};

export const ErrorAlCargar: Story = {
  name: "Error al cargar",
  parameters: {
    api: {
      "/api/library": { status: 500, body: { message: "No pudimos cargar tu Biblioteca." } },
      "/api/library/summary": {
        status: 500,
        body: { message: "No pudimos cargar tu Biblioteca." },
      },
    },
  },
};
