import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isStaticToolUIPart } from "ai";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { ConvHeader } from "../components/chat/ConvHeader.js";
import { Composer } from "../components/chat/Composer.js";
import { PublicationPanel } from "../components/panel/PublicationPanel.js";
import { SelectionBar } from "../components/chat/SelectionBar.js";
import { AssistantMessage } from "../components/chat/AssistantMessage.js";
import { MessageUser } from "../components/chat/MessageUser.js";
import { TypingDots } from "../components/chat/TypingDots.js";
import { QuotaBanner } from "../components/QuotaBanner.js";
import { QuotaExhaustedModal } from "../components/QuotaExhaustedModal.js";
import { ConfirmDeleteModal } from "../components/ui/ConfirmDeleteModal.js";
import { fetchCardVersions } from "../lib/cards-api.js";
import { parseQuotaExhaustedError } from "../lib/chat-error.js";
import type { ChatUIMessage } from "../lib/chat-types.js";
import { useQuota } from "../lib/use-quota.js";
import { useCardsStore } from "../stores/cards-store.js";
import { useChatsStore } from "../stores/chats-store.js";
import { useToastStore } from "../stores/toast-store.js";

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
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // "Adaptar a otra red" del panel (F10.5): precarga el composer y le da el
  // foco — adaptar es pedirle otra card al chat (flujo 1), no un endpoint.
  function prefillComposer(text: string) {
    setInput(text);
    requestAnimationFrame(() => {
      const box = composerRef.current;
      if (!box) return;
      box.focus();
      box.setSelectionRange(text.length, text.length);
    });
  }

  // routes/chats.tsx crea el chat y navega acá con el prompt de la
  // sugerencia/composer grande en el state de router (no en la URL — no es
  // dato para compartir ni para persistir).
  //
  // Hay que mandarlo UNA sola vez, y eso pide dos guardas distintas porque
  // hay dos formas de duplicarlo, y la versión anterior solo cubría una:
  //
  //  - `sentInitialPrompt` cubre los re-renders y el doble efecto de
  //    StrictMode, que corren sobre la MISMA instancia y por eso ven el ref.
  //  - Borrar el state cubre lo otro: volver a entrar a esta URL o recargar.
  //    El ref no sirve ahí (cada mount estrena el suyo) y el prompt sigue
  //    disponible, porque `location.state` vive en el `history.state` del
  //    navegador y SÍ sobrevive a un refresh. Incidente 2026-09-06: una sola
  //    acción del usuario terminó creando tres pares de borradores, uno por
  //    cada vez que se volvió a abrir el chat.
  //
  // Se consume con `replace` ANTES de mandar: la entrada del historial deja
  // de tener prompt, así que ya no hay nada que reenviar aunque se recargue
  // a mitad del stream.
  const location = useLocation();
  const navigate = useNavigate();
  const initialPrompt = (location.state as { initialPrompt?: string } | null)?.initialPrompt;
  const sentInitialPrompt = useRef(false);
  useEffect(() => {
    if (!initialPrompt || sentInitialPrompt.current) return;
    sentInitialPrompt.current = true;
    void navigate(location.pathname, { replace: true, state: null });
    void sendMessage({ text: initialPrompt });
  }, []);

  // F5: % de cuota + traducción a publicaciones, nunca un número crudo de
  // créditos (addendum ADR-012). Se refresca al terminar cada turno —
  // charge() en la API ya cobró el turno para cuando el stream cierra.
  const { quota, refresh: refreshQuota } = useQuota();
  // F6: estado vivo de las cards (cards-store, PR4) — el tool part
  // persistido solo sabe cómo nació la card, nunca se actualiza solo.
  const loadChatCards = useCardsStore((s) => s.loadChat);
  const setOpenChat = useCardsStore((s) => s.setOpenChat);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [modalDismissed, setModalDismissed] = useState(false);

  // Título real de la conversación: chats-store lo comparte con el Sidebar
  // (F6 PR5) — si el Sidebar ya lo cargó no hay segundo fetch; si no,
  // refreshChats() (idempotente) lo trae.
  const chats = useChatsStore((s) => s.chats);
  const refreshChats = useChatsStore((s) => s.refresh);
  const renameChat = useChatsStore((s) => s.rename);
  const currentChat = chats?.find((c) => c.id === chatId);
  const chatTitle = currentChat?.title ?? "Conversación";
  const chatFolderId = currentChat?.folderId ?? null;

  // Cards y chats en efectos separados: juntos, cada cambio de identidad de
  // `chats` (renombrar, fijar, archivar desde el sidebar) volvía a pedir las
  // cards del chat sin que nada de ellas hubiera cambiado.
  useEffect(() => {
    void loadChatCards(chatId);
    // `revalidate` solo recarga el chat en pantalla, no todos los visitados.
    setOpenChat(chatId);
    return () => setOpenChat(null);
  }, [chatId, loadChatCards, setOpenChat]);
  useEffect(() => {
    if (!chats) void refreshChats();
  }, [refreshChats, chats]);
  useEffect(() => {
    if (status === "ready") {
      refreshQuota();
      void loadChatCards(chatId);
    }
  }, [status, chatId, refreshQuota, loadChatCards]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);
  const quotaExhaustedError = parseQuotaExhaustedError(error);

  // Regenerar borra las cards de la respuesta (ADR-006). Desde F10.5 una
  // card puede traer trabajo del usuario encima (ediciones, versiones):
  // antes de tirarlo, se pregunta. Y una que ya salió a la red no se toca
  // (la API también lo impide): borrarla dejaría un post programado sin card.
  const toast = useToastStore((s) => s.show);
  const [regenerateEdited, setRegenerateEdited] = useState<number | null>(null);
  async function requestRegenerate() {
    const last = messages.at(-1);
    const ids =
      last?.role === "assistant"
        ? last.parts.flatMap((p) =>
            isStaticToolUIPart(p) && p.state === "output-available" ? [p.output.cardId] : [],
          )
        : [];
    const byId = useCardsStore.getState().byId;
    if (ids.some((id) => byId[id]?.status === "scheduled" || byId[id]?.status === "published")) {
      toast({
        title: "No se puede regenerar esta respuesta",
        description:
          "Tiene publicaciones programadas o publicadas. Cancela la programación antes de regenerarla.",
      });
      return;
    }
    const edited = await Promise.all(
      ids.map((id) =>
        fetchCardVersions(id)
          .then((list) => list.length > 1)
          .catch(() => false),
      ),
    );
    const count = edited.filter(Boolean).length;
    if (count > 0) setRegenerateEdited(count);
    else void regenerate();
  }

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
    // El panel de publicación (F10.5) es hermano del chat: en escritorio lo
    // empuja, abajo de 1024 se superpone dentro de esta misma caja (relative).
    <div className="relative flex h-full">
      <div className="relative flex h-full min-w-0 flex-1 flex-col">
        <SelectionBar chatId={chatId} />
        <ConvHeader
          chatId={chatId}
          title={chatTitle}
          folderId={chatFolderId}
          onRename={async (title) => {
            await renameChat(chatId, title);
          }}
        />

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-[732px] flex-col gap-5 px-4 py-6">
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
                <AssistantMessage
                  key={message.id}
                  message={message}
                  chatId={chatId}
                  isLast={isLastMessage}
                  streamingNow={status === "streaming"}
                  canRegenerate={isLastMessage && !busy}
                  onRegenerate={() => void requestRegenerate()}
                />
              );
            })}
            {showTyping && <TypingDots />}
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
          <div className="mx-auto flex max-w-[752px] flex-col gap-2">
            {quota && !bannerDismissed && (
              <QuotaBanner quota={quota} onDismiss={() => setBannerDismissed(true)} />
            )}
            {regenerateEdited !== null && (
              <ConfirmDeleteModal
                titleId="regenerar-titulo"
                title="¿Regenerar la respuesta?"
                description={
                  regenerateEdited === 1
                    ? "Uno de sus borradores tiene ediciones tuyas."
                    : `${String(regenerateEdited)} de sus borradores tienen ediciones tuyas.`
                }
                warning="Regenerar borra los borradores de esta respuesta, con sus versiones, y crea otros nuevos."
                confirmLabel="Regenerar"
                confirmingLabel="Regenerando…"
                errorFallback="No se pudo regenerar."
                onClose={() => setRegenerateEdited(null)}
                onConfirm={async () => {
                  await regenerate();
                }}
                onConfirmed={() => setRegenerateEdited(null)}
              />
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
              inputRef={composerRef}
            />
          </div>
        </div>
      </div>
      <PublicationPanel chatId={chatId} onAdapt={prefillComposer} />
    </div>
  );
}
