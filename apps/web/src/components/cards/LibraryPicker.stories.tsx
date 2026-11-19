import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";
import { LIBRARY_PAGE } from "../../stories/fixtures/library.js";
import { LibraryPicker, type LibraryImageSource } from "./LibraryPicker.js";

// "Elegir de Biblioteca" (F12 PR5, Claude Design "Presencia - Biblioteca" →
// ElegirDeBiblioteca), con la API de ejemplo: la API responde siempre lo
// mismo, así que cambiar de pestaña o buscar no cambia lo que se ve. Es un
// modal en un portal: "Lado a lado" no lo pinta en los dos temas (ver
// preview.tsx); cada tema se revisa con su opción de la barra.

const fuente = (over: Partial<LibraryImageSource> = {}): LibraryImageSource => ({
  subtitle: "Para la imagen de tu card de Instagram",
  use: () => new Promise(() => {}),
  ...over,
});

const CON_IMAGENES = { "/api/library": { body: LIBRARY_PAGE } };
const VACIA = { "/api/library": { body: { items: [], nextCursor: null } } };

/** Marca la primera imagen: el pie pasa de "Subir desde tu equipo" a sus datos. */
async function elegirLaPrimera() {
  const [first] = await within(document.body).findAllByRole("radio");
  if (first) await userEvent.click(first);
}

const meta = {
  title: "Cards/Elegir de Biblioteca",
  component: LibraryPicker,
  args: {
    source: fuente(),
    onUploadOwn: fn(),
    onClose: fn(),
  },
  parameters: { api: CON_IMAGENES },
} satisfies Meta<typeof LibraryPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ConImagenes: Story = { name: "Con imágenes" };

export const Seleccionada: Story = {
  name: "Con una elegida",
  play: elegirLaPrimera,
};

/** En un slide del carrusel: el subtítulo dice cuál y el pie avisa del recorte. */
export const EnUnCarrusel: Story = {
  name: "En un slide del carrusel",
  args: {
    source: fuente({
      subtitle: "Para el slide 3 de tu carrusel de Instagram",
      note: "Se recorta a 4:5 si hace falta",
    }),
  },
  play: elegirLaPrimera,
};

/** La card está generando: se ve, pero no se puede usar todavía. */
export const CardOcupada: Story = {
  name: "Card ocupada",
  args: { busy: true },
  play: elegirLaPrimera,
};

export const Cargando: Story = {
  parameters: { api: { "/api/library": { body: null, pending: true } } },
};

export const ErrorAlCargar: Story = {
  name: "Error al cargar",
  parameters: {
    api: {
      "/api/library": { status: 500, body: { message: "No pudimos cargar tu Biblioteca." } },
    },
  },
};

export const BibliotecaVacia: Story = {
  name: "Biblioteca vacía",
  parameters: { api: VACIA },
};

export const SinResultados: Story = {
  name: "Sin resultados",
  parameters: { api: VACIA },
  play: async () => {
    const search = await within(document.body).findByLabelText("Buscar en tu Biblioteca");
    await userEvent.type(search, "atardecer en la playa");
  },
};
