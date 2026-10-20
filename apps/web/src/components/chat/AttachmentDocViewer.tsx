import { attachmentIdFromUrl } from "@presencia/shared";
import type { FileUIPart } from "ai";
import { Copy, Download, ExternalLink, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api.js";
import { Modal } from "../ui/Modal.js";
import { FileTile } from "./FileTile.js";

// La vista de un archivo adjunto (F10.9, Claude Design "Chat Adjuntos" §4.4 y
// §4.5): un texto con sus números de línea y "Copiar", o un PDF. El PDF va en
// el visor del navegador (un iframe): ya trae páginas, zoom y búsqueda, y uno
// propio sería pdf.js entero en la web para lo mismo. Donde el navegador no lo
// muestra dentro de un iframe (casi todos los móviles), "Abrir en otra
// pestaña" lo abre con su visor.
//
// El texto sale de la API (`/text`, el que se extrajo al subirlo) y no del
// archivo: en prod el archivo redirige al bucket, en otro dominio, y un
// fetch ahí no pasa CORS; además ya viene en UTF-8 y con su tope.

export function AttachmentDocViewer({ part, onClose }: { part: FileUIPart; onClose: () => void }) {
  const pdf = part.mediaType === "application/pdf";
  const name = part.filename ?? "archivo";
  const id = attachmentIdFromUrl(part.url);
  const [text, setText] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (pdf) return;
    if (!id) {
      setFailed(true);
      return;
    }
    let alive = true;
    apiFetch<{ text: string; truncated: boolean }>(`/api/attachments/${id}/text`)
      .then((body) => {
        if (!alive) return;
        setText(body.text);
        setTruncated(body.truncated);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [id, pdf]);

  function copy() {
    if (text === null) return;
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1500);
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
        {pdf && (
          <a
            href={part.url}
            target="_blank"
            rel="noreferrer"
            aria-label="Abrir en otra pestaña"
            title="Abrir en otra pestaña"
            className="flex size-8 items-center justify-center rounded-md text-fg-secondary hover:bg-surface hover:text-fg"
          >
            <ExternalLink size={15} aria-hidden />
          </a>
        )}
        <a
          href={`${part.url}?download=1`}
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
          {truncated && (
            <p className="mx-4 mb-3 rounded-md bg-warning-bg px-3 py-2 font-sans text-xs text-warning-fg">
              Es un archivo largo: aquí está la parte que se leyó. Descárgalo para verlo completo.
            </p>
          )}
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
