import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { parseDate } from "@internationalized/date";
import { Composer } from "../components/chat/Composer.js";
import { ContextChip } from "../components/chat/ContextChip.js";
import { SuggestionCard } from "../components/chat/SuggestionCard.js";
import { formatDayLong } from "../lib/calendar/tz.js";
import { authClient } from "../lib/auth-client.js";
import { useChatsStore } from "../stores/chats-store.js";

// Pantalla de "nuevo chat" (Chat Module.html, ChatEmptyState) — reemplaza
// la lista cruda de F1. La lista de chats existentes se mudó al Sidebar
// ("Recientes", F6 PR5); esta pantalla es exclusivamente para empezar uno.
//
// El mockup rota el subtítulo entre 3 variantes ("Tienes 3 posts
// programados esta semana", "Hace 2 días que no creas contenido") — se
// fabricarían con datos que no existen sin Calendario/Ritmo reales, así
// que queda solo la primera, siempre. Mismo motivo por el que las 2
// tarjetas "Tendencia" con métrica no están en SUGGESTIONS: no hay datos
// reales que respalden un "+24%".
const SUGGESTIONS = [
  {
    emoji: "✨",
    title: "Ideas para esta semana",
    description: "Genera 5 conceptos basados en mis tendencias",
    prompt: "Dame 5 ideas de contenido para esta semana, pensadas en mi nicho.",
  },
  {
    emoji: "🔄",
    title: "Adaptar mi último post",
    description: "Crea versiones para cada red social",
    prompt: "Toma mi post más reciente y adáptalo para otras redes sociales.",
  },
  {
    emoji: "📅",
    title: "Calendario del mes",
    description: "Plan editorial completo para 30 días",
    prompt: "Ayúdame a armar un plan editorial para los próximos 30 días.",
  },
  {
    emoji: "✍️",
    title: "Hilo viral",
    description: "Estructura un thread o carrusel paso a paso",
    prompt: "Estructura un hilo o carrusel viral sobre un tema de mi nicho.",
  },
];

export function ChatsPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data: session } = authClient.useSession();
  const createChat = useChatsStore((s) => s.create);
  const [input, setInput] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = session?.user.displayName ?? session?.user.name ?? "";
  // "+ Crear para este día" del Calendario llega como ?fecha=YYYY-MM-DD.
  // Solo cambia el placeholder: el Calendario decide el DÍA, y la hora la
  // sigue eligiendo el drawer de programación cuando el usuario programe.
  // Que la fecha viaje además al contexto del modelo es trabajo del Chat,
  // no de esta pantalla — todavía no existe y no se finge acá.
  const requestedDay = parseDayParam(params.get("fecha"));

  async function startChat(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed || starting) return;
    setError(null);
    setStarting(true);
    try {
      const chat = await createChat();
      void navigate(`/chats/${chat.id}`, { state: { initialPrompt: trimmed } });
    } catch {
      setError("No se pudo crear el chat. Inténtalo de nuevo.");
      setStarting(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-8 py-10">
      <div className="w-full max-w-[680px]">
        <div className="mb-9 text-center">
          <h1 className="font-display text-[38px] font-semibold tracking-tight text-fg">
            Hola{name ? `, ${name}` : ""}
          </h1>
          <p className="mt-2 text-base text-fg-secondary">¿Qué quieres publicar hoy?</p>
        </div>

        <div className="mb-7">
          <Composer
            value={input}
            onChange={setInput}
            onSubmit={() => void startChat(input)}
            busy={starting}
            onStop={() => {}}
            placeholder={
              requestedDay
                ? `Crear contenido para el ${formatDayLong(requestedDay).toLowerCase()}...`
                : "Cuéntame qué quieres crear hoy..."
            }
            large
          />
          {error && <p className="mt-2 text-center text-sm text-error">{error}</p>}
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          {SUGGESTIONS.map((s) => (
            <SuggestionCard
              key={s.title}
              emoji={s.emoji}
              title={s.title}
              description={s.description}
              onClick={() => void startChat(s.prompt)}
            />
          ))}
        </div>

        <ContextChip />
      </div>
    </div>
  );
}

function parseDayParam(value: string | null) {
  if (!value) return null;
  try {
    return parseDate(value);
  } catch {
    return null;
  }
}
