import { MAX_MESSAGE_CHARS } from "@presencia/shared";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import type { FileUIPart } from "ai";
import { IMAGEN_DEMO } from "../../stories/fixtures/cards.js";
import { PEDIDO, PEDIDO_LARGO } from "../../stories/fixtures/chat.js";
import { MessageUser } from "./MessageUser.js";

const meta = {
  title: "Chat/Mensaje del creator",
  component: MessageUser,
  args: {
    text: PEDIDO,
    onEdit: fn(),
    onCancelEdit: fn(),
    onSubmitEdit: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-[732px] py-2">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MessageUser>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Un mensaje viejo: solo Copiar (en hover con mouse; al tocarlo en táctil). */
export const Normal: Story = {};

export const Largo: Story = { args: { text: PEDIDO_LARGO } };

/** El último mensaje: suma "Editar". */
export const Ultimo: Story = { name: "Último (editable)", args: { canEdit: true } };

export const EnEdicion: Story = {
  name: "En edición",
  args: { canEdit: true, editing: true },
};

export const EdicionPasadaDelTope: Story = {
  name: "En edición, pasada del tope",
  args: { canEdit: true, editing: true, text: "a".repeat(MAX_MESSAGE_CHARS + 25) },
};

// F10.9: mensajes con adjuntos (Claude Design "Chat Adjuntos" §4). Las imágenes
// usan la imagen de demo de las cards; abrir un archivo de texto o un PDF
// necesita la API y aquí no carga.
const imagen = (n: number): FileUIPart => ({
  type: "file",
  mediaType: "image/png",
  filename: `slide-${String(n).padStart(2, "0")}.png`,
  url: `/api/assets/${IMAGEN_DEMO}/content?${String(n)}`,
});
const archivo = (filename: string, mediaType: string): FileUIPart => ({
  type: "file",
  mediaType,
  filename,
  url: `/api/attachments/00000000-0000-4000-8000-00000000000${String(filename.length % 9)}/content`,
});
const imagenes = (n: number) => Array.from({ length: n }, (_, i) => imagen(i + 1));

export const UnaImagen: Story = {
  name: "Adjuntos · una imagen",
  args: { text: "Esta es la portada que quiero", files: imagenes(1) },
};

export const DosImagenes: Story = {
  name: "Adjuntos · dos imágenes",
  args: { text: "¿Cuál funciona mejor?", files: imagenes(2) },
};

export const TresImagenesSinTexto: Story = {
  name: "Adjuntos · tres imágenes, sin texto",
  args: { text: "", files: imagenes(3) },
};

export const SieteImagenes: Story = {
  name: "Adjuntos · siete imágenes (+3)",
  args: { text: "Todas las slides", files: imagenes(7) },
};

export const Archivos: Story = {
  name: "Adjuntos · archivos",
  args: {
    text: "",
    files: [
      archivo("Kit-de-medios-JoseTejero-2026.pdf", "application/pdf"),
      archivo("guia-de-voz-de-marca-2026.md", "text/markdown"),
      archivo("metricas-septiembre-instagram.csv", "text/csv"),
    ],
  },
};

export const ImagenYArchivo: Story = {
  name: "Adjuntos · imagen y archivo",
  args: {
    text: "Calendario y una referencia visual",
    files: [imagen(1), archivo("calendario-octubre.json", "application/json")],
  },
};

export const EnEdicionConAdjuntos: Story = {
  name: "Adjuntos · en edición (se quedan igual)",
  args: { canEdit: true, editing: true, files: imagenes(2) },
};
