import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { parseDate } from "@internationalized/date";
import { Composer } from "../components/chat/Composer.js";
import { ContextChip } from "../components/chat/ContextChip.js";
import { SuggestionCard, SuggestionCardSkeleton } from "../components/chat/SuggestionCard.js";
import type { TrendSignal } from "@presencia/shared";
import { useTendencias } from "../lib/use-ritmo.js";
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
// que queda solo la primera, siempre.
//
// Las dos últimas tarjetas SÍ son dinámicas desde F9: salen de las tendencias
// de Ritmo, con su fuente citada y sin el "+24%" del mockup, que Ritmo §8
// prohíbe para tendencias por no tener de dónde salir.
// Un emoji por señal, como el doc de Chat: el 🔥 para todas dejaba a "estable"
// y "nueva" gritando lo mismo que "subiendo".
const EMOJI_DE_SENAL: Record<TrendSignal, string> = {
  rising: "🔥",
  stable: "📈",
  new: "✨",
};

/**
 * La rejilla siempre tiene CUATRO tarjetas, y eso es lo que la deja sin saltos
 * y sin scroll.
 *
 * Dos fijas + dos de tendencia. Mientras las tendencias viajan, su lugar lo
 * ocupan dos esqueletos del mismo alto; si no llegan —nicho recién buscado, o
 * búsqueda sin resultados— entran las dos de reserva. En los tres casos el
 * alto de la pantalla es el mismo.
 *
 * **Las fijas son las que funcionan el día 1 y no repiten lo que ya dicen las
 * de tendencia.** Las de tendencia son "de qué hablar", así que una fija que
 * proponga temas compite con ellas; "Ideas para esta semana" se queda igual
 * porque es la entrada canónica del producto y la única que sirve cuando el
 * usuario todavía no tiene absolutamente nada.
 */
const SUGERENCIAS_FIJAS = [
  {
    emoji: "✨",
    title: "Ideas para esta semana",
    description: "Genera 5 conceptos basados en mis tendencias",
    prompt: "Dame 5 ideas de contenido para esta semana, pensadas en mi nicho.",
  },
  {
    emoji: "✍️",
    title: "Hilo viral",
    description: "Estructura un thread o carrusel paso a paso",
    prompt: "Estructura un hilo o carrusel viral sobre un tema de mi nicho.",
  },
];

/**
 * Las que ocupan el lugar de una tendencia que no llegó.
 *
 * "Adaptar mi último post" va al final a propósito: es la única que puede no
 * tener de dónde agarrarse —pide un post previo— y el escenario donde esta
 * reserva aparece incluye al usuario nuevo, que es justo el que no lo tiene.
 */
const SUGERENCIAS_DE_RESERVA = [
  {
    emoji: "📅",
    title: "Calendario del mes",
    description: "Plan editorial completo para 30 días",
    prompt: "Ayúdame a armar un plan editorial para los próximos 30 días.",
  },
  {
    emoji: "🔄",
    title: "Adaptar mi último post",
    description: "Crea versiones para cada red social",
    prompt: "Toma mi post más reciente y adáptalo para otras redes sociales.",
  },
];

/** Cuántas tarjetas de tendencia entran. El resto lo completa la reserva. */
const TARJETAS_DE_TENDENCIA = 2;

