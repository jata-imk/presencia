import { MAX_MESSAGE_CHARS } from "@presencia/shared";
import { Copy, Pencil } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { isSubmitKey, measureMessage, useAutoGrow } from "../../lib/use-message-input.js";

// Burbuja del usuario (Chat Conversation.html, MessageUser). Plum con texto
// blanco en claro; en oscuro el mockup invierte a Blush Pop con texto plum
// — exactamente lo que --interactive-primary/--interactive-primary-fg ya
// hacen (design-tokens.md, "el CTA primario invierte en dark"), así que se
// reusan esos tokens en vez de crear --bubble-user-* nuevos.
//
// Sin timestamp: el UIMessage que sirve la API no trae createdAt por
// mensaje (chat.service.ts toUIMessage() solo manda id/role/parts) —
// mostrar "hace 3 min" inventado violaría la regla de no fabricar datos
// (mismo criterio que TimeChips sin badges de % falsos).
//
// F10.8.2: el ÚLTIMO mensaje se puede editar, en la misma burbuja (como
// ChatGPT y Claude). Enviar reemplaza el mensaje y su respuesta: es ese turno
// de nuevo, no uno más. Los anteriores no: editarlos borraría todo lo que vino
// después.
export function MessageUser({
  text,
  canEdit = false,
  editing = false,
  onEdit,
  onCancelEdit,
  onSubmitEdit,
}: {
  text: string;
  /** El último mensaje y sin turno en curso. */
  canEdit?: boolean;
  editing?: boolean;
  onEdit?: () => void;
  onCancelEdit?: () => void;
  onSubmitEdit?: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const editable = canEdit && onEdit !== undefined;

  function handleCopy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (editing && onCancelEdit && onSubmitEdit) {
    return <EditBubble initial={text} onCancel={onCancelEdit} onSubmit={onSubmitEdit} />;
  }

  return (
    <div className="group flex flex-col items-end gap-1">
      <div className="relative max-w-[88%] sm:max-w-[72%]">
        <div className="rounded-[12px_12px_3px_12px] bg-primary px-[15px] py-[11px] shadow-sm">
          <p className="text-[14px] leading-[1.55] whitespace-pre-wrap text-primary-fg">{text}</p>
        </div>
        {/* Con mouse y espacio, en hover a la izquierda de la burbuja. */}
        <div className="absolute top-1 right-full mr-2 hidden gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 sm:pointer-fine:flex">
          <BubbleAction label={copied ? "Copiado" : "Copiar mensaje"} onClick={handleCopy}>
            <Copy size={12} strokeWidth={1.75} />
          </BubbleAction>
          {editable && (
            <BubbleAction label="Editar mensaje" onClick={onEdit}>
              <Pencil size={12} strokeWidth={1.75} />
            </BubbleAction>
          )}
        </div>
      </div>
      {/* Sin hover (táctil) o sin espacio a la izquierda (angosto): debajo de la
          burbuja. Copiar aparece al tocarla; el último mensaje los muestra
          siempre, porque ahí está "Editar". */}
      <div
        className={`flex gap-1 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 sm:pointer-fine:hidden ${
          editable ? "" : "opacity-0"
        }`}
      >
        <BelowAction label={copied ? "Copiado" : "Copiar"} onClick={handleCopy}>
          <Copy size={12} strokeWidth={1.75} aria-hidden />
        </BelowAction>
        {editable && (
          <BelowAction label="Editar" onClick={onEdit}>
            <Pencil size={12} strokeWidth={1.75} aria-hidden />
          </BelowAction>
        )}
      </div>
    </div>
  );
}

function BubbleAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-md border border-line bg-card text-fg-muted shadow-sm transition-colors hover:text-fg"
    >
      {children}
    </button>
  );
}

function BelowAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold text-fg-secondary hover:text-fg"
    >
      {children}
      {label}
    </button>
  );
}

/** La burbuja en modo edición: Enter envía, Shift+Enter es salto de línea, Esc cancela. */
function EditBubble({
  initial,
  onCancel,
  onSubmit,
}: {
  initial: string;
  onCancel: () => void;
  onSubmit: (text: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  const { tooLong, canSend } = measureMessage(value);
  useAutoGrow(ref, value);

  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
  }, []);

  // Sin cambios no hay nada que reemplazar: volver a correr el turno cobraría
  // y borraría los borradores de la respuesta por nada.
  function submit() {
    if (!canSend) return;
    if (value.trim() === initial.trim()) onCancel();
    else onSubmit(value.trim());
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    } else if (isSubmitKey(e)) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="flex justify-end">
      <div className="w-full max-w-[88%] rounded-xl border border-line-focus bg-card p-3 shadow-md sm:max-w-[72%]">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Editar mensaje"
          rows={1}
          className="w-full resize-none bg-transparent text-[14px] leading-[1.55] text-fg outline-none"
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          {tooLong && (
            <span className="mr-auto text-xs text-error">
              Te pasas del máximo de {MAX_MESSAGE_CHARS.toLocaleString("es-MX")} caracteres
            </span>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="h-8 rounded-md px-3 text-xs font-semibold text-fg-secondary hover:bg-surface hover:text-fg"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!canSend}
            onClick={submit}
            className="h-8 rounded-md bg-primary px-3 text-xs font-semibold text-primary-fg disabled:opacity-50"
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
