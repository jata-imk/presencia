import { useChat } from "@ai-sdk/react";
import { ArrowDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { Composer } from "../components/chat/Composer.js";
import { PublicationPanel } from "../components/panel/PublicationPanel.js";
import { SelectionBar } from "../components/chat/SelectionBar.js";
import { AssistantMessage } from "../components/chat/AssistantMessage.js";
import { MessageUser } from "../components/chat/MessageUser.js";
import { TurnStatusCard } from "../components/chat/TurnStatusCard.js";
import { TypingDots } from "../components/chat/TypingDots.js";
import { QuotaBanner } from "../components/QuotaBanner.js";
import { chatTransport } from "../lib/chat-transport.js";
import { QuotaExhaustedModal } from "../components/QuotaExhaustedModal.js";
import { ConfirmDeleteModal } from "../components/ui/ConfirmDeleteModal.js";
import { fetchCardVersions } from "../lib/cards-api.js";
import { parseApiErrorMessage, parseQuotaExhaustedError } from "../lib/chat-error.js";
import { isCardToolPart, type ChatUIMessage } from "../lib/chat-types.js";
import { turnNotices, type TurnNotice, type TurnStatus } from "../lib/turn-status.js";
import { useQuota } from "../lib/use-quota.js";
import { uuid } from "../lib/uuid.js";
import { useCardsStore } from "../stores/cards-store.js";
import { useChatsStore } from "../stores/chats-store.js";
import { useToastStore } from "../stores/toast-store.js";
import { ChatLoading } from "../components/chat/ChatLoading.js";
import { Tooltip } from "../components/ui/Tooltip.js";

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
    return <ChatLoading />;
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
  // F10.8.2: los turnos que se quedaron sin respuesta completa. `localStatus`
  // es lo que pasó en esta sesión (la respuesta en pantalla de un turno en
  // vivo no trae metadata); al recargar manda lo que guardó el servidor.
  const [localStatus, setLocalStatus] = useState<ReadonlyMap<string, TurnStatus>>(new Map());
  const [failedAgain, setFailedAgain] = useState(false);
  const retryingId = useRef<string | null>(null);
  function markTurn(userId: string, status: TurnStatus | null) {
    setLocalStatus((prev) => {
      const next = new Map(prev);
      if (status) next.set(userId, status);
      else next.delete(userId);
      return next;
    });
  }
  const transport = useMemo(() => chatTransport(chatId), [chatId]);
  const { messages, sendMessage, regenerate, stop, status, error } = useChat<ChatUIMessage>({
    id: chatId,
    messages: initialMessages,
    // Solo el último mensaje viaja al servidor (lib/chat-transport.ts). Uno
    // por chat: useChat se queda con el primero que recibe.
    transport,
    // uuid (F10.8.2): el servidor guarda el mensaje con este mismo id, así
    // "Regenerar" lo encuentra sin recargar. Con el id por default del SDK
    // (no es uuid) la base le ponía otro, y regenerar daba 404.
    generateId: uuid,
    // F10.8.2: cómo terminó el turno, para su card de estado. Sin `finish` no
    // terminó: se cortó (Detener, la red) o el stream se cerró de golpe (el
    // servidor se reinició a media respuesta). Detener justo cuando terminaba
    // no es un corte: el servidor ya la guardó completa. Solo setters y refs:
    // useChat se queda con este callback del primer render.
    onFinish: ({ messages: all, isAbort, isError, finishReason }) => {
      const userId = [...all].reverse().find((m) => m.role === "user")?.id;
      if (!userId) return;
      if (isError || !finishReason) {
        markTurn(userId, isAbort && !isError ? "stopped" : "failed");
        if (isError && retryingId.current === userId) setFailedAgain(true);
        return;
      }
      // Salió bien: el siguiente fallo de este turno vuelve a ser el primero.
      if (retryingId.current === userId) {
        retryingId.current = null;
        setFailedAgain(false);
      }
    },
  });
  const busy = status === "submitted" || status === "streaming";
  // Auto-scroll (F10.6.2): el chat sigue a la respuesta SOLO si estabas en
  // el final. Antes bajaba en cada mensaje aunque estuvieras leyendo arriba.
  // `stick` es un ref (lo lee el ResizeObserver sin re-suscribirse) y
  // `atBottom` el estado que pinta el botón "Ir al final".
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  // Un "Ir al final" suave en camino: sus propios eventos de scroll (todavía
  // lejos del final) no deben apagar `stick` a medio viaje.
  const seeking = useRef(false);
  // Dónde estaba el scroll en el evento anterior: subir, aunque sea poco,
  // apaga el seguimiento (con el dedo en móvil un arrastre corto nunca salía
  // de la zona de 80 px y cada token te regresaba al final).
  const lastTop = useRef(0);
  const [atBottom, setAtBottom] = useState(true);
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

  // La lista de chats (chats-store, compartida con el Sidebar y el título de
  // la Topbar): si nadie la cargó todavía, refreshChats() (idempotente) la
  // trae.
  const chats = useChatsStore((s) => s.chats);
  const refreshChats = useChatsStore((s) => s.refresh);

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
  // El contenido crece por muchos lados (texto en streaming, cards que
  // llegan, imágenes que cargan): se observa su alto, no `messages`.
  useEffect(() => {
    const box = scrollRef.current;
    const content = contentRef.current;
    if (!box || !content) return;
    const follow = () => {
      if (!stick.current) return;
      box.scrollTop = box.scrollHeight;
      // El salto es nuestro: la referencia de "subir" parte de aquí.
      lastTop.current = box.scrollTop;
    };
    follow();
    // También la caja: si se encoge (crece el composer, aparece un aviso
    // abajo) el final quedaría tapado sin que nadie hiciera scroll.
    const observer = new ResizeObserver(follow);
    observer.observe(content);
    observer.observe(box);
    const settle = () => {
      seeking.current = false;
      onScroll();
    };
    box.addEventListener("scrollend", settle);
    // Si la persona toma el scroll a medio viaje, el viaje ya no manda. Sin
    // esto, en navegadores sin `scrollend` (Safari < 26) `seeking` podía
    // quedarse prendido y arrastrarte al final para siempre.
    const takeOver = () => {
      seeking.current = false;
    };
    box.addEventListener("wheel", takeOver, { passive: true });
    box.addEventListener("touchstart", takeOver, { passive: true });
    return () => {
      observer.disconnect();
      box.removeEventListener("scrollend", settle);
      box.removeEventListener("wheel", takeOver);
      box.removeEventListener("touchstart", takeOver);
    };
  }, []);
  function onScroll() {
    const box = scrollRef.current;
    if (!box) return;
    const near = box.scrollHeight - box.scrollTop - box.clientHeight <= 80;
    // Subir de verdad, no que el navegador baje scrollTop porque el contenido
    // se encogió (eso deja el scroll pegado al tope inferior).
    const atMax = box.scrollHeight - box.scrollTop - box.clientHeight <= 1;
    const up = box.scrollTop < lastTop.current - 1 && !atMax;
    const down = box.scrollTop > lastTop.current + 1;
    lastTop.current = box.scrollTop;
    if (seeking.current) {
      if (near) seeking.current = false;
      return;
    }
    // Se vuelve a pegar al BAJAR dentro de la zona (o al tocar fondo), no
    // con cualquier evento cerca del final: el navegador a veces repite el
    // evento en la misma posición y eso volvía a pegarlo tras subir.
    if (up) stick.current = false;
    else if (atMax || (down && near)) stick.current = true;
    setAtBottom(stick.current);
  }
  function scrollToEnd(smooth: boolean) {
    stick.current = true;
    seeking.current = smooth;
    setAtBottom(true);
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  }
  const quotaExhaustedError = parseQuotaExhaustedError(error);
  const apiErrorMessage = parseApiErrorMessage(error);

  // Regenerar borra las cards de la respuesta (ADR-006). Desde F10.5 una
  // card puede traer trabajo del usuario encima (ediciones, versiones):
  // antes de tirarlo, se pregunta. Y una que ya salió a la red no se toca
  // (la API también lo impide): borrarla dejaría un post programado sin card.
  const toast = useToastStore((s) => s.show);
  const [regenerateEdited, setRegenerateEdited] = useState<number | null>(null);
  // Lo que corre justo antes de regenerar de verdad (F10.8.2): reintentar un
  // turno limpia su card de estado solo si el regenerar sale, no si el
  // creator cancela la confirmación.
  const beforeRegenerate = useRef<(() => void) | null>(null);
  function goRegenerate() {
    beforeRegenerate.current?.();
    beforeRegenerate.current = null;
    void regenerate();
  }
  async function requestRegenerate(onGo?: () => void) {
    beforeRegenerate.current = onGo ?? null;
    const last = messages.at(-1);
    const ids =
      last?.role === "assistant"
        ? last.parts.flatMap((p) =>
            isCardToolPart(p) && p.state === "output-available" ? [p.output.cardId] : [],
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
    else goRegenerate();
  }

  const notices = turnNotices(messages, { busy, local: localStatus });
  // Un rechazo de la API no guardó nada: reintentarlo tal cual daría lo mismo.
  const turnApiError = quotaExhaustedError ? "Usaste toda tu cuota de este mes." : apiErrorMessage;

  // Con respuesta en pantalla, es regenerarla (mismas guardas de cards). Sin
  // ella, el mensaje se reenvía con su mismo id: si el servidor lo tiene, es
  // ese turno de nuevo; si el corte fue antes de que llegara, entra como nuevo.
  function retryTurn(userId: string, notice: TurnNotice) {
    const go = () => {
      markTurn(userId, null);
      retryingId.current = userId;
      scrollToEnd(false);
    };
    if (notice.hasReply) {
      void requestRegenerate(go);
      return;
    }
    const text = messages
      .find((m) => m.id === userId)
      ?.parts.flatMap((p) => (p.type === "text" ? [p.text] : []))
      .join("\n");
    if (!text) return;
    go();
    void sendMessage({ text, messageId: userId });
  }

  function renderNotice(userId: string | undefined) {
    const notice = userId ? notices.get(userId) : undefined;
    if (!userId || !notice) return null;
    return (
      <TurnStatusCard
        notice={notice}
        failedAgain={failedAgain && notice.actionable}
        apiError={notice.actionable ? turnApiError : null}
        onRetry={() => retryTurn(userId, notice)}
      />
    );
  }

  function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setModalDismissed(false);
    setFailedAgain(false);
    retryingId.current = null;
    // Lo que tú mandas siempre se ve, aunque estuvieras leyendo arriba.
    scrollToEnd(false);
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
        {/* El título y el menú del chat viven en la Topbar (ChatCrumb, F10.6.2). */}

        <div className="relative min-h-0 flex-1">
          {/* `relative` aquí y no solo afuera: lo absoluto del contenido (el
              "Notas" sr-only de las notas al pie) se ancla DENTRO de la caja
              que hace scroll; anclado afuera estiraba el contenedor de la app
              y la página entera se desplazaba, composer incluido. */}
          <div ref={scrollRef} onScroll={onScroll} className="relative h-full overflow-y-auto">
            <div ref={contentRef} className="mx-auto flex max-w-[732px] flex-col gap-5 px-4 py-6">
              {messages.map((message, mi) => {
                const isLastMessage = mi === messages.length - 1;
                if (message.role === "user") {
                  // Sin respuesta en pantalla, la card de estado va aquí.
                  const noReply = messages[mi + 1]?.role !== "assistant";
                  return (
                    <div key={message.id} className="flex flex-col gap-[18px]">
                      {message.parts.map((part, i) =>
                        part.type === "text" ? <MessageUser key={i} text={part.text} /> : null,
                      )}
                      {noReply && renderNotice(message.id)}
                    </div>
                  );
                }
                const userId = messages[mi - 1]?.role === "user" ? messages[mi - 1]!.id : undefined;
                const hasNotice = userId !== undefined && notices.has(userId);
                return (
                  <div key={message.id} className="flex flex-col gap-3">
                    <AssistantMessage
                      message={message}
                      chatId={chatId}
                      isLast={isLastMessage}
                      streamingNow={status === "streaming"}
                      // Con card de estado, "Reintentar" ya está en ella.
                      canRegenerate={isLastMessage && !busy && !hasNotice}
                      onRegenerate={() => void requestRegenerate()}
                    />
                    {renderNotice(userId)}
                  </div>
                );
              })}
              {showTyping && <TypingDots />}
            </div>
          </div>
          {!atBottom && (
            <Tooltip label="Ir al final">
              <button
                type="button"
                aria-label="Ir al final"
                onClick={() => scrollToEnd(true)}
                className="absolute bottom-3 left-1/2 flex size-10 -translate-x-1/2 items-center justify-center rounded-full border border-line-subtle bg-card text-fg shadow-lg ring-4 ring-app transition-colors hover:bg-secondary-hover hover:text-fg"
              >
                <ArrowDown size={17} strokeWidth={2} />
              </button>
            </Tooltip>
          )}
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
                // Sin await: regenerate() resuelve cuando termina TODA la
                // respuesta, y el modal se quedaba encima mientras llegaba.
                // Un error del turno lo muestra el chat, como cualquier otro.
                onConfirm={() => {
                  goRegenerate();
                  return Promise.resolve();
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
