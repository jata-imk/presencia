import { attachmentIdFromUrl, type AttachmentKind } from "@presencia/shared";
import type { FileUIPart } from "ai";
import { useState } from "react";
import { middleEllipsis } from "../../lib/attachments/attachments.js";
import { ImageViewer } from "../ui/ImageViewer.js";
import { AttachmentDocViewer } from "./AttachmentDocViewer.js";
import { FileTile } from "./FileTile.js";

// Los adjuntos de un mensaje enviado, dentro de su burbuja (F10.9, Claude
// Design "Chat Adjuntos" §4): las imágenes en grilla (1, 2, 3, y 4 con "+N"
// si hay más) y los archivos como tarjetas. Clic en una imagen abre el visor a
// pantalla completa; en un archivo, su vista (el texto, o el PDF).

/** Qué es un adjunto, por su tipo (el que guardó la API, no el del navegador). */
export function kindOfPart(part: FileUIPart): AttachmentKind {
  if (part.mediaType.startsWith("image/")) return "image";
  if (part.mediaType === "application/pdf") return "pdf";
  return "text";
}

const TYPE_LABEL: Record<AttachmentKind, string> = {
  image: "Imagen",
  pdf: "PDF",
  text: "Archivo de texto",
};

export function MessageAttachments({ files }: { files: FileUIPart[] }) {
  const images = files.filter((part) => kindOfPart(part) === "image");
  const docs = files.filter((part) => kindOfPart(part) !== "image");
  const [viewing, setViewing] = useState<number | null>(null);
  const [doc, setDoc] = useState<FileUIPart | null>(null);

  return (
    <>
      {images.length > 0 && <ImageGrid images={images} onOpen={setViewing} />}
      {docs.length > 0 && (
        <div className="flex flex-col gap-1">
          {docs.map((part) => (
            <button
              key={part.url}
              type="button"
              onClick={() => setDoc(part)}
              className="flex items-center gap-2.5 rounded-[11px] bg-primary-fg/12 px-2.5 py-2 text-left text-primary-fg transition-colors hover:bg-primary-fg/20"
            >
              <FileTile name={part.filename ?? ""} kind={kindOfPart(part)} size={34} onBubble />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">
                  {middleEllipsis(part.filename ?? "archivo", 30)}
                </span>
                <span className="block text-[11.5px] opacity-75">
                  {TYPE_LABEL[kindOfPart(part)]}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {viewing !== null && (
        <ImageViewer
          items={images.map((part, i) => ({
            assetId: attachmentIdFromUrl(part.url) ?? part.url,
            src: part.url,
            alt: part.filename ?? `Imagen ${String(i + 1)}`,
            label: part.filename,
          }))}
          startIndex={viewing}
          subtitle="De tu mensaje"
          downloadable
          onClose={() => setViewing(null)}
        />
      )}
      {doc && <AttachmentDocViewer part={doc} onClose={() => setDoc(null)} />}
    </>
  );
}

/** La grilla del diseño: 1 (4:3), 2 (lado a lado), 3 (una alta y dos), 4+ (2×2, la última con "+N"). */
function ImageGrid({ images, onOpen }: { images: FileUIPart[]; onOpen: (index: number) => void }) {
  const n = images.length;
  const layout =
    n === 1
      ? "aspect-[4/3]"
      : n === 2
        ? "aspect-[2/1] grid-cols-2"
        : "aspect-square grid-cols-2 grid-rows-2";
  const shown = images.slice(0, 4);
  return (
    <div className={`grid w-full gap-[3px] overflow-hidden rounded-[14px] ${layout}`}>
      {shown.map((part, i) => (
        <button
          key={part.url}
          type="button"
          onClick={() => onOpen(i)}
          aria-label={`Ver ${part.filename ?? `imagen ${String(i + 1)}`}`}
          className={`relative min-h-0 cursor-zoom-in overflow-hidden bg-viewer ${
            n === 3 && i === 0 ? "row-span-2" : ""
          }`}
        >
          <img src={part.url} alt="" className="size-full object-cover" loading="lazy" />
          {i === 3 && n > 4 && (
            <span className="absolute inset-0 flex items-center justify-center bg-viewer/50 font-display text-2xl font-bold text-on-viewer">
              +{n - 4}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
