import { useRef, useState, type DragEvent } from "react";
import { ATTACHMENT_IMAGE_MIME_TYPES } from "@presencia/shared";
import { room } from "./attachments.js";

/** Qué pasa si se suelta lo que se está arrastrando. */
export type DropVerdict = "accept" | "type" | "limit";

// Arrastrar y soltar archivos sobre una zona (F10.9): la columna del chat, no
// toda la ventana. Mientras se arrastra, el navegador NO deja leer los nombres
// de los archivos, solo sus tipos: con eso se adelanta el rechazo de un tipo
// que no se acepta. Un .md o un .csv suelen llegar sin tipo; esos pasan y, si
// no eran texto, su chip lo dice al soltar.

const ACCEPTED_TYPES = new Set<string>([
  ...ATTACHMENT_IMAGE_MIME_TYPES,
  "application/pdf",
  "application/json",
]);

function acceptedType(type: string): boolean {
  return type === "" || type.startsWith("text/") || ACCEPTED_TYPES.has(type);
}

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}

/** El veredicto de lo que se arrastra, con lo que el navegador deja ver. */
export function dropVerdict(types: string[], current: number): DropVerdict {
  if (room(current) === 0) return "limit";
  return types.length > 0 && !types.some(acceptedType) ? "type" : "accept";
}

export function useFileDrop({
  current,
  onFiles,
  disabled = false,
}: {
  /** Cuántos adjuntos tiene ya el composer. */
  current: number;
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}) {
  const [drag, setDrag] = useState<{ verdict: DropVerdict; count: number } | null>(null);
  // dragenter/dragleave se disparan también al pasar sobre cada hijo: se
  // cuenta la profundidad para saber cuándo se salió de verdad de la zona.
  const depth = useRef(0);

  const handlers = {
    onDragEnter(event: DragEvent) {
      if (disabled || !hasFiles(event)) return;
      event.preventDefault();
      depth.current += 1;
      const items = Array.from(event.dataTransfer.items).filter((item) => item.kind === "file");
      setDrag({
        verdict: dropVerdict(
          items.map((item) => item.type),
          current,
        ),
        count: items.length,
      });
    },
    onDragOver(event: DragEvent) {
      if (disabled || !hasFiles(event)) return;
      // Sin esto, el navegador abre el archivo en la pestaña al soltarlo.
      event.preventDefault();
      event.dataTransfer.dropEffect = drag?.verdict === "accept" ? "copy" : "none";
    },
    onDragLeave(event: DragEvent) {
      if (disabled || !hasFiles(event)) return;
      depth.current = Math.max(depth.current - 1, 0);
      if (depth.current === 0) setDrag(null);
    },
    onDrop(event: DragEvent) {
      if (disabled || !hasFiles(event)) return;
      event.preventDefault();
      depth.current = 0;
      const verdict = drag?.verdict;
      setDrag(null);
      if (verdict === "limit") return;
      onFiles(Array.from(event.dataTransfer.files));
    },
  };

  return { drag, handlers };
}
