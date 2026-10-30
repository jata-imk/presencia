import {
  isSessionHost,
  normalizeTrendSource,
  READ_LINK_TOOL_NAME,
  WEB_READS_PER_TURN,
  WEB_SEARCHES_PER_TURN,
  type ReadLinkOutput,
  type WebSearchOutput,
} from "@presencia/shared";
import { networkOfCardPart } from "./card-attempts.js";
import { isCardToolPart, type CardToolPart, type WebToolPart } from "./chat-types.js";
import { NETWORK_LABELS } from "./network-labels.js";

// F10.10 (Chat Web.html): los pasos de una respuesta, en el orden en que
// pasaron: buscar, leer y crear borradores en UNA sola lista (decisión de
// Jose, 2026-10-28). Se derivan solo de los tool parts reales del mensaje:
// no se inventan pasos que el backend no reporta. Puro, para probarlo sin
// pintar nada; Steps.tsx los dibuja.

export type StepKind = "search" | "read" | "card";

/**
 * - live: corriendo; ok: terminó bien; part: terminó a medias (página larga o
 *   solo su descripción); fail: no se pudo, sin alarma (es de la web, no
 *   nuestro); error: una card que no se creó (sí es nuestro); stop: se detuvo
 *   el turno; skip: no se intentó por el tope del mensaje.
 */
export type StepState = "live" | "ok" | "part" | "fail" | "error" | "stop" | "skip";

/** Por qué no se pudo leer o buscar: elige el ícono en la lista abierta. */
export type StepReason =
  | "sesion"
  | "no_existe"
  | "ilegible"
  | "bloqueada"
  | "tiempo"
  | "grande"
  | "tipo"
  | "sitio"
  | "buscador"
  | "sin_resultados";

export interface TurnStep {
  kind: StepKind;
  state: StepState;
  text: string;
  /** Un dato al lado, más tenue: "8 resultados", "es muy larga". */
  meta?: string;
  reason?: StepReason;
  /** El dominio o la consulta del paso, para el encabezado. */
  target?: string;
}

/** El encabezado de la lista: su ícono y su texto. */
export interface StepsHeader {
  state: "live" | "done" | "fail" | "stop" | "limit";
  label: string;
}

type StepPart = CardToolPart | WebToolPart;

/**
 * Host sin `www.` de una URL, con el mismo helper con que la API llena
 * `dominio` (read-output.ts): una lectura en curso o fallida y su fuente ya
 * leída nombran igual al sitio. Para lo que ese helper no acepta (una IP,
 * localhost, otro protocolo), el host a secas: nunca la URL completa, que
 * puede traer una ruta o un token.
 */
export function domainOfUrl(url: string | undefined): string {
  if (!url) return "la página";
  const domain = normalizeTrendSource(url);
  if (domain) return domain;
  try {
    return new URL(url).hostname.replace(/^www\./, "") || "la página";
  } catch {
    return "la página";
  }
}

// Redes que piden sesión: se dice así ("pide iniciar sesión"); en cualquier
// otro sitio la misma respuesta del servidor es una cuenta o un muro de pago.
const isSocial = isSessionHost;

function inputOf<T>(part: StepPart): Partial<T> {
  return part.input ?? {};
}

function searchStep(part: StepPart, streaming: boolean): TurnStep {
  const consulta = inputOf<{ consulta: string }>(part).consulta?.trim();
  const q = consulta ? `'${consulta}'` : "en la web";
  if (part.state === "output-available") {
    const out = part.output as WebSearchOutput;
    if (out.estado === "ok") {
      const n = out.resultados.length;
      return {
        kind: "search",
        state: "ok",
        text: `Busqué ${q}`,
        meta: `${String(n)} ${n === 1 ? "resultado" : "resultados"}`,
      };
    }
    if (out.estado === "sin_resultados") {
      return {
        kind: "search",
        state: "fail",
        text: `Busqué ${q}: sin resultados`,
        reason: "sin_resultados",
      };
    }
    if (out.estado === "limite") {
      return {
        kind: "search",
        state: "skip",
        text: `No busqué ${q}: llegué al tope de ${String(WEB_SEARCHES_PER_TURN)} búsquedas`,
      };
    }
    return {
      kind: "search",
      state: "fail",
      text: `No pude buscar ${q}: el buscador no respondió`,
      reason: "buscador",
    };
  }
  if (part.state === "output-error") {
    return {
      kind: "search",
      state: "fail",
      text: `No pude buscar ${q}`,
      reason: "buscador",
    };
  }
  return streaming
    ? { kind: "search", state: "live", text: `Buscando ${q}…` }
    : {
        kind: "search",
        state: "stop",
        text: `Detuviste la búsqueda ${consulta ? `de ${q}` : "en la web"}`,
      };
}

