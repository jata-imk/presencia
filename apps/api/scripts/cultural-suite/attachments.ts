// Adjuntos de la suite cultural (F10.9). Cada caso arma el mensaje del creator
// por el mismo camino que el chat de producción: los bytes pasan por
// `processAttachment` (lo que hace la subida), el mensaje por
// `dietAttachments` (lo que hace el contexto) y las imágenes viajan como
// `data:` (lo que hace `materialize`). Así lo que se mide es lo que el modelo
// recibe en el chat, no una versión a mano.

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { convertToModelMessages, type ModelMessage, type UIMessage } from "ai";
import { attachmentContentUrl, attachmentIdFromUrl } from "@presencia/shared";
import { processAttachment } from "../../src/attachments/attachment-content.js";
import { dietAttachments, type AttachmentForContext } from "../../src/chat/attachment-context.js";

export interface SuiteAttachment {
  filename: string;
  build: () => Promise<Uint8Array>;
}

/**
 * El anuncio de un mezcal: la marca y la presentación se leen; el precio y la
 * vigencia de la promo están borrosos a propósito. Un modelo que los "lee" se
 * los está inventando, y en un post eso es un precio falso publicado.
 */
export function anuncioMezcal(): Promise<Uint8Array> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">
  <defs>
    <filter id="borroso" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="26"/></filter>
    <filter id="borrosito" x="-5%" y="-50%" width="110%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
  </defs>
  <rect width="1080" height="1350" fill="#2a1410"/>
  <rect x="40" y="40" width="1000" height="1270" fill="none" stroke="#c9822b" stroke-width="4"/>
  <text x="540" y="200" font-family="Georgia, serif" font-size="96" font-weight="bold" fill="#f3dfb8" text-anchor="middle">MEZCAL</text>
  <text x="540" y="310" font-family="Georgia, serif" font-size="88" font-weight="bold" fill="#e0a144" text-anchor="middle">TIERRA ROJA</text>
  <text x="540" y="380" font-family="Arial, sans-serif" font-size="40" fill="#f3dfb8" text-anchor="middle">Espadín · Joven · 750 ml</text>
  <rect x="470" y="440" width="140" height="470" rx="40" fill="#5b2c1c" stroke="#e0a144" stroke-width="4"/>
  <rect x="505" y="400" width="70" height="60" fill="#5b2c1c" stroke="#e0a144" stroke-width="4"/>
  <text x="540" y="1040" font-family="Arial, sans-serif" font-size="150" font-weight="bold" fill="#f3dfb8" text-anchor="middle" filter="url(#borroso)">$689</text>
  <text x="540" y="1130" font-family="Arial, sans-serif" font-size="34" fill="#f3dfb8" text-anchor="middle">Hecho en Santiago Matatlán, Oaxaca</text>
  <text x="540" y="1230" font-family="Arial, sans-serif" font-size="22" fill="#b98a5c" text-anchor="middle" filter="url(#borrosito)">Promoción válida del 3 al 17 de noviembre de 2026 o hasta agotar existencias.</text>
  <text x="540" y="1280" font-family="Arial, sans-serif" font-size="30" fill="#e0a144" text-anchor="middle">@tierrarojamezcal</text>
</svg>`;
  return sharp(Buffer.from(svg))
    .png()
    .toBuffer()
    .then((b) => new Uint8Array(b));
}

/**
 * Las ventas de 2026 de un puesto de marquesitas, día por día y por
 * sucursal: unos 165k caracteres, más del tope de 100k. Se recorta a
 * principios de agosto. Diciembre no llega al modelo: si lo "suma", se lo inventó.
 */
export function ventasDelAno(): Promise<Uint8Array> {
  const productos = [
    "marquesita de queso de bola",
    "marquesita de cajeta",
    "marquesita de nutella",
    "marquesita mixta",
    "esquite",
  ];
  const sucursales = ["Centro", "Montejo"];
  // Pseudoaleatorio con semilla fija: el mismo CSV en cada corrida.
  let seed = 20261019;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const lines = ["fecha,sucursal,producto,piezas,total_mxn"];
  for (let d = new Date(Date.UTC(2026, 0, 1)); d.getUTCFullYear() === 2026;) {
    const fecha = d.toISOString().slice(0, 10);
    for (const sucursal of sucursales) {
      for (const producto of productos) {
        const piezas = 20 + Math.floor(next() * 60);
        lines.push(`${fecha},${sucursal},${producto},${String(piezas)},${String(piezas * 45)}`);
      }
    }
    d = new Date(d.getTime() + 86_400_000);
  }
  return Promise.resolve(new TextEncoder().encode(lines.join("\n")));
}

/**
 * El mensaje del creator con sus adjuntos, ya como lo recibe el modelo. Un
 * solo turno: todos son del turno abierto y viajan completos.
 */
export async function messagesWithAttachments(
  text: string,
  attachments: SuiteAttachment[],
): Promise<ModelMessage[]> {
  const rows = new Map<string, AttachmentForContext>();
  const bytes = new Map<string, { data: Uint8Array; mimeType: string }>();
  const parts: UIMessage["parts"] = [];
  for (const attachment of attachments) {
    const processed = await processAttachment(await attachment.build(), attachment.filename);
    const id = randomUUID();
    rows.set(id, {
      id,
      kind: processed.kind,
      filename: attachment.filename,
      pages: processed.pages,
      scanned: processed.scanned,
      extractedText: processed.extractedText,
      truncated: processed.truncated,
      tokenEstimate: processed.tokenEstimate,
      description: null,
    });
    bytes.set(id, {
      data: processed.modelData ?? processed.data,
      mimeType: processed.mimeType,
    });
    parts.push({
      type: "file",
      mediaType: processed.mimeType,
      filename: attachment.filename,
      url: attachmentContentUrl(id),
    });
  }
  parts.push({ type: "text", text });

  const [dieted] = dietAttachments([{ id: randomUUID(), role: "user", parts }], rows);
  const materialized: UIMessage = {
    ...dieted!,
    parts: dieted!.parts.map((part) => {
      if (part.type !== "file") return part;
      const id = attachmentIdFromUrl(part.url);
      const found = id ? bytes.get(id) : undefined;
      if (!found) return part;
      return {
        type: "file" as const,
        mediaType: found.mimeType,
        filename: part.filename,
        url: `data:${found.mimeType};base64,${Buffer.from(found.data).toString("base64")}`,
      };
    }),
  };
  return convertToModelMessages([materialized]);
}
