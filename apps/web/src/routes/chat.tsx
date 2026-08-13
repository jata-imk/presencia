import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isStaticToolUIPart } from "ai";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
// react-markdown es una elección provisional para F3 (ver ADR-006
// addendum): suficiente para texto simple con streaming; se reevalúa en
// el pulido visual final si se necesita más control.
import ReactMarkdown from "react-markdown";
import { PublicationCard } from "../components/PublicationCard.js";
import { QuotaBanner } from "../components/QuotaBanner.js";
import { QuotaExhaustedModal } from "../components/QuotaExhaustedModal.js";
import { parseQuotaExhaustedError } from "../lib/chat-error.js";
import type { ChatUIMessage } from "../lib/chat-types.js";
import { useQuota } from "../lib/use-quota.js";

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
      <main className="p-8">
        <p className="text-error">{loadError}</p>
        <Link to="/chats">Volver a tus chats</Link>
      </main>
    );
  }
  if (!id || initialMessages === null) {
    return <main className="p-8">Cargando…</main>;
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

  // F5: % de cuota + traducción a publicaciones, nunca un número crudo de
  // créditos (addendum ADR-012). Se refresca al terminar cada turno —
  // charge() en la API ya cobró el turno para cuando el stream cierra.
  const { quota, refresh: refreshQuota } = useQuota();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [modalDismissed, setModalDismissed] = useState(false);
  useEffect(() => {
    if (status === "ready") refreshQuota();
  }, [status, refreshQuota]);
  const quotaExhaustedError = parseQuotaExhaustedError(error);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setModalDismissed(false);
    void sendMessage({ text });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 p-8">
      <Link to="/chats" className="text-sm">
        ← Tus chats
      </Link>
      <ul className="flex flex-1 flex-col gap-3">
        {messages.map((message) => (
          <li key={message.id} className="border border-line-subtle bg-surface p-3">
            <span className="block text-xs font-semibold text-fg-muted">
              {message.role === "user" ? "Tú" : "Presencia"}
            </span>
            <div className="flex flex-col gap-2">
              {message.parts.map((part, i) => {
                if (part.type === "text") {
                  return (
                    <div key={i} className="markdown text-fg">
                      <ReactMarkdown>{part.text}</ReactMarkdown>
                    </div>
                  );
                }
                if (part.type === "step-start") {
                  return i === 0 ? null : <hr key={i} className="border-line-subtle" />;
                }
                if (isStaticToolUIPart(part)) {
                  return <PublicationCard key={i} part={part} />;
                }
                return null;
              })}
            </div>
          </li>
        ))}
        {status === "submitted" && <li className="text-sm text-fg-muted">Pensando…</li>}
      </ul>
      {error && !quotaExhaustedError && (
        <p className="flex items-center gap-2 text-sm text-error">
          Algo salió mal generando la respuesta.
          <button type="button" className="underline" onClick={() => void regenerate()}>
            Reintentar
          </button>
        </p>
      )}
      {quota && !bannerDismissed && (
        <QuotaBanner quota={quota} onDismiss={() => setBannerDismissed(true)} />
      )}
      {quotaExhaustedError && !modalDismissed && (
        <QuotaExhaustedModal
          quota={quotaExhaustedError}
          onDismiss={() => setModalDismissed(true)}
        />
      )}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          className="flex-1 border border-line p-2"
          placeholder="Escribe tu mensaje…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        {busy ? (
          <button type="button" className="border border-line px-4" onClick={() => void stop()}>
            Detener
          </button>
        ) : (
          <button type="submit" className="border border-line px-4 font-semibold">
            Enviar
          </button>
        )}
      </form>
    </main>
  );
}
