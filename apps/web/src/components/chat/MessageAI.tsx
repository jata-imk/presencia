import { Copy, RefreshCw } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { PresenciaAvatar } from "./PresenciaAvatar.js";

// Burbuja de Presencia (Chat Conversation.html, MessageAI). bg-card +
// border-line ya coinciden exacto con los tokens msgAI/msgAIBorder del
// mockup en ambos temas (#FFFFFF/#EBEBEB claro, #1A0F20/#2D1F38 oscuro) —
// no hacen falta tokens nuevos.
//
// Sin thumbs up/down: el mockup los muestra pero no hay persistencia de
// feedback en el backend — un botón que no guarda nada sería una mentira
// silenciosa, no una versión cruda de algo real. "Regenerar" y "Copiar" sí
// son reales: regenerate() ya existe en chat.tsx (ADR-006).
export function MessageAI({
  text,
  streaming,
  canRegenerate,
  onRegenerate,
}: {
  text: string;
  streaming: boolean;
  canRegenerate: boolean;
  onRegenerate?: () => void;
}) {
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
      className="flex items-start gap-2.5"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <PresenciaAvatar size={28} />
      <div className="min-w-0 flex-1">
        <div className="relative max-w-[95%] sm:max-w-[82%]">
          <div className="rounded-[3px_12px_12px_12px] border border-line bg-card px-[15px] py-3 shadow-xs">
            {streaming && !text ? (
              <div className="flex items-center gap-1 py-0.5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="size-1.5 rounded-full bg-pink-orchid"
                    style={{ animation: `dot-pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
                  />
                ))}
              </div>
            ) : (
              <div className="markdown text-[14px] leading-[1.6] text-fg">
                <ReactMarkdown>{text}</ReactMarkdown>
                {streaming && (
                  <span
                    className="ml-0.5 inline-block h-[1em] w-0.5 translate-y-[3px] bg-pink-orchid"
                    style={{ animation: "stream-cursor 900ms step-end infinite" }}
                  />
                )}
              </div>
            )}
          </div>
          {/* absolute, no en flujo (como el botón de MessageUser) — antes
              este div se montaba/desmontaba con `hovered` dentro del flujo
              normal (mt-1 debajo de la burbuja), empujando todo lo de abajo
              en cada hover. Siempre montado, solo cambia opacity — el
              espacio para los botones nunca se "reserva" porque nunca
              ocupa espacio del documento. */}
          {!streaming && text && (
            <div
              className={`absolute top-1 -right-9 flex flex-col gap-1 transition-opacity ${
                hovered ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            >
              <button
                type="button"
                aria-label={copied ? "Copiado" : "Copiar respuesta"}
                onClick={handleCopy}
                className="flex size-[26px] items-center justify-center rounded-md border border-line bg-card text-fg-muted shadow-xs transition-colors hover:text-fg"
              >
                <Copy size={11} strokeWidth={1.75} />
              </button>
              {canRegenerate && (
                <button
                  type="button"
                  aria-label="Regenerar respuesta"
                  onClick={onRegenerate}
                  className="flex size-[26px] items-center justify-center rounded-md border border-line bg-card text-fg-muted shadow-xs transition-colors hover:text-fg"
                >
                  <RefreshCw size={11} strokeWidth={1.75} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
