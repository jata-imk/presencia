import { AlertCircle, Check, ChevronRight, Sparkles } from "lucide-react";
import { useState } from "react";
import { socialNetworkSchema, type SocialNetwork } from "@presencia/shared";
import type { CardToolPart } from "../../lib/chat-types.js";
import { NETWORK_LABELS } from "../../lib/network-labels.js";

// La línea de "pasos" de una respuesta (F10.5, Chat Rediseño.html → Steps).
// Resume lo que la IA hizo con tools en vez de mostrar cada llamada: "Creé 3
// borradores". Se deriva solo de los tool parts reales del mensaje — las
// tools de hoy son las de crear borradores (ADR-005), así que no se inventan
// pasos como "Analizando tendencias…" que el backend no reporta.
//
// Abierta mientras se crean (se ve el avance por red) y plegada al terminar;
// si el usuario la toca, manda lo que eligió.

type StepState = "live" | "done" | "error" | "stopped";

function networkOf(part: CardToolPart): SocialNetwork | null {
  if (part.state === "output-available") return part.output.network;
  // Mientras llega el input, `network` puede no existir todavía o venir a
  // medias: solo se usa si ya es una red válida.
  const raw = (part.input as { network?: unknown } | undefined)?.network;
  const parsed = socialNetworkSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// Un tool call sin output solo sigue "en curso" mientras el turno llega. Si
// el usuario lo detuvo o el stream se cortó, ese part nunca va a terminar:
// mostrarlo girando sería prometer un trabajo que ya nadie está haciendo.
function stateOf(part: CardToolPart, streaming: boolean): StepState {
  if (part.state === "output-available") return "done";
  if (part.state === "output-error") return "error";
  return streaming ? "live" : "stopped";
}

export function Steps({ parts, streaming }: { parts: CardToolPart[]; streaming: boolean }) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  if (parts.length === 0) return null;

  const items = parts.map((part) => ({
    network: networkOf(part),
    state: stateOf(part, streaming),
  }));
  const live = items.some((i) => i.state === "live");
  const done = items.filter((i) => i.state === "done").length;
  const open = userOpen ?? live;

  const stopped = items.some((i) => i.state === "stopped");
  const label = live
    ? "Creando borradores…"
    : done === 0
      ? stopped
        ? `Se detuvo la creación ${items.length === 1 ? "del borrador" : "de los borradores"}`
        : "No pude crear el borrador"
      : `Creé ${done} ${done === 1 ? "borrador" : "borradores"}`;

  return (
    <div className="text-[13px] text-fg-muted">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setUserOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-md font-display transition-colors hover:text-fg-secondary"
      >
        {live ? <Spinner /> : <Sparkles size={13} strokeWidth={1.75} aria-hidden="true" />}
        <span>{label}</span>
        <ChevronRight
          size={13}
          strokeWidth={1.75}
          aria-hidden="true"
          className={`transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && (
        <ul className="mt-2 ml-1.5 flex flex-col gap-1.5 border-l border-line pl-3.5">
          {items.map((item, i) => (
            <li key={i} className="flex items-center gap-2">
              {item.state === "live" ? (
                <Spinner />
              ) : item.state === "error" || item.state === "stopped" ? (
                <AlertCircle size={12} strokeWidth={2} className="text-error" aria-hidden="true" />
              ) : (
                <Check size={12} strokeWidth={2.25} className="text-success" aria-hidden="true" />
              )}
              <span className="text-fg-secondary">{stepText(item.network, item.state)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function stepText(network: SocialNetwork | null, state: StepState): string {
  const red = network ? ` para ${NETWORK_LABELS[network]}` : "";
  if (state === "live") return `Creando borrador${red}…`;
  if (state === "error") return `No pude crear el borrador${red}`;
  if (state === "stopped") return `Se detuvo el borrador${red}`;
  return `Borrador${red}`;
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-3 shrink-0 animate-spin rounded-full border-[1.5px] border-line border-t-accent"
    />
  );
}
