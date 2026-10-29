import { Check, Globe, Mic, Paperclip, Palette, Plus, Send, Square, X } from "lucide-react";
import {
  useEffect,
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
import { Menu, MENU_CONTENT_CLASS, MENU_ITEM_CLASS } from "../ui/Menu.js";
import { Tooltip } from "../ui/Tooltip.js";
import { AttachmentChip } from "./AttachmentChip.js";

/** En Mac el atajo es ⌘U: Ctrl+U ahí es de edición de texto (borrar la línea). */
const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "");

/** El atajo de "Subir fotos y archivos", como se escribe en cada sistema. */
const UPLOAD_SHORTCUT = IS_MAC ? "⌘U" : "Ctrl+U";

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
// El ＋ abre un menú: "Subir fotos y archivos" (F10.9, Claude Design "Chat
// Adjuntos" §1; también con Ctrl/⌘+U) y, deshabilitado con "Pronto", Estilo
// de respuesta. Transcribir audio se queda en la barra, también deshabilitado:
// ninguno de los dos tiene backend todavía.
// Pegar (Ctrl/Cmd+V) y soltar sobre la columna terminan en el mismo `onAdd`. El
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
  webSearch,
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
  /**
   * F10.10: "Buscar en la web" del menú ＋. Prendido, el próximo mensaje obliga
   * a buscar (se ve como chip junto al ＋); quien lo usa lo apaga al enviar.
   * Sin esto, el ítem no aparece.
   */
  webSearch?: { on: boolean; onChange: (on: boolean) => void };
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Pasarse del tope se avisa con el contador y no deja enviar.
  const { length, tooLong } = measureMessage(value);
  const hasText = length > 0;
  const items = attachments?.items ?? [];
  const { parts, uploading, blocked: withErrors, tooHeavy } = attachmentsState(items);
  const blocked = withErrors || tooHeavy;
  const full = items.length >= ATTACHMENTS_PER_MESSAGE;
  // Se puede mandar solo con adjuntos, pero no mientras suben o con uno en
  // error: el envío saldría sin él y el creator creería que lo mandó.
  const canSend = (hasText || parts.length > 0) && !tooLong && !uploading && !blocked;
  const hint = withErrors
    ? "Quita los archivos con error para enviar"
    : tooHeavy
      ? "Estos archivos juntos son demasiado largos: quita alguno o mándalo en otro mensaje"
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

  // Ctrl/⌘+U abre el selector, como en Claude. Con el composer en pantalla y
  // no con el foco en la caja: el atajo sirve también leyendo la conversación.
  // preventDefault: en Chrome es "ver código fuente", y también con 10
  // archivos (el atajo no cambia de significado al llegar al límite).
  useEffect(() => {
    if (!attachments) return;
    function onKey(e: globalThis.KeyboardEvent) {
      if (!(IS_MAC ? e.metaKey : e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() !== "u" || e.repeat || e.isComposing) return;
      // Un modal abierto (programar, una card) o el foco en otro campo (el
      // renombrar del sidebar): el atajo no es de ahí.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const active = document.activeElement;
      if (
        active !== textareaRef.current &&
        active instanceof HTMLElement &&
        (active.isContentEditable || active.tagName === "INPUT" || active.tagName === "TEXTAREA")
      ) {
        return;
      }
      e.preventDefault();
      if (!full) fileInputRef.current?.click();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [attachments, full]);

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
              webSearch?.on
                ? "Escribe qué quieres que busque…"
                : items.length > 0 && !hasText
                  ? "Agrega un mensaje (opcional)…"
                  : placeholder
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
            {/* El ＋ abre un menú y no el selector directo: hoy trae los
                archivos y lo que viene "Pronto", y es donde F10.10 pone
                "Buscar en la web" (QA de Jose, 2026-10-20). */}
            {/* Sin tooltip: se quedaba asomado detrás del menú abierto, y el
                menú ya dice qué hay adentro. */}
            <Menu placement="top-start">
              <Menu.Trigger
                aria-label="Agregar archivos y más"
                className="flex size-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-secondary-hover hover:text-fg aria-expanded:bg-secondary-hover aria-expanded:text-fg"
              >
                <Plus size={16} strokeWidth={1.75} />
              </Menu.Trigger>
              <Menu.Content className={`${MENU_CONTENT_CLASS} w-80`}>
                <Menu.Item
                  className={`${MENU_ITEM_CLASS} items-start`}
                  disabled={!attachments || full}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip size={14} className="mt-0.5" aria-hidden />
                  <span className="flex flex-1 flex-col">
                    Subir fotos y archivos
                    {/* Lo único que dice que se puede soltar o pegar; con 10, el
                        porqué de que esté apagado (un `title` en un botón
                        deshabilitado no se ve en casi ningún navegador). */}
                    <span className="text-[11.5px] text-fg-muted">
                      {full
                        ? `Ya tienes ${String(ATTACHMENTS_PER_MESSAGE)}: es el límite por mensaje`
                        : "También puedes arrastrarlos o pegarlos"}
                    </span>
                  </span>
                  <kbd className="mt-0.5 font-display text-[11px] font-medium text-fg-muted">
                    {UPLOAD_SHORTCUT}
                  </kbd>
                </Menu.Item>
                {webSearch && (
                  // Cierra el menú al elegirlo: lo que queda a la vista es el chip.
                  <Menu.Item
                    className={`${MENU_ITEM_CLASS} items-start`}
                    onClick={() => webSearch.onChange(!webSearch.on)}
                  >
                    <Globe size={14} className="mt-0.5" aria-hidden />
                    <span className="flex flex-1 flex-col">
                      Buscar en la web
                      <span className="text-[11.5px] text-fg-muted">
                        {webSearch.on
                          ? "Activado para este mensaje: tócalo para quitarlo"
                          : "Para algo reciente: precios, horarios, noticias"}
                      </span>
                    </span>
                    {webSearch.on && <Check size={14} className="mt-0.5 text-accent" aria-hidden />}
                  </Menu.Item>
                )}
                <div className="mx-1 my-1 border-t border-line-subtle" role="separator" />
                <Menu.Item className={MENU_ITEM_CLASS} disabled>
                  <Palette size={14} aria-hidden />
                  <span className="flex-1">Estilo de respuesta</span>
                  <span className="rounded-full bg-secondary px-1.5 py-px text-[10.5px] font-medium text-fg-muted">
                    Pronto
                  </span>
                </Menu.Item>
              </Menu.Content>
            </Menu>
            {webSearch?.on && (
              <span className="ml-0.5 inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-ai-border bg-ai-bg pr-1 pl-2.5 font-display text-[12.5px] font-semibold whitespace-nowrap text-ai">
                <Globe size={13} strokeWidth={2} aria-hidden />
                Buscar en la web
                <button
                  type="button"
                  aria-label="Quitar Buscar en la web"
                  onClick={() => webSearch.onChange(false)}
                  className="flex size-5 items-center justify-center rounded-full transition-colors hover:text-fg"
                >
                  <X size={12} strokeWidth={2} />
                </button>
              </span>
            )}
            {/* Dictar se queda a la vista, junto al ＋ (como el micrófono de
                Claude y ChatGPT): no es "algo que se agrega", es otra forma de
                escribir (Jose, 2026-10-20). */}
            <Tooltip label="Transcribir audio — próximamente">
              <button
                type="button"
                disabled
                aria-label="Transcribir audio"
                className="flex size-7 items-center justify-center rounded-md text-fg-muted opacity-50"
              >
                <Mic size={14} strokeWidth={1.5} />
              </button>
            </Tooltip>
            {attachments && (
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
            )}
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

function excess(count: number): string {
  return count === 1 ? "1 carácter" : `${count.toLocaleString("es-MX")} caracteres`;
}
