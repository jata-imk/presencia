import { Copy, Layers, RefreshCw } from "lucide-react";
import { isStaticToolUIPart } from "ai";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { CardToolPart, ChatUIMessage } from "../../lib/chat-types.js";
import { NETWORK_LABELS } from "../../lib/network-labels.js";
import { useMediaQuery } from "../../lib/use-media-query.js";
import { useCardsByIds } from "../../stores/cards-store.js";
import { usePublicationPanelStore } from "../../stores/publication-panel-store.js";
import { CompactCard } from "../cards/CompactCard.js";
import { GlowFrame } from "../cards/GlowFrame.js";
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
      <Steps parts={toolParts} streaming={streaming} />
      {blocks.map((block) =>
        block.kind === "text" ? (
          <MessageAI key={block.index} text={block.text} streaming={block.streaming} />
        ) : (
          <CardBlock key={block.index} parts={block.parts} chatId={chatId} streaming={streaming} />
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

function CardBlock({
  parts,
  chatId,
  streaming,
}: {
  parts: CardToolPart[];
  chatId: string;
  streaming: boolean;
}) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const isMobile = !useMediaQuery("(min-width: 768px)");
  const openPanel = usePublicationPanelStore((s) => s.open);
  const activeId = usePublicationPanelStore((s) => s.activeId);
  const panelChatId = usePublicationPanelStore((s) => s.chatId);

  // Un tool call que nunca terminó (el usuario detuvo el turno, el stream se
  // cortó) no va a terminar ya: su "Generando…" sería una promesa falsa. Se
  // oculta y Steps dice que se detuvo. Los que fallaron sí se quedan, con su
  // error.
  const shown = streaming
    ? parts
    : parts.filter((p) => p.state === "output-available" || p.state === "output-error");
  const ids = shown.flatMap((p) => (p.state === "output-available" ? [p.output.cardId] : []));
  const liveCards = useCardsByIds(ids);
  const idsKey = ids.join(",");

  // Autoapertura (nota de decisiones del diseño): en escritorio el panel se
  // abre solo cuando nace el primer borrador del turno, y suma pestañas
  // mientras nacen las demás. Si el usuario lo cerró en este chat, no se
  // vuelve a abrir solo. Solo mientras el turno llega: abrir un chat viejo
  // no abre nada.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (!streaming || !isDesktop || ids.length === 0) return;
    const panel = usePublicationPanelStore.getState();
    if (panel.dismissedChats.has(chatId)) return;
    if (!autoOpened.current) {
      autoOpened.current = true;
      panel.open(chatId, ids, ids[0]);
    } else if (panel.activeId !== null) {
      panel.addCards(chatId, ids);
    }
    // idsKey resume `ids`: el arreglo es nuevo en cada render.
  }, [streaming, isDesktop, chatId, idsKey]);

  if (shown.length === 0) return null;

  // Glow animado mientras quede algún borrador (decisión de F10.5: el diseño
  // lo quitaba y se conservó, es el lenguaje de estados de presencia-chat.md).
  // Uno solo por contenedor: un glow por fila dentro de un borde se ve ruidoso.
  const anyDraft =
    shown.some((p) => p.state !== "output-available" && p.state !== "output-error") ||
    ids.some((id) => (liveCards.find((c) => c.id === id)?.status ?? "draft") === "draft");

  const rows = shown.map((part, i) => {
    const cardId = part.state === "output-available" ? part.output.cardId : null;
    return (
      <div key={part.toolCallId ?? i} className={i > 0 ? "border-t border-line" : undefined}>
        <CompactCard
          part={part}
          mobile={isMobile}
          open={cardId !== null && panelChatId === chatId && activeId === cardId}
          onOpen={() => {
            if (cardId) openPanel(chatId, ids, cardId);
          }}
        />
      </div>
    );
  });

  // Cuenta lo que existe, no lo que se intentó: un tool call que falló no
  // es un borrador (y así el encabezado coincide con "Creé N" de Steps).
  // Mientras el turno llega, todavía cuentan los que se están creando.
  const networks = parts
    .map((p) => (p.state === "output-available" ? NETWORK_LABELS[p.output.network] : null))
    .filter((n): n is string => n !== null);
  const count = streaming ? parts.length : networks.length;
  const title = `${count} ${count === 1 ? "borrador" : "borradores"}${networks.length > 0 ? ` · ${networks.join(", ")}` : ""}`;

  const body =
    shown.length === 1 ? (
      rows
    ) : (
      <section aria-label={title}>
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5 font-display text-[12.5px] font-semibold text-fg">
          <Layers size={14} strokeWidth={1.75} className="text-fg-muted" aria-hidden="true" />
          {title}
        </div>
        {rows}
      </section>
    );

  return anyDraft ? (
    <GlowFrame radius={12}>{body}</GlowFrame>
  ) : (
    <div className="overflow-hidden rounded-xl border border-line bg-card">{body}</div>
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
