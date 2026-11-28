import type { ReactNode } from "react";
import { Activity, CalendarDays, MessageSquare, Sparkles, Telescope } from "lucide-react";
import type {
  AnaliticasHallazgoDto,
  AnaliticasHallazgosDto,
  HallazgoFormatoDto,
  SocialNetwork,
} from "@presencia/shared";
import { baseDeHallazgo, fraseDeHallazgo } from "../../lib/analiticas/formato.js";
import { EncabezadoSeccion, VacioSeccion } from "./Seccion.js";

// "Hallazgos" (lore doc §3 y §5): hasta tres diferencias que aguantaron las
// pruebas del motor (`hallazgosDe`, regla 14 del addendum F12 de ADR-022).
// Miran siempre 90 días, sin importar el periodo de arriba, y el subtítulo lo
// dice. Cada tarjeta lleva su red y su base, y una acción:
// - formato → "Crear en Chat": un chat nuevo con la idea escrita en la caja,
//   sin mandarla (el tema lo pone el creator);
// - día de la semana → "Ver en Ritmo", en esa red.

const SIN_MUESTRA = "Con unas publicaciones más encontraremos patrones en tu contenido.";
const SIN_DIFERENCIA = "Todavía no hay una diferencia que se sostenga en tus últimos 90 días.";

export function Hallazgos({
  hallazgos: dto,
  onCrearEnChat,
  onVerEnRitmo,
}: {
  hallazgos: AnaliticasHallazgosDto;
  onCrearEnChat: (hallazgo: HallazgoFormatoDto) => void;
  onVerEnRitmo: (red: SocialNetwork) => void;
}) {
  // El hallazgo de voz ya llega de la API (PR 9a de F12), pero su tarjeta, con
  // "Agregar a «Así escribes»" / "No", llega en el PR 9b. Hasta entonces no se
  // pinta: como de día, ofrecería "Ver en Ritmo".
  const hallazgos = {
    ...dto,
    hallazgos: dto.hallazgos.filter(
      (h): h is Exclude<AnaliticasHallazgoDto, { tipo: "voz" }> => h.tipo !== "voz",
    ),
  };
  return (
    <SeccionHallazgos>
      {hallazgos.hallazgos.length === 0 ? (
        <VacioSeccion
          icono={Telescope}
          texto={hallazgos.hayMuestra ? SIN_DIFERENCIA : SIN_MUESTRA}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 @lg:grid-cols-2 @4xl:grid-cols-3 @4xl:gap-4">
          {hallazgos.hallazgos.map((hallazgo) => (
            <li key={llaveDe(hallazgo)} className="flex">
              <Tarjeta
                hallazgo={hallazgo}
                onCrearEnChat={onCrearEnChat}
                onVerEnRitmo={onVerEnRitmo}
              />
            </li>
          ))}
        </ul>
      )}
    </SeccionHallazgos>
  );
}

/** El marco de la sección, también para su esqueleto y su error. */
export function SeccionHallazgos({ children }: { children: ReactNode }) {
  return (
    <section aria-labelledby="hallazgos-titulo" className="flex flex-col gap-3.5">
      <EncabezadoSeccion
        id="hallazgos-titulo"
        titulo="Hallazgos"
        subtitulo="En tus últimos 90 días"
      />
      {children}
    </section>
  );
}

/** Uno por (tipo, red): el motor no repite la pareja. */
function llaveDe(hallazgo: AnaliticasHallazgoDto): string {
  return `${hallazgo.tipo}:${hallazgo.network}`;
}

const CTA =
  "inline-flex items-center gap-[7px] self-start rounded-full px-4 py-2 font-display text-[13px] font-semibold transition-colors";

function Tarjeta({
  hallazgo,
  onCrearEnChat,
  onVerEnRitmo,
}: {
  hallazgo: Exclude<AnaliticasHallazgoDto, { tipo: "voz" }>;
  onCrearEnChat: (hallazgo: HallazgoFormatoDto) => void;
  onVerEnRitmo: (red: SocialNetwork) => void;
}) {
  const { antes, numero, despues } = fraseDeHallazgo(hallazgo);
  const Icono = hallazgo.tipo === "formato" ? Sparkles : CalendarDays;
  return (
    <article className="flex w-full flex-col gap-3 rounded-xl border border-line bg-card p-5">
      <span className="flex size-[30px] items-center justify-center rounded-lg bg-tint-plum">
        <Icono size={16} strokeWidth={1.5} className="text-fg-secondary" aria-hidden />
      </span>
      <p className="text-[15px] leading-[1.55] text-pretty text-fg">
        {antes}
        <strong className="font-display font-semibold text-brand">{numero}</strong>
        {despues}
      </p>
      <p className="mt-auto text-xs text-fg-muted">{baseDeHallazgo(hallazgo)}</p>
      {hallazgo.tipo === "formato" ? (
        <button
          type="button"
          onClick={() => onCrearEnChat(hallazgo)}
          className={`${CTA} bg-accent-cta text-accent-cta-fg hover:bg-accent-cta-hover`}
        >
          <MessageSquare size={14} strokeWidth={1.75} aria-hidden />
          Crear en Chat
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onVerEnRitmo(hallazgo.network)}
          className={`${CTA} border border-line-focus bg-card text-brand hover:bg-surface`}
        >
          <Activity size={14} strokeWidth={1.75} aria-hidden />
          Ver en Ritmo
        </button>
      )}
    </article>
  );
}

/** Las tres tarjetas mientras llegan, con su forma (3e del diseño). */
export function HallazgosSkeleton() {
  return (
    <SeccionHallazgos>
      <div
        className="grid animate-pulse grid-cols-1 gap-3 @lg:grid-cols-2 @4xl:grid-cols-3 @4xl:gap-4"
        aria-hidden
      >
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className={`flex-col gap-3.5 rounded-xl border border-line bg-card p-5 ${
              i === 0 ? "flex" : i === 1 ? "hidden @lg:flex" : "hidden @4xl:flex"
            }`}
          >
            <div className="size-[30px] rounded-lg bg-secondary" />
            <div className="h-[13px] w-full rounded-md bg-secondary" />
            <div className="h-[13px] w-[72%] rounded-md bg-secondary" />
            <div className="h-[11px] w-[148px] max-w-full rounded-md bg-secondary" />
            <div className="h-9 w-[142px] rounded-full bg-secondary" />
          </div>
        ))}
      </div>
    </SeccionHallazgos>
  );
}
