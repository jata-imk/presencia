import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import type { ChatUIMessage } from "../../lib/chat-types.js";
import { vista, viendo } from "../../stories/fixtures/attachments.js";
import { card, cardPart, CONTENIDO } from "../../stories/fixtures/cards.js";
import { lectura, PAGINAS, texto } from "../../stories/fixtures/web.js";
import { AssistantMessage } from "./AssistantMessage.js";

// F10.11 (ADR-029): una respuesta que vuelve a ver un adjunto que ya no
// viaja completo. Es un paso más de la lista única (F10.10), con la misma
// anatomía que leer una página: sin pase de diseño propio.

function respuesta(parts: unknown[]): ChatUIMessage {
  return { id: "respuesta-adjunto", role: "assistant", parts } as ChatUIMessage;
}

const IG = "card-ig";

const meta = {
  title: "Chat/Respuesta que vuelve a ver un adjunto",
  component: AssistantMessage,
  args: {
    message: respuesta([]),
    chatId: "chat-demo",
    isLast: true,
    streamingNow: false,
    canRegenerate: true,
    onRegenerate: fn(),
  },
  parameters: { cards: [card(IG)] },
  decorators: [
    (Story) => (
      <div className="max-w-[700px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AssistantMessage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Mientras corre: el nombre del archivo, nunca su id. */
export const VolviendoAVer: Story = {
  name: "Volviendo a ver",
  args: { message: respuesta([viendo("fachada.png")]), streamingNow: true, canRegenerate: false },
};

/** Un solo paso: el encabezado es el paso mismo, sin lista que abrir. */
export const VolvioAVer: Story = {
  name: "Volvió a ver",
  args: {
    message: respuesta([
      vista("fachada.png"),
      texto(
        "El cartel chiquito de la esquina dice **«Código: MANGO-47»**, para el segundo frappé. ¿Lo pongo en el post de la promo?",
      ),
    ]),
  },
};

/** Un PDF por páginas; a medias, la marca va al lado. */
export const VolvioAVerPaginas: Story = {
  name: "Volvió a ver unas páginas",
  args: {
    message: respuesta([
      vista("menu.pdf", { paginas: "4", totalPaginas: 6 }),
      vista("catalogo-2026.pdf", { paginas: "1-8", totalPaginas: 40, recortado: true }),
      texto(
        "En tu menú, el pan de cazón está a **$145** (página 4). Del catálogo solo alcancé a ver las primeras 8 páginas: si el precio que buscas está más adelante, dime en qué página viene.",
      ),
    ]),
  },
};

/** Sin rojo: el motivo va en la línea y el modelo lo explica. */
export const NoDisponible: Story = {
  name: "No disponible",
  args: {
    message: respuesta([
      vista("foto-local.png", { estado: "no_encontrado" }),
      vista("menu.pdf", { estado: "pagina_no_disponible", paginas: "9", totalPaginas: 6 }),
      texto(
        "No encontré la foto del local en este chat: puede que se haya quitado al editar un mensaje. Y tu menú tiene 6 páginas, así que no hay página 9. ¿Me mandas la foto otra vez?",
      ),
    ]),
  },
};

/** Al llegar al tope del mensaje, la lista dice qué quedó fuera. */
export const Tope: Story = {
  args: {
    message: respuesta([
      vista("fachada.png"),
      vista("playera.png"),
      vista("pizarron.png"),
      vista("menu.pdf", { estado: "limite" }),
      texto(
        "Ya revisé tres archivos en este mensaje, que es mi tope. Si necesitas el detalle del menú, pídemelo en el siguiente.",
      ),
    ]),
  },
};

/** En la lista única, en orden, con la web y el borrador. */
export const LeeVuelveAVerYCrea: Story = {
  name: "Lee, vuelve a ver y crea un borrador",
  args: {
    message: respuesta([
      lectura(PAGINAS.dy.url, { titulo: PAGINAS.dy.titulo }),
      vista("fachada.png"),
      texto("Con el código del cartel y el precio de la nota te armé el post:"),
      cardPart(IG, "instagram", CONTENIDO.instagram),
    ]),
  },
};
