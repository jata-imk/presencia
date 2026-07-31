import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { ChatSummary } from "@presencia/shared";
import { authClient } from "../lib/auth-client.js";

export function ChatsPage() {
  const navigate = useNavigate();
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/chats")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setChats((await res.json()) as ChatSummary[]);
      })
      .catch(() => setError("No se pudieron cargar tus chats."));
  }, []);

  async function createChat() {
    const res = await fetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      setError("No se pudo crear el chat.");
      return;
    }
    const chat = (await res.json()) as ChatSummary;
    void navigate(`/chats/${chat.id}`);
  }

  async function logout() {
    await authClient.signOut();
    void navigate("/login");
  }

  function handleRenamed(updated: ChatSummary) {
    setChats((prev) => prev?.map((c) => (c.id === updated.id ? updated : c)) ?? null);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tus chats</h1>
        <button
          type="button"
          className="border border-line px-2 py-1 text-sm"
          onClick={() => void logout()}
        >
          Cerrar sesión
        </button>
      </div>
      <button
        type="button"
        className="border border-line p-2 font-semibold"
        onClick={() => void createChat()}
      >
        + Nuevo chat
      </button>
      {error && <p className="text-sm text-error">{error}</p>}
      {chats === null && !error && <p>Cargando…</p>}
      {chats?.length === 0 && <p>Aún no tienes chats. Crea el primero.</p>}
      <ul className="flex flex-col gap-2">
        {chats?.map((chat) => (
          <li key={chat.id}>
            <ChatListItem chat={chat} onRenamed={handleRenamed} />
          </li>
        ))}
      </ul>
    </main>
  );
}

function ChatListItem({
  chat,
  onRenamed,
}: {
  chat: ChatSummary;
  onRenamed: (chat: ChatSummary) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(chat.title);

  async function commit() {
    const trimmed = title.trim();
    setEditing(false);
    if (!trimmed || trimmed === chat.title) {
      setTitle(chat.title);
      return;
    }
    const res = await fetch(`/api/chats/${chat.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });
    if (res.ok) onRenamed((await res.json()) as ChatSummary);
    else setTitle(chat.title);
  }

  if (editing) {
    return (
      <input
        autoFocus
        className="block w-full border border-line-focus bg-surface p-3"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => e.key === "Enter" && void commit()}
      />
    );
  }

  return (
    <div className="flex items-center justify-between border border-line p-3">
      <Link to={`/chats/${chat.id}`} className="flex-1">
        {chat.title}
        {chat.lastMessageAt && (
          <span className="block text-xs text-fg-muted">
            Último mensaje: {new Date(chat.lastMessageAt).toLocaleString()}
          </span>
        )}
      </Link>
      <button type="button" className="text-xs text-fg-muted" onClick={() => setEditing(true)}>
        Renombrar
      </button>
    </div>
  );
}
