import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isStaticToolUIPart } from "ai";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "react-router";
import { ConvHeader } from "../components/chat/ConvHeader.js";
import { Composer } from "../components/chat/Composer.js";
import { MessageAI } from "../components/chat/MessageAI.js";
import { MessageUser } from "../components/chat/MessageUser.js";
import { PresenciaAvatar } from "../components/chat/PresenciaAvatar.js";
import { TypingDots } from "../components/chat/TypingDots.js";
import { PublicationCard } from "../components/PublicationCard.js";
import { QuotaBanner } from "../components/QuotaBanner.js";
import { QuotaExhaustedModal } from "../components/QuotaExhaustedModal.js";
import { parseQuotaExhaustedError } from "../lib/chat-error.js";
import type { ChatUIMessage } from "../lib/chat-types.js";
import { useQuota } from "../lib/use-quota.js";
import { useCardsStore } from "../stores/cards-store.js";
import { useChatsStore } from "../stores/chats-store.js";

export function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const [initialMessages, setInitialMessages] = useState<ChatUIMessage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setInitialMessages(null);
    setLoadError(null);
    fetch(`/api/chats/${id}/messages`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setInitialMessages((await res.json()) as ChatUIMessage[]);
      })
      .catch(() => setLoadError("No se pudo cargar el chat."));
  }, [id]);

  if (loadError) {
    return (
      <main className="flex h-full flex-col items-center justify-center gap-3 p-8">
        <p className="text-sm text-error">{loadError}</p>
        <Link to="/chats" className="text-sm underline">
          Volver a tus chats
        </Link>
      </main>
    );
  }
  if (!id || initialMessages === null) {
    return <main className="p-8 text-sm text-fg-muted">Cargando…</main>;
  }
  return <ChatView key={id} chatId={id} initialMessages={initialMessages} />;
}

function ChatView({
  chatId,
  initialMessages,
}: {
  chatId: string;
  initialMessages: ChatUIMessage[];
}) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, regenerate, stop, status, error } = useChat<ChatUIMessage>({
    id: chatId,
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: `/api/chats/${chatId}/stream` }),
  });
  const busy = status === "submitted" || status === "streaming";
  const bottomRef = useRef<HTMLDivElement>(null);

  // routes/chats.tsx crea el chat y navega acá con el prompt de la
  // sugerencia/composer grande en el state de router (no en la URL — no es
  // dato para compartir ni para persistir). Se manda una sola vez: el
  // guard de ref sobrevive los re-renders de este mount, y location.state
  // no sobrevive un refresh duro del navegador, así que no hay riesgo de
  // reenvío accidental.
  const location = useLocation();
  const initialPrompt = (location.state as { initialPrompt?: string } | null)?.initialPrompt;
  const sentInitialPrompt = useRef(false);
  useEffect(() => {
    if (!initialPrompt || sentInitialPrompt.current) return;
    sentInitialPrompt.current = true;
    void sendMessage({ text: initialPrompt });
  }, []);

  // F5: % de cuota + traducción a publicaciones, nunca un número crudo de
  // créditos (addendum ADR-012). Se refresca al terminar cada turno —
  // charge() en la API ya cobró el turno para cuando el stream cierra.
  const { quota, refresh: refreshQuota } = useQuota();
  // F6: estado vivo de las cards (cards-store, PR4) — el tool part
  // persistido solo sabe cómo nació la card, nunca se actualiza solo.
  const refreshCards = useCardsStore((s) => s.refresh);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [modalDismissed, setModalDismissed] = useState(false);

  // Título real de la conversación: chats-store lo comparte con el Sidebar
  // (F6 PR5) — si el Sidebar ya lo cargó no hay segundo fetch; si no,
  // refreshChats() (idempotente) lo trae.
  const chats = useChatsStore((s) => s.chats);
  const refreshChats = useChatsStore((s) => s.refresh);
  const renameChat = useChatsStore((s) => s.rename);
  const chatTitle = chats?.find((c) => c.id === chatId)?.title ?? "Conversación";

  useEffect(() => {
    void refreshCards(chatId);
    if (!chats) void refreshChats();
  }, [chatId, refreshCards, refreshChats, chats]);
  useEffect(() => {
    if (status === "ready") {
      refreshQuota();
      void refreshCards(chatId);
    }
  }, [status, chatId, refreshQuota, refreshCards]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);
  const quotaExhaustedError = parseQuotaExhaustedError(error);

  function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setModalDismissed(false);
    void sendMessage({ text });
  }

  const lastMessage = messages.at(-1);
  const showTyping = status === "submitted" && (!lastMessage || lastMessage.role !== "assistant");

  return (
    <div className="flex h-full flex-col">
      <ConvHeader
        title={chatTitle}
        onRename={async (title) => {
          await renameChat(chatId, title);
        }}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[820px] flex-col gap-[18px] px-4 py-5">
          {messages.map((message, mi) => {
            const isLastMessage = mi === messages.length - 1;
            if (message.role === "user") {
              return (
                <div key={message.id} className="flex flex-col gap-[18px]">
                  {message.parts.map((part, i) =>
                    part.type === "text" ? <MessageUser key={i} text={part.text} /> : null,
                  )}
                </div>
              );
            }
            return (
              <div key={message.id} className="flex flex-col gap-[18px]">
                {message.parts.map((part, i) => {
                  const isLastPart = isLastMessage && i === message.parts.length - 1;
                  if (part.type === "text") {
                    const streaming =
                      status === "streaming" && isLastPart && part.state === "streaming";
                    return (
                      <MessageAI
                        key={i}
                        text={part.text}
                        streaming={streaming}
                        canRegenerate={isLastMessage && !busy}
                        onRegenerate={() => void regenerate()}
                      />
                    );
                  }
                  if (part.type === "step-start") return null;
                  if (isStaticToolUIPart(part)) {
                    return (
                      <div key={i} className="flex items-start gap-2.5">
                        <PresenciaAvatar size={28} />
                        <div className="max-w-[95%] min-w-0 flex-1 sm:max-w-[82%]">
                          <PublicationCard part={part} chatId={chatId} />
                        </div>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            );
          })}
          {showTyping && (
            <div className="flex items-start gap-2.5">
              <PresenciaAvatar size={28} />
              <div className="rounded-[3px_12px_12px_12px] border border-line bg-card px-[15px] py-3 shadow-xs">
                <TypingDots />
              </div>
            </div>
          )}
          {error && !quotaExhaustedError && (
            <p className="flex items-center gap-2 text-sm text-error">
              Algo salió mal generando la respuesta.
              <button type="button" className="underline" onClick={() => void regenerate()}>
                Reintentar
              </button>
            </p>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="shrink-0 px-4 pb-4">
        <div className="mx-auto flex max-w-[820px] flex-col gap-2">
          {quota && !bannerDismissed && (
            <QuotaBanner quota={quota} onDismiss={() => setBannerDismissed(true)} />
          )}
          {quotaExhaustedError && !modalDismissed && (
            <QuotaExhaustedModal
              quota={quotaExhaustedError}
              onDismiss={() => setModalDismissed(true)}
            />
          )}
          <Composer
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            busy={busy}
            onStop={() => void stop()}
          />
        </div>
      </div>
    </div>
  );
}
