import { socialNetworkSchema, type SocialNetwork } from "@presencia/shared";
import type { CardToolPart } from "./chat-types.js";

// Los intentos de crear una card que el propio modelo corrigió en el mismo
// turno. Caso real de prod (2026-10-11): para "LinkedIn y Facebook, solo
// imágenes", el modelo llamó a `crear_borrador_texto` con Facebook (esa tool
// no acepta Facebook), vio el rechazo y en el paso siguiente la creó con
// `crear_borrador_visual`. La card salió bien, pero el chat pintaba "No pude
// crear el borrador para Facebook" y una fila roja en el grupo: un error que
// al creator ya no le cuesta nada, mostrado como si sí.
//
// Un fallo se esconde solo si DESPUÉS, en el mismo mensaje, hay una card de
// esa misma red que lo corrige, y cada card corrige UN fallo: si se pidieron
// tres variantes y fallaron dos, una card que sí salió no tapa las dos que
// faltan. Si nunca se corrige, el error se queda: ahí sí falta algo.

/** La red de una card que ya existe, o la que se pidió si es una red válida. */
export function networkOfCardPart(part: CardToolPart): SocialNetwork | null {
  if (part.state === "output-available") return part.output.network;
  // Mientras llega el input, `network` puede no existir todavía o venir a
  // medias; en un intento rechazado puede ser cualquier cosa. Solo cuenta si
  // es una red válida.
  const raw = (part.input as { network?: unknown } | undefined)?.network;
  const parsed = socialNetworkSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Las partes sin los intentos fallidos que el modelo corrigió después. Con
 * `streaming`, un reintento que todavía se está escribiendo ya cuenta como la
 * corrección: si no, el error falso se vería un momento y luego se iría.
 */
export function withoutCorrectedAttempts(parts: CardToolPart[], streaming = false): CardToolPart[] {
  // De atrás para adelante: cada card que salió (o que viene en camino)
  // queda disponible para corregir un solo fallo anterior de su red.
  const fixes = new Map<SocialNetwork, number>();
  const hidden = new Set<CardToolPart>();
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i]!;
    const network = networkOfCardPart(part);
    if (!network) continue;
    if (part.state === "output-error") {
      const available = fixes.get(network) ?? 0;
      if (available > 0) {
        hidden.add(part);
        fixes.set(network, available - 1);
      }
    } else if (part.state === "output-available" || streaming) {
      fixes.set(network, (fixes.get(network) ?? 0) + 1);
    }
  }
  return hidden.size === 0 ? parts : parts.filter((part) => !hidden.has(part));
}