interface ReadFail {
  text: string;
  reason: StepReason;
}

const genericFail = (d: string): ReadFail => ({ text: `No pude leer ${d}`, reason: "sitio" });

const READ_FAILS: Record<
  Exclude<ReadLinkOutput["estado"], "ok" | "limite">,
  (d: string) => ReadFail
> = {
  requiere_sesion: (d) => ({
    text: `No pude leer ${d}: ${isSocial(d) ? "pide iniciar sesión" : "pide cuenta o pago"}`,
    reason: "sesion",
  }),
  no_encontrada: (d) => ({
    text: `No encontré la página en ${d}: ya no existe`,
    reason: "no_existe",
  }),
  no_legible: (d) => ({ text: `No pude leer ${d}: no tiene texto legible`, reason: "ilegible" }),
  bloqueada: (d) => ({
    // Cubre más que las direcciones internas: un puerto raro, otro protocolo
    // o un usuario y contraseña en el enlace (safe-fetch.ts).
    text: `No abrí ${d}: por seguridad no abro ese tipo de dirección`,
    reason: "bloqueada",
  }),
  tiempo: (d) => ({ text: `${d} no contestó a tiempo`, reason: "tiempo" }),
  muy_grande: (d) => ({
    text: `La página de ${d} es demasiado grande para leerla`,
    reason: "grande",
  }),
  tipo_no_soportado: (d) => ({
    text: `Ese enlace de ${d} no es una página ni un PDF`,
    reason: "tipo",
  }),
  no_disponible: (d) => ({ text: `El sitio de ${d} falló al abrir`, reason: "sitio" }),
};

function readStep(part: StepPart, streaming: boolean): TurnStep {
  const url = inputOf<{ url: string }>(part).url;
  if (part.state === "output-available") {
    const out = part.output as ReadLinkOutput;
    const d = out.dominio ?? domainOfUrl(out.urlFinal ?? out.url);
    if (out.estado === "ok") {
      if (out.soloDescripcion) {
        return { kind: "read", state: "part", text: `De ${d} solo había la descripción` };
      }
      if (out.truncado) {
        return {
          kind: "read",
          state: "part",
          text: `Leí solo una parte de ${d}`,
          meta: "es muy larga",
        };
      }
      return { kind: "read", state: "ok", text: `Leí ${d}` };
    }
    if (out.estado === "limite") {
      return {
        kind: "read",
        state: "skip",
        text: `No abrí ${d}: llegué al tope de ${String(WEB_READS_PER_TURN)} páginas`,
      };
    }
    // Un estado que esta versión no conoce (una API más nueva con la pestaña
    // vieja abierta) no tumba el mensaje: cae al genérico.
    const fail = (READ_FAILS[out.estado] as ((d: string) => ReadFail) | undefined) ?? genericFail;
    return { kind: "read", state: "fail", ...fail(d) };
  }
  const d = domainOfUrl(url);
  if (part.state === "output-error") return { kind: "read", state: "fail", ...genericFail(d) };
  return streaming
    ? { kind: "read", state: "live", text: `Leyendo ${d}…` }
    : { kind: "read", state: "stop", text: `Lectura detenida: ${d}`, target: d };
}

function cardStep(part: CardToolPart, streaming: boolean): TurnStep {
  const network = networkOfCardPart(part);
  const red = network ? ` para ${NETWORK_LABELS[network]}` : "";
  if (part.state === "output-available") {
    return { kind: "card", state: "ok", text: `Borrador${red}` };
  }
  if (part.state === "output-error") {
    return { kind: "card", state: "error", text: `No pude crear el borrador${red}` };
  }
  return streaming
    ? { kind: "card", state: "live", text: `Creando borrador${red}…` }
    : { kind: "card", state: "stop", text: `Se detuvo el borrador${red}` };
}

