import { z } from "zod";

// Memoria entre chats (F10.8): la tool con la que el chat busca en las
// conversaciones anteriores del creator. Vive aquí porque la usan los dos
// lados: la API la declara y la web reconoce su part para no pintarla como
// una card de publicación.

export const MEMORY_TOOL_NAME = "buscar_en_memoria";

export const memorySearchInputSchema = z.object({
  /** Qué buscar, en palabras del creator: "la promo del 2x1", "lo del aniversario". */
  consulta: z.string().trim().min(3).max(200),
});
export type MemorySearchInput = z.infer<typeof memorySearchInputSchema>;

export interface MemoryHit {
  /** El intercambio recordado, como texto (creator y Presencia). */
  fragmento: string;
  /** Título del chat donde pasó. */
  chat: string;
  /** ISO 8601. */
  fecha: string;
}

export interface MemorySearchOutput {
  resultados: MemoryHit[];
}
