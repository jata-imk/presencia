import { Mic, Paperclip, Palette, Send, Square } from "lucide-react";
import {
  useImperativeHandle,
  useRef,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  type Ref,
} from "react";
import {
  ATTACHMENTS_PER_MESSAGE,
  ATTACHMENT_IMAGE_MIME_TYPES,
  ATTACHMENT_TEXT_EXTENSIONS,
  MAX_MESSAGE_CHARS,
} from "@presencia/shared";
import { pastedName, type PendingAttachment } from "../../lib/attachments/attachments.js";
import { attachmentsState } from "../../lib/attachments/use-attachments.js";
import { isSubmitKey, measureMessage, useAutoGrow } from "../../lib/use-message-input.js";
import { Tooltip } from "../ui/Tooltip.js";
import { AttachmentChip } from "./AttachmentChip.js";

/** Lo que el selector de archivos ofrece: lo mismo que acepta la API (@presencia/shared). */
const ACCEPT = [
  ...ATTACHMENT_IMAGE_MIME_TYPES,
  "application/pdf",
  ".pdf",
  ...ATTACHMENT_TEXT_EXTENSIONS,
].join(",");

/** Los adjuntos del composer y sus acciones (lib/attachments/use-attachments.ts). */
export interface ComposerAttachments {
  items: PendingAttachment[];
  onAdd: (files: File[]) => void;
  onRemove: (key: string) => void;
  onRetry: (key: string) => void;
}

/** Desde aquí se ve el contador de caracteres (F10.8.2). */
const COUNTER_FROM = Math.floor(MAX_MESSAGE_CHARS * 0.9);

