import { Copy } from "lucide-react";
import { useState } from "react";

// Burbuja del usuario (Chat Conversation.html, MessageUser). Plum con texto
// blanco en claro; en oscuro el mockup invierte a Blush Pop con texto plum
// — exactamente lo que --interactive-primary/--interactive-primary-fg ya
// hacen (design-tokens.md, "el CTA primario invierte en dark"), así que se
// reusan esos tokens en vez de crear --bubble-user-* nuevos.
//
// Sin timestamp: el UIMessage que sirve la API no trae createdAt por
// mensaje (chat.service.ts toUIMessage() solo manda id/role/parts) —
// mostrar "hace 3 min" inventado violaría la regla de no fabricar datos
// (mismo criterio que TimeChips sin badges de % falsos). Sin "Editar": no
// hay edición de mensajes pasados implementada.
export function MessageUser({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div
      className="group flex flex-col items-end gap-1"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="relative max-w-[88%] sm:max-w-[72%]">
        <div className="rounded-[12px_12px_3px_12px] bg-primary px-[15px] py-[11px] shadow-sm">
          <p className="text-[14px] leading-[1.55] whitespace-pre-wrap text-primary-fg">{text}</p>
        </div>
        {hovered && (
          <button
            type="button"
            aria-label={copied ? "Copiado" : "Copiar mensaje"}
            onClick={handleCopy}
            className="absolute top-1 -left-9 flex size-7 items-center justify-center rounded-md border border-line bg-card text-fg-muted shadow-sm transition-colors hover:text-fg"
          >
            <Copy size={12} strokeWidth={1.75} />
          </button>
        )}
      </div>
    </div>
  );
}
