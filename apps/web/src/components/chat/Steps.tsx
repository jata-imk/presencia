import {
  AlertCircle,
  Check,
  ChevronRight,
  CircleSlash,
  Clock,
  FileExclamationPoint,
  FilePlay,
  FileQuestionMark,
  Info,
  Link2Off,
  Lock,
  Minus,
  SearchX,
  ServerCrash,
  Shield,
  Square,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import type { CardToolPart, WebToolPart } from "../../lib/chat-types.js";
import {
  stepsExpandable,
  stepsHeader,
  turnSteps,
  type StepReason,
  type StepsHeader,
  type TurnStep,
} from "../../lib/turn-steps.js";

// La línea de pasos de una respuesta (F10.5, Chat Rediseño.html → Steps;
// F10.10, Chat Web.html → WLine). Una sola lista con todo lo que la IA hizo en
// el turno, en orden: buscar, leer y crear borradores (Jose, 2026-10-28). Se
// deriva solo de los tool parts reales del mensaje (lib/turn-steps.ts): no se
// inventan pasos que el backend no reporta.
//
// Abierta mientras corre si hay más de un paso, y plegada al terminar en un
// resumen ("Busqué 1 vez y leí 2 páginas"); si el usuario la toca, manda lo
// que eligió. Un solo paso de la web no se abre: el encabezado es el paso
// ("Leí eluniversal.com.mx"). Lo que no se pudo leer va sin rojo ni alarma: el modelo además
// lo explica en el texto. Rojo solo para un borrador que no se creó.

const HEADER_ICON: Record<Exclude<StepsHeader["state"], "live">, LucideIcon> = {
  done: Check,
  fail: CircleSlash,
  stop: Square,
  limit: Info,
};

// En la lista abierta cada motivo lleva su ícono; plegada, el genérico.
const REASON_ICON: Record<StepReason, LucideIcon> = {
  sesion: Lock,
  no_existe: Link2Off,
  ilegible: FileQuestionMark,
  bloqueada: Shield,
  tiempo: Clock,
  grande: FileExclamationPoint,
  tipo: FilePlay,
  sitio: ServerCrash,
  buscador: ServerCrash,
  sin_resultados: SearchX,
};

export function Steps({
  parts,
  streaming,
}: {
  parts: (CardToolPart | WebToolPart)[];
  streaming: boolean;
}) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const steps = turnSteps(parts, streaming);
  const header = stepsHeader(steps);
  if (!header) return null;

  const expandable = stepsExpandable(steps);
  const open = expandable && (userOpen ?? header.state === "live");
  const HeaderIcon = header.state === "live" ? null : HEADER_ICON[header.state];
  const content = (
    <>
      {HeaderIcon ? (
        <HeaderIcon size={13} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
      ) : (
        <Spinner />
      )}
      <span className="min-w-0 truncate">{header.label}</span>
    </>
  );

  return (
    <div className="min-w-0 text-[13px] text-fg-muted" aria-live="polite">
      {expandable ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setUserOpen(!open)}
          className="inline-flex max-w-full items-center gap-1.5 rounded-md font-display transition-colors hover:text-fg-secondary"
        >
          {content}
          <ChevronRight
            size={13}
            strokeWidth={1.75}
            aria-hidden="true"
            className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          />
        </button>
      ) : (
        <div className="flex max-w-full items-center gap-1.5 font-display">{content}</div>
      )}
      {open && (
        <ul className="mt-2 ml-1.5 flex flex-col gap-1.5 border-l border-line pl-3.5">
          {steps.map((step, i) => (
            <li key={i} className="flex min-w-0 items-center gap-2">
              <StepIcon step={step} />
              <span
                className={`min-w-0 truncate ${
                  step.state === "ok" || step.state === "part"
                    ? "text-fg-muted"
                    : "text-fg-secondary"
                }`}
              >
                {step.text}
              </span>
              {step.meta && <span className="shrink-0 whitespace-nowrap">· {step.meta}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StepIcon({ step }: { step: TurnStep }) {
  if (step.state === "live") return <Spinner />;
  if (step.state === "error") {
    return (
      <AlertCircle size={12} strokeWidth={2} className="shrink-0 text-error" aria-hidden="true" />
    );
  }
  const Icon =
    step.state === "fail"
      ? step.reason
        ? REASON_ICON[step.reason]
        : CircleSlash
      : step.state === "stop"
        ? Square
        : step.state === "skip"
          ? Minus
          : Check;
  // Un borrador creado conserva su check verde (F10.5); lo de la web va tenue.
  const tone = step.kind === "card" && step.state === "ok" ? "text-success" : "text-fg-muted";
  return <Icon size={12} strokeWidth={2} className={`shrink-0 ${tone}`} aria-hidden="true" />;
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-3 shrink-0 animate-spin rounded-full border-[1.5px] border-line border-t-accent"
    />
  );
}