// Caja de texto (Chat Conversation.html, StickyInput) — mismo componente en
// la conversación (`large=false`) y en la pantalla de nuevo chat
// (`large=true`, ver routes/chats.tsx), como en el mockup.
//
// Transcribir audio y Estilo de respuesta se pintan deshabilitados con
// "Próximamente": no hay backend para ninguno de los dos todavía. Adjuntar
// (F10.9, Claude Design "Chat Adjuntos" §1) abre el selector de archivos; pegar
// (Ctrl/Cmd+V) y soltar sobre la columna terminan en el mismo `onAdd`. El
// estimado "≈ N créditos" del mockup no se pinta — no hay un endpoint de
// costo estimado antes de enviar (solo se conoce el costo real al terminar
// el turno, charge() en credits.service.ts, ADR-012); inventar un número
// sería fabricar dato, mismo criterio que TimeChips sin badges de %.
export function Composer({
  value,
  onChange,
  onSubmit,
  busy,
  onStop,
  placeholder = "Continúa la conversación…",
  large = false,
  inputRef,
  attachments,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
  onStop: () => void;
  placeholder?: string;
  large?: boolean;
  /**
   * Acceso al textarea desde afuera, solo para enfocarlo.
   *
   * Lo usa la pantalla de nuevo chat: al elegir una tarjeta de sugerencia, el
   * prompt se escribe en la caja y el cursor se va ahí, para que el usuario
   * pueda ajustarlo antes de enviar. Va por `useImperativeHandle` y no
   * reemplazando el `ref` interno porque ese lo necesita el autosize.
   */
  inputRef?: Ref<HTMLTextAreaElement>;
  /** Sin esto, Adjuntar se queda deshabilitado (Storybook, pantallas sin chat). */
  attachments?: ComposerAttachments;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Pasarse del tope se avisa con el contador y no deja enviar.
  const { length, tooLong } = measureMessage(value);
  const hasText = length > 0;
  const items = attachments?.items ?? [];
  const { parts, uploading, blocked } = attachmentsState(items);
  const full = items.length >= ATTACHMENTS_PER_MESSAGE;
  // Se puede mandar solo con adjuntos, pero no mientras suben o con uno en
  // error: el envío saldría sin él y el creator creería que lo mandó.
  const canSend = (hasText || parts.length > 0) && !tooLong && !uploading && !blocked;
  const hint = blocked
    ? "Quita los archivos con error para enviar"
    : uploading
      ? "Esperando a que terminen de subir…"
      : !hasText && parts.length > 0
        ? "Puedes enviar solo los archivos"
        : null;

  function addFiles(files: File[]) {
    if (files.length > 0) attachments?.onAdd(files);
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    if (!attachments) return;
    // El texto del portapapeles sigue a la caja (no se previene nada); los
    // archivos (una captura, una imagen copiada de una página) se adjuntan.
    const files = Array.from(e.clipboardData.files).map((file) => {
      const name = pastedName(file);
      return name === file.name ? file : new File([file], name, { type: file.type });
    });
    addFiles(files);
  }

  function handlePick(e: ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(e.target.files ?? []));
    // Vaciado: así se puede volver a elegir el mismo archivo después de quitarlo.
    e.target.value = "";
  }

  useImperativeHandle(inputRef, () => textareaRef.current as HTMLTextAreaElement, []);

  useAutoGrow(textareaRef, value);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (isSubmitKey(e)) {
      e.preventDefault();
      if (canSend && !busy) onSubmit();
    }
  }

  return (
    <div className="relative w-full">
      {busy && (
        <div className="absolute -top-11 left-1/2 -translate-x-1/2">
          <button
            type="button"
            onClick={onStop}
            className="flex items-center gap-2 rounded-full border border-line bg-card px-3.5 py-1.5 text-xs font-semibold text-fg shadow-md transition-colors hover:bg-secondary-hover"
          >
            <span className="size-2.5 rounded-xs bg-error" />
            Detener generación
          </button>
        </div>
      )}

      <div
        className={`overflow-hidden rounded-xl border bg-card shadow-xs transition-colors ${
          hasText || items.length > 0 ? "border-line-focus shadow-md" : "border-line"
        }`}
      >
        {items.length > 0 && attachments && (
          // Desktop: envuelven en filas (con 10, dos a la vista y el resto con
          // scroll). Móvil: una sola fila con scroll horizontal.
          <div className="px-2 pt-2 sm:px-2.5 sm:pt-2.5">
            <div
              className={`flex [scrollbar-width:none] items-start gap-1.5 overflow-x-auto sm:[scrollbar-width:thin] sm:flex-wrap sm:gap-2 sm:overflow-x-visible ${
                full ? "sm:max-h-[112px] sm:overflow-y-auto" : ""
              }`}
            >
              {items.map((item) => (
                <AttachmentChip
                  key={item.key}
                  item={item}
                  onRemove={() => attachments.onRemove(item.key)}
                  onRetry={() => attachments.onRetry(item.key)}
                />
              ))}
            </div>
          </div>
        )}
        <div className={large ? "px-4 pt-3.5 pb-2" : "px-3.5 pt-3 pb-2"}>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              items.length > 0 && !hasText ? "Agrega un mensaje (opcional)…" : placeholder
            }
            rows={1}
            className={`w-full resize-none bg-transparent leading-[1.5] text-fg outline-none placeholder:text-fg-muted ${
              large ? "text-[15px]" : "text-[14px]"
            }`}
            style={{ minHeight: large ? 28 : 24 }}
          />
        </div>
        <div className="flex items-center gap-0.5 border-t border-line-subtle px-2.5 py-1.5">
          <div className="flex items-center gap-0.5">
            {attachments ? (
              <>
                <Tooltip
                  label={
                    full
                      ? `Límite: ${String(ATTACHMENTS_PER_MESSAGE)} archivos por mensaje`
                      : "Adjuntar archivos · también puedes arrastrarlos"
                  }
                >
                  <button
                    type="button"
                    aria-label="Adjuntar archivos"
                    disabled={full}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex size-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-secondary-hover hover:text-fg disabled:opacity-50 disabled:hover:bg-transparent"
                  >
                    <Paperclip size={14} strokeWidth={1.5} />
                  </button>
                </Tooltip>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ACCEPT}
                  onChange={handlePick}
                  className="hidden"
                  tabIndex={-1}
                  aria-hidden
                />
              </>
            ) : (
              <DisabledTool icon={Paperclip} label="Adjuntar archivo" />
            )}
            {[
              { icon: Mic, label: "Transcribir audio" },
              { icon: Palette, label: "Estilo de respuesta" },
            ].map(({ icon, label }) => (
              <DisabledTool key={label} icon={icon} label={label} />
            ))}
          </div>
          {items.length > 0 && (
            <span
              className={`ml-1.5 font-display text-[11.5px] font-semibold whitespace-nowrap ${
                full ? "text-warning-fg" : "text-fg-muted"
              }`}
            >
              {items.length}/{ATTACHMENTS_PER_MESSAGE}
              <span className="hidden sm:inline">{full ? " · límite por mensaje" : ""}</span>
            </span>
          )}
          <div className="flex-1" />
          {hint && (
            <span
              className={`mr-2 hidden text-xs whitespace-nowrap sm:inline ${
                blocked ? "text-error-fg" : "text-fg-muted"
              }`}
            >
              {hint}
            </span>
          )}
          {length >= COUNTER_FROM && (
            <span
              aria-live="polite"
              className={`mr-2 text-xs tabular-nums ${tooLong ? "text-error" : "text-fg-muted"}`}
            >
              {tooLong
                ? `Te pasas por ${excess(length - MAX_MESSAGE_CHARS)}`
                : `${length.toLocaleString("es-MX")} / ${MAX_MESSAGE_CHARS.toLocaleString("es-MX")}`}
            </span>
          )}
          {busy ? (
            <button
              type="button"
              aria-label="Detener generación"
              onClick={onStop}
              className="flex size-[30px] items-center justify-center rounded-md bg-error"
            >
              <Square size={11} strokeWidth={2} className="fill-white text-white" />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Enviar mensaje"
              disabled={!canSend}
              onClick={onSubmit}
              className={`flex size-[30px] items-center justify-center rounded-md transition-all ${
                canSend ? "scale-100 bg-primary opacity-100" : "scale-95 bg-secondary opacity-50"
              }`}
            >
              <Send
                size={14}
                strokeWidth={2}
                className={canSend ? "text-primary-fg" : "text-fg-muted"}
              />
            </button>
          )}
        </div>
        {hint && (
          <div
            className={`px-3.5 pb-2 text-[11.5px] sm:hidden ${blocked ? "text-error-fg" : "text-fg-muted"}`}
          >
            {hint}
          </div>
        )}
      </div>
    </div>
  );
}

function DisabledTool({ icon: Icon, label }: { icon: typeof Mic; label: string }) {
  return (
    <Tooltip label={`${label} — próximamente`}>
      <button
        type="button"
        disabled
        aria-label={label}
        className="flex size-7 items-center justify-center rounded-md text-fg-muted opacity-50"
      >
        <Icon size={14} strokeWidth={1.5} />
      </button>
    </Tooltip>
  );
}

function excess(count: number): string {
  return count === 1 ? "1 carácter" : `${count.toLocaleString("es-MX")} caracteres`;
}
