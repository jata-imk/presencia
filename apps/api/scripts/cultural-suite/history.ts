// Conversaciones de varios turnos para la suite (F10.11). Un caso de releer
// necesita que el adjunto ya haya salido de la ventana (o del todo, al
// resumen), y eso solo pasa con turnos anteriores. Se arma por el mismo
// camino que el chat de producción: los bytes por `processAttachment`, el
// contexto por `assembleContext` (resumen, dieta de adjuntos, techo) y las
// imágenes como `data:` (`withAttachmentBytes`, lo que hace `materialize`).

import { randomUUID } from "node:crypto";
import { convertToModelMessages, type ModelMessage, type ToolSet, type UIMessage } from "ai";
import { attachmentContentUrl } from "@presencia/shared";
import { processAttachment } from "../../src/attachments/attachment-content.js";
import {
  attachmentIdsIn,
  withAttachmentBytes,
  type AttachmentForContext,
} from "../../src/chat/attachment-context.js";
import { assembleContext } from "../../src/chat/context-builder.js";
import type { HistorySummary } from "../../src/chat/history-window.js";

/** Un archivo de un turno anterior, con la descripción que ya le habría puesto `content_digest`. */
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
): Promise<{ messages: ModelMessage[]; notes: string[] }> {
  const rows = new Map<string, AttachmentForContext>();
  const loaded = new Map<string, string | null>();
  const names = new Map<string, string>();

  const partsOf = async (turn: SuiteTurn): Promise<UIMessage["parts"]> => {
    const parts: UIMessage["parts"] = [];
    for (const file of turn.attachments ?? []) {
      const processed = await processAttachment(await file.build(), file.filename);
      const id = randomUUID();
      names.set(id, file.filename);
      rows.set(id, {
        id,
        kind: processed.kind,
        filename: file.filename,
        pages: processed.pages,
        scanned: processed.scanned,
        extractedText: processed.extractedText,
        truncated: processed.truncated,
        tokenEstimate: processed.tokenEstimate,
        description: file.description ?? null,
      });
      loaded.set(
        id,
        `data:${processed.mimeType};base64,${Buffer.from(processed.modelData ?? processed.data).toString("base64")}`,
      );
      parts.push({
        type: "file",
        mediaType: processed.mimeType,
        filename: file.filename,
        url: attachmentContentUrl(id),
      });
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
  const full = new Set(attachmentIdsIn(context.messages));
  const summarized = new Set(
    summaryAt === undefined ? [] : attachmentIdsIn(history.slice(0, summaryAt + 1)),
  );
  const notes = [...names].map(([id, filename]) =>
    full.has(id)
      ? `\`${filename}\`: viaja completo (en la ventana).`
      : summarized.has(id)
        ? `\`${filename}\`: quedó en el tramo resumido; el modelo solo ve el resumen.`
        : `\`${filename}\`: fuera de la ventana, viaja como su línea de descripción.`,
  );

  return {
    messages: await convertToModelMessages(withAttachmentBytes(context.messages, loaded), {
      tools,
    }),
    notes,
  };
}
