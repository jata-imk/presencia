import { Copy, History, Layers, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  isCardToolPart,
  isMemoryToolPart,
  type CardToolPart,
  type ChatUIMessage,
  type MemoryToolPart,
} from "../../lib/chat-types.js";
import { NETWORK_LABELS } from "../../lib/network-labels.js";
import { useMediaQuery } from "../../lib/use-media-query.js";
import { useCardSelectionStore, useSelectedIds } from "../../stores/card-selection-store.js";
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
  const memoryParts: MemoryToolPart[] = [];
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
    if (isMemoryToolPart(part)) {
      memoryParts.push(part);
      return;
    }
    if (isCardToolPart(part)) {
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
  // Un turno con texto entre sus cards se parte en varios bloques; solo el
  // primero abre el panel, los demás suman pestañas (ver CardBlock).
  const firstCardsIndex = blocks.find((b) => b.kind === "cards")?.index;

  function handleCopy() {
    void navigator.clipboard.writeText(fullText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="group/msg flex flex-col gap-3">
      <MemoryNote parts={memoryParts} streaming={streaming} />
      <Steps parts={toolParts} streaming={streaming} />
      {blocks.map((block) =>
        block.kind === "text" ? (
          <MessageAI key={block.index} text={block.text} streaming={block.streaming} />
        ) : (
          <CardBlock
            key={block.index}
            parts={block.parts}
            chatId={chatId}
            streaming={streaming}
            leadsTurn={block.index === firstCardsIndex}
          />
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
  leadsTurn,
}: {
  parts: CardToolPart[];
  chatId: string;
  streaming: boolean;
  /** El primer bloque de cards del turno: el único que abre el panel. */
  leadsTurn: boolean;
}) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const isMobile = !useMediaQuery("(min-width: 768px)");
  const openPanel = usePublicationPanelStore((s) => s.open);
  const activeId = usePublicationPanelStore((s) => s.activeId);
  const panelChatId = usePublicationPanelStore((s) => s.chatId);
  const selected = useSelectedIds(chatId);
  const toggleSelected = useCardSelectionStore((s) => s.toggle);
  const selectMany = useCardSelectionStore((s) => s.selectMany);
  const selecting = selected.length > 0;

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
    if (leadsTurn && !autoOpened.current) {
      autoOpened.current = true;
      panel.open(chatId, ids, ids[0]);
    } else if (panel.activeId !== null) {
      panel.addCards(chatId, ids);
    }
    // idsKey resume `ids`: el arreglo es nuevo en cada render.
  }, [streaming, isDesktop, chatId, idsKey, leadsTurn]);

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
          selection={
            cardId && !streaming
              ? {
                  selected: selected.includes(cardId),
                  active: selecting,
                  onToggle: () => toggleSelected(chatId, cardId),
                }
              : undefined
          }
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
          <span className="flex-1">{title}</span>
          {!streaming && ids.length > 0 && (
            <button
              type="button"
              onClick={() => selectMany(chatId, selectableIds(ids, liveCards))}
              className="rounded-md px-2 py-1 text-xs font-semibold text-fg-secondary hover:bg-surface"
            >
              Seleccionar
            </button>
          )}
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

/** Lo que se puede seleccionar: lo publicado o cancelado ya no se programa. */
function selectableIds(ids: string[], cards: { id: string; status: string }[]): string[] {
  return ids.filter((id) => {
    const status = cards.find((c) => c.id === id)?.status ?? "draft";
    return status !== "published" && status !== "canceled";
  });
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

/**
 * F10.8: la búsqueda en la memoria entre chats, en una línea discreta. El
 * creator ve que Presencia recordó algo de otra conversación (y de cuál),
 * en vez de que el dato aparezca sin explicación.
 */
function MemoryNote({ parts, streaming }: { parts: MemoryToolPart[]; streaming: boolean }) {
  if (parts.length === 0) return null;
  const done = parts.filter((p) => p.state === "output-available");
  // Una búsqueda que falló (input inválido, output-error) ya terminó: no se
  // queda en "Buscando…" mientras el modelo sigue escribiendo.
  const pending = parts.some((p) => p.state === "input-streaming" || p.state === "input-available");
  const hits = done.flatMap((p) => p.output.resultados);
  const chats = [...new Set(hits.map((h) => h.chat))];
  const label =
    pending && streaming
      ? "Buscando en tus chats anteriores…"
      : done.length === 0
        ? "No pude buscar en tus chats anteriores"
        : chats.length === 0
          ? "Busqué en tus chats anteriores, sin coincidencias"
          : chats.length === 1
            ? `Recordé lo que hablamos en «${chats[0]!}»`
            : `Recordé lo que hablamos en ${String(chats.length)} chats anteriores`;
  return (
    <div className="flex items-center gap-1.5 text-[13px] text-fg-muted">
      <History size={14} strokeWidth={1.75} aria-hidden />
      <span className="min-w-0 truncate">{label}</span>
    </div>
  );
}
