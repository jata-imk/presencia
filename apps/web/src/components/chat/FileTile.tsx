import { FileJson, FileText, Image, Sheet } from "lucide-react";
import type { AttachmentKind } from "@presencia/shared";
import { extensionLabel } from "../../lib/attachments/attachments.js";

// El ícono de un archivo que no es imagen (F10.9): un cuadro con el ícono del
// tipo y su extensión abajo (MD, CSV, PDF). Lo usan el chip del composer y la
// tarjeta del mensaje enviado (`onBubble`: sobre la burbuja primaria).
export function FileTile({
  name,
  kind,
  size = 36,
  onBubble = false,
}: {
  name: string;
  kind: AttachmentKind | null;
  size?: number;
  onBubble?: boolean;
}) {
  const ext = extensionLabel(name);
  const Icon =
    kind === "image" ? Image : ext === "CSV" ? Sheet : ext === "JSON" ? FileJson : FileText;
  return (
    <span
      className={`inline-flex shrink-0 flex-col items-center justify-center gap-px rounded-lg ${
        onBubble
          ? "bg-primary-fg/15 text-primary-fg"
          : "border border-line bg-card text-fg-secondary"
      }`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Icon size={Math.round(size * 0.42)} strokeWidth={1.75} />
      <span
        className="font-display leading-none font-bold tracking-[.04em] opacity-80"
        style={{ fontSize: Math.max(7.5, size * 0.2) }}
      >
        {ext}
      </span>
    </span>
  );
}
