import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import {
  card,
  cardPart,
  cardPartConError,
  cardPartNaciendo,
  CONTENIDO,
  IMAGEN_DEMO,
} from "../../stories/fixtures/cards.js";
import { BornCard, CompactCard } from "./CompactCard.js";

// La card del chat en cada estado. Lee la card viva del store (sembrada con
// `parameters.cards` en el preview) y pide /api/images/config y la sesión,
// que el preview responde con datos de ejemplo.

const ID = "card-demo";
const CON_IMAGEN = { ...CONTENIDO.instagram, assetIds: [IMAGEN_DEMO] };

const meta = {
  title: "Cards/Card compacta",
  component: CompactCard,
  args: {
    part: cardPart(ID, "instagram", CONTENIDO.instagram),
    open: false,
    mobile: false,
    onOpen: fn(),
  },
  parameters: { cards: [card(ID)] },
  decorators: [
    (Story) => (
      <div className="max-w-[640px] overflow-hidden rounded-xl border border-line bg-card">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CompactCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Borrador: Story = {};

export const BorradorConImagen: Story = {
  args: { part: cardPart(ID, "instagram", CON_IMAGEN) },
  parameters: { cards: [card(ID, { content: CON_IMAGEN })] },
};

export const Carrusel: Story = {
  args: { part: cardPart(ID, "instagram", CON_IMAGEN) },
  parameters: {
    cards: [
      card(ID, {
        content: {
          ...CON_IMAGEN,
          assetIds: [IMAGEN_DEMO, IMAGEN_DEMO, IMAGEN_DEMO],
          slides: [
            { id: "a1b2c3d4-0000-4000-8000-000000000001", assetId: IMAGEN_DEMO },
            { id: "a1b2c3d4-0000-4000-8000-000000000002", assetId: IMAGEN_DEMO },
            { id: "a1b2c3d4-0000-4000-8000-000000000003", assetId: IMAGEN_DEMO },
          ],
        },
      }),
    ],
  },
};

export const GenerandoImagen: Story = {
  name: "Generando imagen",
  parameters: {
    cards: [
      card(ID, {
        imageJob: {
          id: "job-demo",
          status: "generating",
          kind: "generate",
          aspectRatio: "4:5",
          assetIds: [],
          // En el futuro a propósito: pasados 5 min (IMAGE_JOB_STALE_MS) la
          // card da un trabajo por muerto, y la historia queda abierta horas.
          startedAt: "2099-01-01T00:00:00.000Z",
        },
      }),
    ],
  },
};

export const Programada: Story = {
  parameters: {
    cards: [
      card(ID, {
        status: "scheduled",
        scheduledAt: "2026-10-14T20:00:00.000Z",
        content: CON_IMAGEN,
      }),
    ],
  },
  args: { part: cardPart(ID, "instagram", CON_IMAGEN) },
};

export const Publicada: Story = {
  parameters: {
    cards: [
      card(ID, {
        status: "published",
        publishedAt: "2026-10-10T18:00:00.000Z",
        content: CON_IMAGEN,
      }),
    ],
  },
  args: { part: cardPart(ID, "instagram", CON_IMAGEN) },
};

export const Fallida: Story = {
  parameters: {
    cards: [
      card(ID, {
        status: "failed",
        errorMessage: "La sesión de tu cuenta de Instagram expiró. Reconéctala para reintentar.",
      }),
    ],
  },
};

export const TextoLinkedIn: Story = {
  name: "Texto (LinkedIn)",
  args: { part: cardPart(ID, "linkedin", CONTENIDO.linkedin) },
  parameters: { cards: [card(ID, { network: "linkedin", content: CONTENIDO.linkedin })] },
};

export const GuionTikTok: Story = {
  name: "Guion (TikTok)",
  args: { part: cardPart(ID, "tiktok", CONTENIDO.tiktok) },
  parameters: { cards: [card(ID, { network: "tiktok", content: CONTENIDO.tiktok })] },
};

export const AbiertaEnElPanel: Story = {
  name: "Abierta en el panel",
  args: { open: true },
};

export const EnSeleccion: Story = {
  name: "En selección",
  args: { selection: { selected: true, active: true, onToggle: fn() } },
};

export const Movil: Story = {
  name: "Móvil",
  args: { mobile: true },
};

export const Naciendo: Story = {
  args: { part: cardPartNaciendo("instagram") },
  parameters: { cards: [] },
};

export const ErrorDeLaTool: Story = {
  name: "Error de la tool",
  args: { part: cardPartConError() },
  parameters: { cards: [] },
};

/** El hueco de una card que el modelo todavía está escribiendo. */
export const NaciendoSinRed: Story = {
  name: "Naciendo (sin red todavía)",
  render: () => <BornCard network={null} />,
};
