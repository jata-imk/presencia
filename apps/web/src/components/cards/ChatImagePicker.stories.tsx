import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import type { AttachmentDto } from "@presencia/shared";
import { IMAGEN_DEMO } from "../../stories/fixtures/cards.js";
import { ChatImagePicker, type ChatImageSource } from "./ChatImagePicker.js";

// "Usar una que adjuntaste" (F10.9, Claude Design "Chat Adjuntos" §5). Es un
// modal en un portal: "Lado a lado" no lo pinta en los dos temas (ver
// preview.tsx); cada tema se revisa con su opción de la barra.

const hoy = new Date();
const ayer = new Date(hoy.getTime() - 86_400_000);

function imagen(n: number, filename: string, at: Date): AttachmentDto {
  return {
    id: `00000000-0000-4000-8000-${String(900 + n).padStart(12, "0")}`,
    kind: "image",
    filename,
    mediaType: "image/png",
    sizeBytes: 1_200_000,
    url: `/api/assets/${IMAGEN_DEMO}/content`,
    width: 1080,
    height: 1350,
    pages: null,
    scanned: false,
    truncated: false,
    tokenEstimate: 1600,
    createdAt: at.toISOString(),
  };
}

const CINCO = [
  imagen(1, "portada-carrusel-agentes.png", hoy),
  imagen(2, "captura-estructura-del-repo.jpg", hoy),
  imagen(3, "slide-02-el-problema.png", hoy),
  imagen(4, "slide-03-agents-md.png", hoy),
  imagen(5, "foto-setup-escritorio.jpg", ayer),
];

const fuente = (list: () => Promise<AttachmentDto[]>, note?: string): ChatImageSource => ({
  list,
  use: () => new Promise(() => {}),
  note,
});

const meta = {
  title: "Cards/Usar una que adjuntaste",
  component: ChatImagePicker,
  args: {
    source: fuente(() => Promise.resolve(CINCO)),
    onUploadOwn: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof ChatImagePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ConImagenes: Story = {};

/** Con una sola no hay nada que elegir: ya viene marcada. */
export const UnaSola: Story = {
  args: { source: fuente(() => Promise.resolve([CINCO[1]!])) },
};

/** En un slide del carrusel: el pie dice que se recorta a su proporción. */
export const EnUnCarrusel: Story = {
  args: { source: fuente(() => Promise.resolve(CINCO), "Se recorta a 4:5 si hace falta") },
};

export const Vacio: Story = {
  args: { source: fuente(() => Promise.resolve([])) },
};

export const Cargando: Story = {
  args: { source: fuente(() => new Promise(() => {})) },
};

export const NoCargo: Story = {
  args: { source: fuente(() => Promise.reject(new Error("red"))) },
};
