import type { AttachmentDto } from "@presencia/shared";
import type { PendingAttachment } from "../../lib/attachments/attachments.js";
import { IMAGEN_DEMO } from "./cards.js";

// Adjuntos de ejemplo para las historias del composer y del mensaje enviado
// (F10.9, Claude Design "Chat Adjuntos"). La miniatura de las imágenes es la
// imagen de demo de las cards (staticDirs sirve /api/assets/:id/content).

const PREVIEW = `/api/assets/${IMAGEN_DEMO}/content`;

let next = 0;
function dto(over: Partial<AttachmentDto>): AttachmentDto {
  next += 1;
  return {
    id: `00000000-0000-4000-8000-${String(next).padStart(12, "0")}`,
    kind: "text",
    filename: "archivo.txt",
    mediaType: "text/plain",
    sizeBytes: 3_000,
    url: PREVIEW,
    width: null,
    height: null,
    pages: null,
    scanned: false,
    truncated: false,
    tokenEstimate: 100,
    createdAt: "2026-10-19T16:42:00.000Z",
    ...over,
  };
}

function listo(name: string, size: number, over: Partial<AttachmentDto> = {}): PendingAttachment {
  const kind = over.kind ?? (name.endsWith(".png") || name.endsWith(".jpg") ? "image" : "text");
  const d = dto({ filename: name, sizeBytes: size, kind, ...over });
  return {
    key: d.id,
    name,
    size,
    kind,
    previewUrl: kind === "image" ? PREVIEW : null,
    status: "ready",
    progress: 100,
    dto: d,
    error: null,
    retryable: false,
  };
}

export const IMAGEN = listo("portada-carrusel-agentes.png", 2_516_582);
export const CAPTURA = listo("captura-estructura-del-repo.jpg", 1_153_434);
export const GUIA_MD = listo("guia-de-voz-de-marca-2026.md", 18_432, {
  mediaType: "text/markdown",
});
export const METRICAS_CSV = listo("metricas-septiembre-instagram.csv", 350_208, {
  mediaType: "text/csv",
});
export const CALENDARIO_JSON = listo("calendario-octubre.json", 9_216, {
  mediaType: "application/json",
});
export const KIT_PDF = listo("Kit-de-medios-JoseTejero-2026.pdf", 5_033_164, {
  kind: "pdf",
  mediaType: "application/pdf",
  pages: 12,
});

export function subiendo(item: PendingAttachment, progress: number): PendingAttachment {
  return { ...item, key: `${item.key}-s`, status: "uploading", progress, dto: null };
}

export const MUY_GRANDE: PendingAttachment = {
  key: "err-grande",
  name: "grabacion-tiktok-final.mov",
  size: 327_155_712,
  kind: null,
  previewUrl: null,
  status: "error",
  progress: 0,
  dto: null,
  error: "Muy grande: el límite es 25 MB",
  retryable: false,
};

export const TIPO_NO: PendingAttachment = {
  ...MUY_GRANDE,
  key: "err-tipo",
  name: "recursos-de-marca.zip",
  size: 50_331_648,
  error: "Este tipo de archivo no se puede adjuntar",
};

export const SIN_RED: PendingAttachment = {
  ...CAPTURA,
  key: "err-red",
  status: "error",
  dto: null,
  error: "No se pudo subir",
  retryable: true,
};

export const ESCANEADO = listo("Contrato-colaboracion-escaneado.pdf", 6_501_171, {
  kind: "pdf",
  mediaType: "application/pdf",
  pages: 8,
  scanned: true,
});

export const LARGO = listo("Reporte-anual-industria-creators.pdf", 15_309_209, {
  kind: "pdf",
  mediaType: "application/pdf",
  pages: 140,
  truncated: true,
});

export const ESCANEADO_LARGO: PendingAttachment = {
  ...MUY_GRANDE,
  key: "err-escaneado",
  name: "Facturas-2025-escaneadas.pdf",
  size: 23_068_672,
  kind: "pdf",
  error: "Este PDF escaneado tiene 34 páginas; el límite es 20. Súbelo en partes.",
};

export const DIEZ: PendingAttachment[] = [
  IMAGEN,
  CAPTURA,
  listo("foto-setup-escritorio.jpg", 3_879_731),
  GUIA_MD,
  METRICAS_CSV,
  CALENDARIO_JSON,
  listo("notas-para-video.txt", 3_072),
  KIT_PDF,
  listo("slide-02-el-problema.png", 812_000),
  listo("slide-03-agents-md.png", 790_000),
];
