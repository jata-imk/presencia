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
// Un fallo se esconde solo si DESPUÉS, en el mismo mensaje, se creó una card
// de esa misma red. Si nunca se creó, el error se queda: ahí sí falta algo.

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

/** Las partes sin los intentos fallidos que el modelo corrigió después. */
export function withoutCorrectedAttempts(parts: CardToolPart[]): CardToolPart[] {
  return parts.filter((part, index) => {
    if (part.state !== "output-error") return true;
    const network = networkOfCardPart(part);
    if (!network) return true;
    return !parts
      .slice(index + 1)
      .some((later) => later.state === "output-available" && later.output.network === network);
  });
}
