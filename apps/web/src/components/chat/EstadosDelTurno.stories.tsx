import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { fn } from "storybook/test";
import type { TurnNotice } from "../../lib/turn-status.js";
import { notice, PEDIDO, RESPUESTA, RESPUESTA_PARCIAL } from "../../stories/fixtures/chat.js";
import { MessageAI } from "./MessageAI.js";
import { MessageUser } from "./MessageUser.js";
import { TurnStatusCard } from "./TurnStatusCard.js";

// Todos los estados del turno en una conversación, de un vistazo (F10.8.3).
// Misma columna y mismos espacios que routes/chat.tsx: los componentes son
// los reales, sin la parte que necesita stores ni API (las cards).

// Con nombre y a nivel de módulo: así los clics quedan en el panel "Actions".
const reintentar = fn().mockName("Reintentar");
const editar = fn().mockName("Editar mensaje");

function Turno({
  pedido,
  respuesta,
  estado,
  ultimo = false,
  apiError = null,
  failedAgain = false,
}: {
  pedido: string;
  respuesta?: string;
  estado?: TurnNotice;
  ultimo?: boolean;
  apiError?: string | null;
  failedAgain?: boolean;
}) {
  const card = estado && (
    <TurnStatusCard
      notice={estado}
      failedAgain={failedAgain}
      apiError={apiError}
      onRetry={reintentar}
      onEdit={estado.actionable ? editar : undefined}
    />
  );
  return (
    <>
      <div className="flex flex-col gap-[18px]">
        <MessageUser text={pedido} canEdit={ultimo} onEdit={editar} />
        {respuesta === undefined && card}
      </div>
      {respuesta !== undefined && (
        <div className="flex flex-col gap-3">
          {respuesta && <MessageAI text={respuesta} streaming={false} />}
          {card}
        </div>
      )}
    </>
  );
}

function Columna({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex max-w-[732px] flex-col gap-5 py-6">{children}</div>;
}

const meta = {
  title: "Chat/Conversación · Estados del turno",
  // Sin el acento ni el "·" en la URL.
  id: "chat-conversacion",
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="px-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Turnos viejos (sin acciones) y, al final, un turno completo. */
export const Historial: Story = {
  render: () => (
    <Columna>
      <Turno
        pedido="Escríbeme 900 palabras sobre la jarana yucateca. Solo texto."
        respuesta=""
        estado={notice({ actionable: false, hasReply: true })}
      />
      <Turno
        pedido={PEDIDO}
        respuesta={RESPUESTA_PARCIAL}
        estado={notice({ actionable: false, hasReply: true, partial: true })}
      />
      <Turno
        pedido="¿Qué es el relleno negro? En dos líneas."
        estado={notice({ status: "failed", actionable: false })}
      />
      <Turno pedido="Ahora sí, hazme el post de marquesitas." respuesta={RESPUESTA} ultimo />
    </Columna>
  ),
};

export const UltimoDetenidoAntesDeEmpezar: Story = {
  name: "Último: detenida antes de empezar",
  render: () => (
    <Columna>
      <Turno pedido={PEDIDO} respuesta="" estado={notice({ hasReply: true })} ultimo />
    </Columna>
  ),
};

export const UltimoDetenidoConTexto: Story = {
  name: "Último: detenida con texto",
  render: () => (
    <Columna>
      <Turno
        pedido={PEDIDO}
        respuesta={RESPUESTA_PARCIAL}
        estado={notice({ hasReply: true, partial: true })}
        ultimo
      />
    </Columna>
  ),
};

export const UltimoFallo: Story = {
  name: "Último: falló",
  render: () => (
    <Columna>
      <Turno pedido={PEDIDO} estado={notice({ status: "failed" })} ultimo />
    </Columna>
  ),
};

export const UltimoFalloOtraVez: Story = {
  name: "Último: falló otra vez",
  render: () => (
    <Columna>
      <Turno pedido={PEDIDO} estado={notice({ status: "failed" })} failedAgain ultimo />
    </Columna>
  ),
};

export const UltimoRechazado: Story = {
  name: "Último: rechazo con motivo",
  render: () => (
    <Columna>
      <Turno
        pedido={PEDIDO}
        estado={notice({ status: "failed" })}
        apiError="Tu mensaje es demasiado largo. El máximo es de 50,000 caracteres."
        ultimo
      />
    </Columna>
  ),
};
