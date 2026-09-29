import { Copy, Layers, RefreshCw } from "lucide-react";
import { isStaticToolUIPart } from "ai";
import { useState, type ReactNode } from "react";
import type { CardToolPart, ChatUIMessage } from "../../lib/chat-types.js";
import { NETWORK_LABELS } from "../../lib/network-labels.js";
import { PublicationCard } from "../PublicationCard.js";
import { MessageAI } from "./MessageAI.js";
import { Steps } from "./Steps.js";

// Una respuesta completa de Presencia (F10.5, Chat Rediseño.html → AIMsg):
// arriba la línea de pasos, luego el texto y las cards en el orden en que
// llegaron, y al pie las acciones en hover. Las cards que llegan seguidas se
// juntan bajo un encabezado ("3 borradores · Instagram, LinkedIn, X"): es la
// unidad que el usuario pidió en un solo mensaje.
//
// Sin pulgares arriba/abajo: el diseño los muestra, pero no hay dónde
// guardar ese feedback — un botón que no guarda nada sería una mentira.

type Block =
  | { kind: "text"; index: number; text: string; streaming: boolean }
  | { kind: "cards"; index: number; parts: CardToolPart[] };

export function AssistantMessage({
  message,
  chatId,
  isLast,
  streamingNow,
  canRegenerate,
  onRegenerate,
}: {
  message: ChatUIMessage;
  chatId: string;
  isLast: boolean;
  /** El turno sigue llegando (status === "streaming"). */
  streamingNow: boolean;
  canRegenerate: boolean;
  onRegenerate: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const blocks: Block[] = [];
  const toolParts: CardToolPart[] = [];
  message.parts.forEach((part, i) => {
    const isLastPart = isLast && i === message.parts.length - 1;
    if (part.type === "text") {
      blocks.push({
        kind: "text",
        index: i,
        text: part.text,
        streaming: streamingNow && isLastPart && part.state === "streaming",
      });
      return;
    }
    if (isStaticToolUIPart(part)) {
      toolParts.push(part);
      const prev = blocks.at(-1);
      if (prev?.kind === "cards") prev.parts.push(part);
      else blocks.push({ kind: "cards", index: i, parts: [part] });
    }
  });

  const fullText = blocks
    .filter((b): b is Extract<Block, { kind: "text" }> => b.kind === "text")
    .map((b) => b.text)
    .join("\n\n")
    .trim();
  const streaming = isLast && streamingNow;

  function handleCopy() {
    void navigator.clipboard.writeText(fullText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="group/msg flex flex-col gap-3">
      <Steps parts={toolParts} />
      {blocks.map((block) =>
        block.kind === "text" ? (
          <MessageAI key={block.index} text={block.text} streaming={block.streaming} />
        ) : (
          <CardBlock key={block.index} parts={block.parts} chatId={chatId} />
        ),
      )}
      {!streaming && (fullText || canRegenerate) && (
        // Siempre montado y con su alto reservado: aparecer en hover no
        // empuja lo de abajo. En pantallas táctiles (sin hover) se ve siempre.
        <div className="-mt-1 flex h-7 gap-0.5 opacity-100 transition-opacity pointer-fine:opacity-0 pointer-fine:group-focus-within/msg:opacity-100 pointer-fine:group-hover/msg:opacity-100">
          {fullText && (
            <ActionButton label={copied ? "Copiado" : "Copiar respuesta"} onClick={handleCopy}>
              <Copy size={14} strokeWidth={1.75} />
            </ActionButton>
          )}
          {canRegenerate && (
            <ActionButton label="Regenerar respuesta" onClick={onRegenerate}>
              <RefreshCw size={14} strokeWidth={1.75} />
            </ActionButton>
          )}
        </div>
      )}
    </div>
  );
}

function CardBlock({ parts, chatId }: { parts: CardToolPart[]; chatId: string }) {
  const cards = parts.map((part, i) => (
    <div key={part.toolCallId ?? i} className="w-full sm:max-w-[82%]">
      <PublicationCard part={part} chatId={chatId} />
    </div>
  ));
  if (parts.length === 1) return <>{cards}</>;

  const networks = parts
    .map((p) => (p.state === "output-available" ? NETWORK_LABELS[p.output.network] : null))
    .filter((n): n is string => n !== null);
  const title = `${parts.length} borradores${networks.length > 0 ? ` · ${networks.join(", ")}` : ""}`;

  return (
    <section aria-label={title} className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 font-display text-[12.5px] font-semibold text-fg-secondary">
        <Layers size={14} strokeWidth={1.75} className="text-fg-muted" aria-hidden="true" />
        {title}
      </div>
      {cards}
    </section>
  );
}

function ActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface hover:text-fg"
    >
      {children}
    </button>
  );
}
