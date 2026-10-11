import { Mic, Paperclip, Palette, Send, Square } from "lucide-react";
import { useEffect, useImperativeHandle, useRef, type KeyboardEvent, type Ref } from "react";
import { MAX_MESSAGE_CHARS } from "@presencia/shared";
import { Tooltip } from "../ui/Tooltip.js";

const MAX_HEIGHT_PX = 220;
/** Desde aquí se ve el contador de caracteres (F10.8.2). */
const COUNTER_FROM = Math.floor(MAX_MESSAGE_CHARS * 0.9);

// Caja de texto (Chat Conversation.html, StickyInput) — mismo componente en
// la conversación (`large=false`) y en la pantalla de nuevo chat
// (`large=true`, ver routes/chats.tsx), como en el mockup.
//
// Adjuntar/Transcribir audio/Estilo de respuesta se pintan deshabilitados
// con "Pronto": no hay backend para ninguno de los tres todavía. El
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
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Pasarse del tope no corta el texto (un `maxLength` recortaría en silencio
  // lo pegado): se avisa con el contador y no se deja enviar.
  const tooLong = value.length > MAX_MESSAGE_CHARS;
  const hasText = value.trim().length > 0;
  const canSend = hasText && !tooLong;

  useImperativeHandle(inputRef, () => textareaRef.current as HTMLTextAreaElement, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
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
          hasText ? "border-line-focus shadow-md" : "border-line"
        }`}
      >
        <div className={large ? "px-4 pt-3.5 pb-2" : "px-3.5 pt-3 pb-2"}>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            className={`w-full resize-none bg-transparent leading-[1.5] text-fg outline-none placeholder:text-fg-muted ${
              large ? "text-[15px]" : "text-[14px]"
            }`}
            style={{ minHeight: large ? 28 : 24 }}
          />
        </div>
        <div className="flex items-center gap-0.5 border-t border-line-subtle px-2.5 py-1.5">
          <div className="flex items-center gap-0.5">
            {[
              { icon: Paperclip, label: "Adjuntar archivo" },
              { icon: Mic, label: "Transcribir audio" },
              { icon: Palette, label: "Estilo de respuesta" },
            ].map(({ icon: Icon, label }) => (
              <Tooltip key={label} label={`${label} — próximamente`}>
                <button
                  type="button"
                  disabled
                  aria-label={label}
                  className="flex size-7 items-center justify-center rounded-md text-fg-muted opacity-50"
                >
                  <Icon size={14} strokeWidth={1.5} />
                </button>
              </Tooltip>
            ))}
          </div>
          <div className="flex-1" />
          {value.length >= COUNTER_FROM && (
            <span
              aria-live="polite"
              className={`mr-2 text-xs tabular-nums ${tooLong ? "text-error" : "text-fg-muted"}`}
            >
              {tooLong
                ? `Te pasas por ${excess(value.length - MAX_MESSAGE_CHARS)}`
                : `${value.length.toLocaleString("es-MX")} / ${MAX_MESSAGE_CHARS.toLocaleString("es-MX")}`}
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
      </div>
    </div>
  );
}

function excess(count: number): string {
  return count === 1 ? "1 carácter" : `${count.toLocaleString("es-MX")} caracteres`;
}