/** Los pasos de una respuesta en su orden. Un tool sin output solo sigue en curso mientras el turno llega. */
export function turnSteps(parts: readonly StepPart[], streaming: boolean): TurnStep[] {
  return parts.map((part) =>
    isCardToolPart(part)
      ? cardStep(part, streaming)
      : part.type === `tool-${READ_LINK_TOOL_NAME}`
        ? readStep(part, streaming)
        : searchStep(part, streaming),
  );
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** "Busqué 1 vez, leí 2 páginas y creé 1 borrador": solo lo que sí pasó. */
function doneLabel(steps: readonly TurnStep[]): string | null {
  const searches = steps.filter(
    (s) => s.kind === "search" && (s.state === "ok" || s.reason === "sin_resultados"),
  ).length;
  const reads = steps.filter(
    (s) => s.kind === "read" && (s.state === "ok" || s.state === "part"),
  ).length;
  const cards = steps.filter((s) => s.kind === "card" && s.state === "ok").length;
  const pieces = [
    searches > 0 ? `busqué ${String(searches)} ${plural(searches, "vez", "veces")}` : null,
    reads > 0 ? `leí ${String(reads)} ${plural(reads, "página", "páginas")}` : null,
    cards > 0 ? `creé ${String(cards)} ${plural(cards, "borrador", "borradores")}` : null,
  ].filter((p): p is string => p !== null);
  if (pieces.length === 0) return null;
  const text =
    pieces.length === 1 ? pieces[0]! : `${pieces.slice(0, -1).join(", ")} y ${pieces.at(-1)!}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function stepsHeader(steps: readonly TurnStep[]): StepsHeader | null {
  if (steps.length === 0) return null;
  const live = [...steps].reverse().find((s) => s.state === "live");
  if (live) return { state: "live", label: live.text };

  const stopped = steps.find((s) => s.state === "stop");
  if (stopped) {
    if (stopped.kind === "read") {
      return { state: "stop", label: `Detuviste la lectura de ${stopped.target ?? "la página"}` };
    }
    if (stopped.kind === "search") return { state: "stop", label: stopped.text };
    const cards = steps.filter((s) => s.kind === "card").length;
    return {
      state: "stop",
      label: `Se detuvo la creación ${cards === 1 ? "del borrador" : "de los borradores"}`,
    };
  }

  // Un solo paso de la web no tiene lista que abrir: el encabezado es el paso
  // mismo, con su dominio o su consulta ("Busqué 'café' · 5 resultados").
  if (!stepsExpandable(steps)) {
    const only = steps[0]!;
    return {
      state:
        only.state === "skip"
          ? "limit"
          : only.state === "ok" || only.state === "part"
            ? "done"
            : "fail",
      label: only.meta ? `${only.text} · ${only.meta}` : only.text,
    };
  }

  // El tope manda en el resumen solo si no salió un borrador: lo que el
  // creator vino a buscar es el borrador, y el tope sigue en la lista.
  const skip = steps.find((s) => s.state === "skip");
  if (skip && !steps.some((s) => s.kind === "card" && s.state === "ok")) {
    return {
      state: "limit",
      // El tope cuenta intentos, no lecturas buenas: "llegué al tope", no "ya leí 3".
      label:
        skip.kind === "read"
          ? `Llegué al tope de ${String(WEB_READS_PER_TURN)} páginas en este mensaje`
          : `Llegué al tope de ${String(WEB_SEARCHES_PER_TURN)} búsquedas en este mensaje`,
    };
  }

  const done = doneLabel(steps);
  if (done) return { state: "done", label: done };
  // Nada salió: el primer motivo lo dice todo ("No pude leer instagram.com: pide iniciar sesión").
  return { state: "fail", label: steps[0]!.text };
}

/** Con un solo paso, el encabezado ya lo dice todo: no hay lista que abrir. */
export function stepsExpandable(steps: readonly TurnStep[]): boolean {
  return steps.length > 1 || steps.some((s) => s.kind === "card");
}
