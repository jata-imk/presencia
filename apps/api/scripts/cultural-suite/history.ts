// Conversaciones de varios turnos para la suite (F10.11). Un caso de releer
// necesita que el adjunto ya haya salido de la ventana (o del todo, al
// resumen), y eso solo pasa con turnos anteriores. Se arma por el mismo
// camino que el chat de producción: los bytes por `processAttachment`, el
// contexto por `assembleContext` (resumen, dieta de adjuntos, techo) y las
// imágenes como `data:` (`withAttachmentBytes`, lo que hace `materialize`).

import { randomUUID } from "node:crypto";
import { convertToModelMessages, type ModelMessage, type ToolSet, type UIMessage } from "ai";
import {
  attachmentIdsIn,
  withAttachmentBytes,
  type AttachmentForContext,
} from "../../src/chat/attachment-context.js";
import { loadSuiteAttachment } from "./attachments.js";
import { suiteViewAttachmentTools, type ViewableFile } from "./view-attachment.js";
import { assembleContext } from "../../src/chat/context-builder.js";
import type { HistorySummary } from "../../src/chat/history-window.js";

/**
 * Un archivo de la conversación, con la descripción que ya le habría puesto
 * `content_digest`. Se carga igual que un `SuiteAttachment` (attachments.ts).
 */
export interface SuiteFile {
  filename: string;
  build: () => Promise<Uint8Array>;
  /** La descripción guardada. Sin ella (un adjunto del mensaje actual), `null`. */
  description?: string;
}

export interface SuiteTurn {
  role: "user" | "assistant";
  text: string;
  attachments?: SuiteFile[];
}

export interface SuiteConversation {
  /** Los mensajes anteriores al del caso, en orden. */
  history: SuiteTurn[];
  /**
   * El resumen de la compactación: cubre `history` hasta `summaryThrough`
   * (índice del último mensaje resumido, una respuesta). Lo de antes ya no
   * viaja; el modelo solo ve este texto.
   */
  summary?: { text: string; through: number };
}

const SUITE_CAP_TOKENS = 120_000;

/**
 * El mensaje del caso con su conversación, ya como lo recibe el modelo, y
 * una nota por adjunto que dice cómo viajó (completo, como su línea o solo
 * nombrado en el resumen).
 */
export async function messagesWithHistory(
  conversation: SuiteConversation,
  text: string,
  current: SuiteFile[] = [],
  tools?: ToolSet,
): Promise<{
  messages: ModelMessage[];
  notes: string[];
  /**
   * F10.11: la tool ver_adjunto, si el chat de producción la daría (hay
   * adjuntos fuera de la vista). Una fábrica: cada corrida lleva su tope.
   */
  tools: () => ToolSet;
}> {
  const rows = new Map<string, AttachmentForContext>();
  const loaded = new Map<string, string | null>();
  const names = new Map<string, string>();
  const viewable: ViewableFile[] = [];

  const partsOf = async (turn: SuiteTurn): Promise<UIMessage["parts"]> => {
    const parts: UIMessage["parts"] = [];
    for (const file of turn.attachments ?? []) {
      const { processed, row, dataUrl, part } = await loadSuiteAttachment(
        await file.build(),
        file.filename,
        file.description ?? null,
      );
      names.set(row.id, file.filename);
      viewable.push({ row, mimeType: processed.mimeType, dataUrl });
      rows.set(row.id, row);
      loaded.set(row.id, dataUrl);
      parts.push(part);
    }
    if (turn.text) parts.push({ type: "text", text: turn.text });
    return parts;
  };

  const history: UIMessage[] = [];
  for (const turn of [
    ...conversation.history,
    { role: "user" as const, text, attachments: current },
  ]) {
    history.push({ id: randomUUID(), role: turn.role, parts: await partsOf(turn) });
  }

  const summaryAt = conversation.summary?.through;
  const summary: HistorySummary | null =
    conversation.summary && summaryAt !== undefined
      ? {
          blocks: [
            { summary: conversation.summary.text, throughCreatedAt: "2026-10-27T18:00:00Z" },
          ],
          throughMessageId: history[summaryAt]!.id,
          cards: [],
        }
      : null;

  // Lo del resumen ya no se carga en producción (attachmentIdsForContext): da
  // igual pasarle la fila, porque assembleContext quita esos mensajes.
  const context = assembleContext(history, summary, new Map(), SUITE_CAP_TOKENS, rows, new Map());
  // Cómo viajó cada uno: un texto completo ya no es una parte `file` (la
  // dieta lo vuelve <adjunto>), así que lo que se busca es su línea.
  const summarized = new Set(
    summaryAt === undefined ? [] : attachmentIdsIn(history.slice(0, summaryAt + 1)),
  );
  const travelled = JSON.stringify(context.messages);
  const notes = [...names].map(([id, filename]) =>
    summarized.has(id)
      ? `\`${filename}\`: quedó en el tramo resumido; el modelo solo ve el resumen.`
      : travelled.includes(`[Adjunto de antes (`) && travelled.includes(`\\"${filename}\\", id:`)
        ? `\`${filename}\`: fuera de la ventana, viaja como su línea de descripción.`
        : `\`${filename}\`: viaja completo (en la ventana).`,
  );

  return {
    messages: await convertToModelMessages(withAttachmentBytes(context.messages, loaded), {
      tools,
    }),
    notes,
    tools: () => (context.hiddenAttachments ? suiteViewAttachmentTools(viewable) : {}),
  };
}
