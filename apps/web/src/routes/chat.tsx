import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";

export function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setInitialMessages(null);
    setLoadError(null);
    fetch(`/api/chats/${id}/messages`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setInitialMessages((await res.json()) as UIMessage[]);
      })
      .catch(() => setLoadError("No se pudo cargar el chat."));
  }, [id]);

  if (loadError) {
    return (
      <main className="p-8">
        <p className="text-red-600">{loadError}</p>
        <Link to="/chats">Volver a tus chats</Link>
      </main>
    );
  }
  if (!id || initialMessages === null) {
    return <main className="p-8">Cargando…</main>;
  }
  return <ChatView key={id} chatId={id} initialMessages={initialMessages} />;
}

function ChatView({ chatId, initialMessages }: { chatId: string; initialMessages: UIMessage[] }) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, stop, status, error } = useChat({
    id: chatId,
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: `/api/chats/${chatId}/stream` }),
  });
  const busy = status === "submitted" || status === "streaming";

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    void sendMessage({ text });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 p-8">
      <Link to="/chats" className="text-sm">
        ← Tus chats
      </Link>
      <ul className="flex flex-1 flex-col gap-3">
        {messages.map((message) => (
          <li key={message.id} className="border p-3">
            <span className="block text-xs font-semibold opacity-60">
              {message.role === "user" ? "Tú" : "Presencia"}
            </span>
            {message.parts.map((part, i) =>
              part.type === "text" ? <p key={i}>{part.text}</p> : null,
            )}
          </li>
        ))}
        {status === "submitted" && <li className="text-sm opacity-60">Pensando…</li>}
      </ul>
      {error && <p className="text-sm text-red-600">Algo salió mal. Manda tu mensaje de nuevo.</p>}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          className="flex-1 border p-2"
          placeholder="Escribe tu mensaje…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        {busy ? (
          <button type="button" className="border px-4" onClick={() => void stop()}>
            Detener
          </button>
        ) : (
          <button type="submit" className="border px-4 font-semibold">
            Enviar
          </button>
        )}
      </form>
    </main>
  );
}
