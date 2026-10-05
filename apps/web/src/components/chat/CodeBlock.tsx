import { Check, Code2, Copy } from "lucide-react";
import { isValidElement, useRef, useState, type ReactNode } from "react";
import { Tooltip } from "../ui/Tooltip.js";

// Bloque de código del chat (F10.6.2): lo que el modelo escribe entre ```.
// Antes salía como un <pre> sin estilo: sus líneas no se cortan, así que en
// móvil empujaban el ancho de TODO el chat (scroll horizontal de la página),
// y el fondo del código inline se pintaba línea por línea. Ahora es una
// caja con su propio scroll, el lenguaje arriba y "Copiar", como en Claude o
// ChatGPT. Sin colores de sintaxis a propósito: Presencia no es una
// herramienta de código y un resaltador no se paga (decisión de Jose).

/** "language-ts" → "ts"; sin lenguaje, "Texto". */
export function codeLanguage(className: string | undefined): string {
  const match = /(?:^|\s)language-([\w+#.-]+)/.exec(className ?? "");
  return match?.[1] ?? "Texto";
}

export function CodeBlock({ children }: { children?: ReactNode }) {
  const pre = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  // react-markdown entrega <pre><code class="language-x">…</code></pre>.
  const className = isValidElement<{ className?: string }>(children)
    ? children.props.className
    : undefined;

  function copy() {
    const text = pre.current?.textContent ?? "";
    void navigator.clipboard.writeText(text.replace(/\n$/, "")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="my-3 min-w-0 overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line py-1.5 pr-1.5 pl-3">
        <Code2 size={14} strokeWidth={2} className="shrink-0 text-fg-muted" aria-hidden />
        <span className="font-display text-xs font-semibold text-fg-secondary">
          {codeLanguage(className)}
        </span>
        <div className="flex-1" />
        <Tooltip label={copied ? "Copiado" : "Copiar código"}>
          <button
            type="button"
            onClick={copy}
            aria-label={copied ? "Copiado" : "Copiar código"}
            className="flex size-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-secondary-hover hover:text-fg"
          >
            {copied ? (
              <Check size={14} strokeWidth={2} className="text-success" aria-hidden />
            ) : (
              <Copy size={14} strokeWidth={1.75} aria-hidden />
            )}
          </button>
        </Tooltip>
      </div>
      {/* El scroll horizontal vive AQUÍ, no en la página. tabIndex: con
          teclado también se puede desplazar un bloque que desborda. */}
      <pre
        ref={pre}
        tabIndex={0}
        className="overflow-x-auto px-3.5 py-3 font-mono text-[13px] leading-relaxed text-fg outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-inset"
      >
        {children}
      </pre>
    </div>
  );
}
