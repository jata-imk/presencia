import { ArrowUp, Sparkles, Square } from "lucide-react";
import { useState, type FormEvent } from "react";
import { CARD_REWRITE_SUGGESTIONS } from "@presencia/shared";

// "Pide un cambio a este borrador" (F10.5 PR4, rd-panel.jsx → AskBar): el
// campo fijo al pie del panel. Es el flujo 3 de los cambios: lo que pide aquí
// se aplica a ESTA card como una versión nueva. Pedir "hazme otra" sigue
// siendo cosa del chat (card nueva).
//
// Sin % de cuota en el botón: se cobra por tokens, como un turno de chat, y
// esos cobros no anuncian precio (addendum ADR-012).
export function AskBar({
  busy,
  disabled,
  mobile,
  onSubmit,
  onStop,
}: {
  busy: boolean;
  /** Mirando una versión vieja o una card que ya no se edita. */
  disabled: boolean;
  mobile: boolean;
  onSubmit: (instruction: string) => void;
  onStop: () => void;
}) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const instruction = value.trim();
    if (instruction.length < 2 || busy || disabled) return;
    onSubmit(instruction);
    setValue("");
  }

  return (
    <form onSubmit={submit} className="shrink-0 border-t border-line px-3 pt-2.5">
      {focused && !busy && !disabled && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {CARD_REWRITE_SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              type="button"
              // mousedown y no click: el blur del campo cerraría los atajos
              // antes de que el click llegue.
              onMouseDown={(e) => {
                e.preventDefault();
                onSubmit(s.instruction);
              }}
              className="inline-flex h-[26px] items-center rounded-full border border-line bg-card px-2.5 font-display text-xs font-semibold text-fg-secondary hover:border-line-focus hover:bg-tint-plum hover:text-accent"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      <div
        className={`flex h-10 items-center gap-2 rounded-[11px] border bg-surface pr-1.5 pl-3 ${
          focused ? "border-line-focus shadow-[0_0_0_3px_var(--bg-tint-plum)]" : "border-line"
        }`}
      >
        {busy ? (
          <span
            aria-hidden="true"
            className="inline-block size-3.5 shrink-0 animate-spin rounded-full border-2 border-line border-t-accent"
          />
        ) : (
          <Sparkles size={15} className="shrink-0 text-accent" aria-hidden="true" />
        )}
        {busy ? (
          <span className="flex-1 truncate text-[13.5px] text-fg-muted">
            Reescribiendo… puedes seguir en el chat
          </span>
        ) : (
          <input
            aria-label="Pide un cambio a este borrador"
            value={value}
            disabled={disabled}
            maxLength={500}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) submit(e);
            }}
            placeholder={
              disabled
                ? "Vuelve a la versión actual para pedir cambios"
                : "Pide un cambio a este borrador…"
            }
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-fg outline-none placeholder:text-fg-muted disabled:cursor-not-allowed"
          />
        )}
        {busy ? (
          <button
            type="button"
            onClick={onStop}
            className="inline-flex h-7 items-center gap-1 rounded-lg px-2 font-display text-xs font-semibold text-fg-secondary hover:bg-card"
          >
            <Square size={12} aria-hidden="true" />
            Detener
          </button>
        ) : (
          <>
            {!mobile && (
              <kbd className="rounded-[5px] border border-line bg-card px-1.5 font-display text-[10px] font-semibold text-fg-muted">
                ↵
              </kbd>
            )}
            <button
              type="submit"
              aria-label="Pedir el cambio"
              disabled={disabled || value.trim().length < 2}
              className="inline-flex size-7 items-center justify-center rounded-lg bg-primary text-primary-fg disabled:bg-transparent disabled:text-fg-muted"
            >
              <ArrowUp size={15} strokeWidth={2.2} />
            </button>
          </>
        )}
      </div>
      <div className="h-2.5" />
    </form>
  );
}
