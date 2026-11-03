import type { UIMessageChunk } from "ai";
import {
  CARD_ARCHETYPE_TOOLS,
  MEMORY_TOOL_NAME,
  NETWORK_LABELS,
  READ_LINK_TOOL_NAME,
  VIEW_ATTACHMENT_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  domainOfUrl,
  normalizeAttachmentRef,
  type CardContent,
  type SocialNetwork,
  type WebSourcePart,
} from "@presencia/shared";

// Lo que va llegando de un turno, leído del stream del AI SDK (F11 PR4): el
// texto, las tools y si terminó en error. Puro: TelegramSink lo pinta, y se
// prueba sin Telegram.
//
// La línea de paso usa las mismas palabras que la lista de pasos de la web
// (apps/web/src/lib/turn-steps.ts), solo en su forma "en curso": en Telegram
// no hay lista que abrir, solo el draft mientras corre.

const CARD_TOOLS = new Set<string>(CARD_ARCHETYPE_TOOLS.map((t) => t.toolName));

interface ToolState {
  name: string;
  input?: unknown;
  output?: unknown;
  done: boolean;
  failed: boolean;
}

/** Una card que el turno creó: lo que hace falta para su mensaje en Telegram. */
export interface TurnCard {
  cardId: string;
  network: SocialNetwork;
  content: CardContent;
}

// El modelo pide un adjunto por su id: eso no se le enseña al creator.
const LOOKS_LIKE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

function field(input: unknown, key: string): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** "Buscando 'café en Mérida'…": lo que hace una tool que todavía corre. */
export function stepLine(name: string, input: unknown): string {
  if (name === WEB_SEARCH_TOOL_NAME) {
    const consulta = field(input, "consulta");
    return consulta ? `Buscando '${consulta}'…` : "Buscando en la web…";
  }
  if (name === READ_LINK_TOOL_NAME) return `Leyendo ${domainOfUrl(field(input, "url"))}…`;
  if (name === VIEW_ATTACHMENT_TOOL_NAME) {
    const ref = normalizeAttachmentRef(field(input, "adjunto") ?? "");
    return `Volviendo a ver ${ref && !LOOKS_LIKE_ID.test(ref) ? ref : "un adjunto"}…`;
  }
  if (name === MEMORY_TOOL_NAME) return "Buscando en tus otros chats…";
  if (CARD_TOOLS.has(name)) {
    const network = field(input, "network") as SocialNetwork | undefined;
    const label = network ? NETWORK_LABELS[network] : undefined;
    return label ? `Creando borrador para ${label}…` : "Creando borrador…";
  }
  return "Trabajando en tu respuesta…";
}

export class TurnProgress {
  private readonly texts: string[] = [];
  private readonly textIndex = new Map<string, number>();
  private readonly tools = new Map<string, ToolState>();
  /** El texto del error que mandó el turno (`onError`), si lo hubo. */
  error: string | null = null;
  /** Cambia con cada chunk que mueve lo que se ve: el draft solo se manda si cambió. */
  version = 0;

  apply(chunk: UIMessageChunk): void {
    switch (chunk.type) {
      case "text-start":
        this.textIndex.set(chunk.id, this.texts.push("") - 1);
        break;
      case "text-delta": {
        let i = this.textIndex.get(chunk.id);
        if (i === undefined)
          i = this.textIndex.set(chunk.id, this.texts.push("") - 1).get(chunk.id)!;
        this.texts[i] += chunk.delta;
        this.version++;
        break;
      }
      case "tool-input-start":
        this.tools.set(chunk.toolCallId, { name: chunk.toolName, done: false, failed: false });
        this.version++;
        break;
      case "tool-input-available": {
        const tool = this.tools.get(chunk.toolCallId);
        if (tool) tool.input = chunk.input;
        else {
          this.tools.set(chunk.toolCallId, {
            name: chunk.toolName,
            input: chunk.input,
            done: false,
            failed: false,
          });
        }
        this.version++;
        break;
      }
      case "tool-output-available": {
        const tool = this.tools.get(chunk.toolCallId);
        if (tool) Object.assign(tool, { output: chunk.output, done: true });
        this.version++;
        break;
      }
      case "tool-input-error":
      case "tool-output-error":
      case "tool-output-denied": {
        const tool = this.tools.get(chunk.toolCallId);
        if (tool) Object.assign(tool, { done: true, failed: true });
        this.version++;
        break;
      }
      case "error":
        this.error = chunk.errorText;
        this.version++;
        break;
      default:
        break;
    }
  }

  /** El texto de la respuesta: sus partes en orden, separadas como párrafos. */
  get text(): string {
    return this.texts
      .map((t) => t.trim())
      .filter(Boolean)
      .join("\n\n");
  }

  /** La tool que sigue corriendo (la última), en palabras; null si ninguna. */
  get currentStep(): string | null {
    const running = [...this.tools.values()].filter((t) => !t.done);
    const last = running.at(-1);
    return last ? stepLine(last.name, last.input) : null;
  }

  /** Las cards que el turno sí creó, en orden. */
  get cards(): TurnCard[] {
    return [...this.tools.values()].flatMap((t) => {
      if (!CARD_TOOLS.has(t.name) || !t.done || t.failed || !t.output) return [];
      const out = t.output as Partial<TurnCard>;
      return out.cardId && out.network && out.content
        ? [{ cardId: out.cardId, network: out.network, content: out.content }]
        : [];
    });
  }

  /** Las partes como las lee `webSources` (texto y tools terminadas). */
  get sourceParts(): WebSourcePart[] {
    const tools: WebSourcePart[] = [...this.tools.values()]
      .filter((t) => t.done && !t.failed)
      .map((t) => ({ type: `tool-${t.name}`, state: "output-available", output: t.output }));
    return [{ type: "text", text: this.text }, ...tools];
  }
}
