import { isToolUIPart, type UIMessage } from "ai";

type Part = UIMessage["parts"][number];

/**
 * Las partes de una respuesta que se cortó o falló, listas para guardarse
 * (F10.8.2). Se guarda lo que alcanzó a escribirse, pero solo lo que puede
 * volver a viajar al modelo en los turnos siguientes sin romper el request:
 *
 * - **Tools sin terminar fuera.** Una tool que se quedó en `input-streaming` o
 *   `input-available` viajaría como tool-call sin resultado, y el proveedor lo
 *   rechaza. La UI ya las escondía al terminar el stream (CardBlock).
 * - **Razonamiento fuera.** Uno cortado puede no traer su contenido cifrado
 *   completo, y no aporta nada a la conversación.
 * - **Sin metadata del proveedor.** Con `store` activo, OpenAI manda el texto y
 *   las tools como `item_reference` a su `itemId`, y un item de una respuesta
 *   cancelada puede no existir de su lado: el turno siguiente daría 400. Sin
 *   el id, viajan como contenido normal. Es la regla del reasoning item
 *   (ADR-006, addendum F4.5) al revés: aquí no queda reasoning que acompañar.
 */
export function sanitizeInterruptedParts(parts: UIMessage["parts"]): UIMessage["parts"] {
  return parts.flatMap((part): Part[] => {
    if (part.type === "reasoning") return [];
    // `undefined` y no borrar la llave: el jsonb no guarda las que valen
    // undefined, y así el tipo de la parte no cambia.
    if (part.type === "text") return [{ ...part, state: "done", providerMetadata: undefined }];
    if (isToolUIPart(part)) {
      if (part.state !== "output-available" && part.state !== "output-error") return [];
      return [{ ...part, callProviderMetadata: undefined }];
    }
    return [part];
  });
}
