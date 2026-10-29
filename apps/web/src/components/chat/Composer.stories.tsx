import { MAX_MESSAGE_CHARS } from "@presencia/shared";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { fn, userEvent, within } from "storybook/test";
import { PEDIDO } from "../../stories/fixtures/chat.js";
import {
  CAPTURA,
  DIEZ,
  ESCANEADO,
  ESCANEADO_LARGO,
  TRES_LARGOS,
  GUIA_MD,
  IMAGEN,
  KIT_PDF,
  LARGO,
  METRICAS_CSV,
  MUY_GRANDE,
  SIN_RED,
  TIPO_NO,
  subiendo,
} from "../../stories/fixtures/attachments.js";
import type { PendingAttachment } from "../../lib/attachments/attachments.js";
import { Composer } from "./Composer.js";

const meta = {
  title: "Chat/Composer",
  component: Composer,
  args: {
    value: "",
    onChange: fn(),
    onSubmit: fn(),
    onStop: fn(),
    busy: false,
  },
  // El texto vive en los args: escribir en la caja lo actualiza, y cambiar el
  // control "value" del panel llega a la caja (con un useState local, solo se
  // leía al montar).
  render: function Render(args) {
    const [, updateArgs] = useArgs<typeof args>();
    return (
      <div className="max-w-[752px] pt-12">
        <Composer
          {...args}
          onChange={(next) => {
            updateArgs({ value: next });
            args.onChange(next);
          }}
        />
      </div>
    );
  },
} satisfies Meta<typeof Composer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Vacio: Story = { name: "Vacío" };

export const ConTexto: Story = { args: { value: PEDIDO } };

export const CercaDelTope: Story = {
  name: "Cerca del tope (contador)",
  args: { value: "a".repeat(Math.floor(MAX_MESSAGE_CHARS * 0.95)) },
};

export const PasadoDelTope: Story = {
  name: "Pasado del tope",
  args: { value: "a".repeat(MAX_MESSAGE_CHARS + 1) },
};

export const Ocupado: Story = {
  name: "Ocupado (Detener generación)",
  args: { busy: true },
};

export const Grande: Story = {
  name: "Grande (nuevo chat)",
  args: { large: true, placeholder: "¿Qué quieres publicar hoy?" },
};

// F10.9: los adjuntos (Claude Design "Chat Adjuntos" §1-2). Los chips se pintan
// con estados fijos: subir de verdad necesita la API.
const conAdjuntos = (items: PendingAttachment[], value = "") => ({
  value,
  attachments: { items, onAdd: fn(), onRemove: fn(), onRetry: fn() },
});

/**
 * El ＋ abierto: subir archivos y, deshabilitado con "Pronto", lo que todavía
 * no tiene backend. El menú va en un portal: "Lado a lado" no lo pinta en los
 * dos temas (ver preview.tsx), cada tema se revisa con su opción de la barra.
 */
export const MenuAgregar: Story = {
  name: "Menú ＋ abierto",
  args: { ...conAdjuntos([]), webSearch: { on: false, onChange: fn() } },
  render: (args) => (
    <div className="max-w-[752px] pt-48">
      <Composer {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    // AllBy…[0]: "Lado a lado" pinta la historia dos veces.
    const [trigger] = await within(canvasElement).findAllByLabelText("Agregar archivos y más");
    if (trigger) await userEvent.click(trigger);
  },
};

/**
 * F10.10 (Chat Web.html → ComposerConChip): "Buscar en la web" activado. El
 * chip obliga a buscar en este mensaje y se va al enviar.
 */
export const ComposerConChip: Story = {
  name: "Buscar en la web (chip)",
  args: {
    ...conAdjuntos([]),
    value: "¿Qué horario tiene hoy el Gran Museo del Mundo Maya?",
    webSearch: { on: true, onChange: fn() },
  },
};

/** El chip junto a adjuntos ya puestos, en la caja vacía. */
export const ChipConAdjuntos: Story = {
  name: "Buscar en la web con adjuntos",
  args: { ...conAdjuntos([IMAGEN, KIT_PDF]), webSearch: { on: true, onChange: fn() } },
};

export const AdjuntosSubiendo: Story = {
  name: "Adjuntos · subiendo (envío en espera)",
  args: conAdjuntos(
    [subiendo(IMAGEN, 64), GUIA_MD, subiendo(KIT_PDF, 22)],
    "Usa esto para el carrusel",
  ),
};

export const AdjuntosSinTexto: Story = {
  name: "Adjuntos · listos, sin texto",
  args: conAdjuntos([IMAGEN, CAPTURA, METRICAS_CSV]),
};

export const AdjuntosConErrores: Story = {
  name: "Adjuntos · errores",
  args: conAdjuntos([IMAGEN, MUY_GRANDE, TIPO_NO, SIN_RED], "Revisa estos archivos"),
};

export const AdjuntosDemasiadoLargos: Story = {
  name: "Adjuntos · juntos pasan del presupuesto (bloquea)",
  args: conAdjuntos(TRES_LARGOS, "Compárame los tres trimestres"),
};

export const AdjuntosAvisosPdf: Story = {
  name: "Adjuntos · avisos de PDF (no bloquean)",
  args: conAdjuntos([ESCANEADO, LARGO], "Resúmeme estos dos documentos"),
};

export const AdjuntosPdfEscaneadoLargo: Story = {
  name: "Adjuntos · PDF escaneado de más (bloquea)",
  args: conAdjuntos([IMAGEN, ESCANEADO_LARGO], "Saca los gastos de este año"),
};

export const AdjuntosDiez: Story = {
  name: "Adjuntos · 10 de 10 (límite)",
  args: conAdjuntos(DIEZ, "Todo lo de la campaña de octubre"),
};