export function ChatsPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data: session } = authClient.useSession();
  const createChat = useChatsStore((s) => s.create);
  const [input, setInput] = useState("");
  const [starting, setStarting] = useState(false);
  // Las tendencias del nicho, para las dos últimas tarjetas.
  const { tendencias, cargando: cargandoTendencias } = useTendencias();
  const [error, setError] = useState<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const name = session?.user.displayName ?? session?.user.name ?? "";
  // "+ Crear para este día" del Calendario llega como ?fecha=YYYY-MM-DD.
  // Solo cambia el placeholder: el Calendario decide el DÍA, y la hora la
  // sigue eligiendo el drawer de programación cuando el usuario programe.
  // Que la fecha viaje además al contexto del modelo es trabajo del Chat,
  // no de esta pantalla — todavía no existe y no se finge acá.
  const requestedDay = parseDayParam(params.get("fecha"));
  const destacadas = (tendencias?.items ?? []).slice(0, TARJETAS_DE_TENDENCIA);

  /**
   * Elegir una tarjeta escribe su prompt en la caja, sin arrancar nada.
   *
   * Antes creaba el chat y disparaba la generación con un solo click: el
   * usuario perdía la oportunidad de ajustar el texto y un click accidental
   * costaba un turno de verdad. La tarjeta es un punto de partida, no un botón
   * de enviar — por eso además deja el cursor al final, listo para editar.
   *
   * Reemplaza lo que hubiera escrito, igual que cualquier chip de sugerencia:
   * concatenar produce prompts mezclados que nadie quiso.
   */
  function proponer(prompt: string) {
    setInput(prompt);
    // En el frame siguiente: el textarea es controlado, así que en este
    // todavía tiene el valor viejo y el cursor caería en el lugar equivocado.
    requestAnimationFrame(() => {
      const el = composerRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  // "Crear en Chat" desde una propuesta de Ritmo llega como `state.propuesta`:
  // se escribe en la caja, igual que una tarjeta de sugerencia, y no se manda.
  // El state se limpia en seguida para que recargar no la vuelva a escribir
  // encima de lo que el usuario ya editó. Mismo patrón que `initialPrompt` en
  // chat.tsx, con la diferencia que importa: aquél sí dispara la generación.
  const location = useLocation();
  const propuesta = (location.state as { propuesta?: unknown } | null)?.propuesta;
  useEffect(() => {
    if (typeof propuesta !== "string" || propuesta.length === 0) return;
    proponer(propuesta);
    void navigate(location.pathname + location.search, { replace: true, state: null });
    // Solo al llegar con una propuesta nueva: `proponer` y `navigate` no
    // cambian lo que hay que hacer.
  }, [propuesta]);

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
    // `my-auto` en la columna y NO `justify-center` en el contenedor, aunque
    // centren igual: con `justify-center`, cuando el contenido no cabe, lo que
    // sobra se desborda hacia ARRIBA del origen del scroll y queda inalcanzable
    // — en una pantalla baja el saludo se corta y no hay forma de subir. Los
    // márgenes automáticos se resuelven a cero cuando no hay espacio, así que
    // el contenido arranca arriba y se scrollea completo.
    <div className="flex min-h-full flex-col items-center px-8 py-8">
      <div className="my-auto w-full max-w-[680px]">
        <div className="mb-6 text-center">
          <h1 className="font-display text-[38px] font-semibold tracking-tight text-fg">
            Hola{name ? `, ${name}` : ""}
          </h1>
          <p className="mt-2 text-base text-fg-secondary">¿Qué quieres publicar hoy?</p>
        </div>

        <div className="mb-5">
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
            inputRef={composerRef}
          />
          {error && <p className="mt-2 text-center text-sm text-error">{error}</p>}
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          {SUGERENCIAS_FIJAS.map((s) => (
            <SuggestionCard
              key={s.title}
              emoji={s.emoji}
              title={s.title}
              description={s.description}
              onClick={() => proponer(s.prompt)}
            />
          ))}
          {/* Dos, no más: son un acompañamiento del estado vacío, no el
              módulo de tendencias. Ese vive en Ritmo. */}
          {cargandoTendencias
            ? Array.from({ length: TARJETAS_DE_TENDENCIA }).map((_, indice) => (
                <SuggestionCardSkeleton key={indice} />
              ))
            : destacadas.map((item) => (
                <SuggestionCard
                  key={item.topic}
                  emoji={EMOJI_DE_SENAL[item.signal]}
                  title={item.topic}
                  description={item.blurb}
                  senal={item.signal}
                  fuente={item.sourceTitle}
                  onClick={() =>
                    proponer(
                      `Quiero crear contenido sobre esto que está moviéndose en mi nicho: ${item.topic}. ${item.blurb}`,
                    )
                  }
                />
              ))}
          {/* La reserva solo completa lo que las tendencias dejaron vacío, para
              que la rejilla sean siempre cuatro y el alto no cambie. */}
          {!cargandoTendencias &&
            SUGERENCIAS_DE_RESERVA.slice(0, TARJETAS_DE_TENDENCIA - destacadas.length).map((s) => (
              <SuggestionCard
                key={s.title}
                emoji={s.emoji}
                title={s.title}
                description={s.description}
                onClick={() => proponer(s.prompt)}
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
