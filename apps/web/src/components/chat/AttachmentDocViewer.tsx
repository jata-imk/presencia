import type { FileUIPart } from "ai";
import { Copy, Download, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal.js";
import { FileTile } from "./FileTile.js";

// La vista de un archivo adjunto (F10.9, Claude Design "Chat Adjuntos" §4.4 y
// §4.5): un texto con sus números de línea y "Copiar", o un PDF. El PDF va en
// el visor del navegador (un iframe): ya trae páginas, zoom y búsqueda, y uno
// propio sería pdf.js entero en la web para lo mismo.

export function AttachmentDocViewer({ part, onClose }: { part: FileUIPart; onClose: () => void }) {
  const pdf = part.mediaType === "application/pdf";
  const name = part.filename ?? "archivo";
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (pdf) return;
    let alive = true;
    fetch(part.url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
        const body = await res.text();
        if (alive) setText(body);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [part.url, pdf]);

  function copy() {
    if (text === null) return;
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const lines = text?.split("\n") ?? [];

  return (
    <Modal
      onClose={onClose}
      labelledBy="adjunto-titulo"
      maxWidth="max-w-[820px]"
      panelClassName="flex h-[86vh] flex-col overflow-hidden"
    >
      <div className="flex items-center gap-2.5 border-b border-line px-3.5 py-3">
        <FileTile name={name} kind={pdf ? "pdf" : "text"} size={34} />
        <div className="min-w-0 flex-1">
          <h2 id="adjunto-titulo" className="truncate font-display text-sm font-bold text-fg">
            {name}
          </h2>
          <p className="text-xs text-fg-muted">
            {pdf ? "PDF" : "Archivo de texto"} · de tu mensaje
          </p>
        </div>
        {!pdf && (
          <button
            type="button"
            onClick={copy}
            disabled={text === null}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-fg-secondary hover:bg-surface hover:text-fg disabled:opacity-50"
          >
            <Copy size={13} aria-hidden />
            {copied ? "Copiado" : "Copiar"}
          </button>
        )}
        <a
          href={part.url}
          download={name}
          aria-label="Descargar"
          className="flex size-8 items-center justify-center rounded-md text-fg-secondary hover:bg-surface hover:text-fg"
        >
          <Download size={15} aria-hidden />
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="flex size-8 items-center justify-center rounded-md text-fg-secondary hover:bg-surface hover:text-fg"
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      {pdf ? (
        <iframe src={part.url} title={name} className="min-h-0 flex-1 bg-surface" />
      ) : failed ? (
        <p className="p-6 text-sm text-error-fg">No se pudo abrir este archivo.</p>
      ) : text === null ? (
        <p className="p-6 text-sm text-fg-muted">Abriendo…</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto py-4 font-mono text-[13px] leading-[1.75] text-fg">
          {lines.map((line, i) => (
            <div key={i} className="flex">
              <span className="w-12 shrink-0 pr-4 text-right text-fg-muted select-none">
                {i + 1}
              </span>
              <span className="pr-4 whitespace-pre">{line}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
