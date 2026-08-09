import { useState, type KeyboardEvent } from "react";

interface TagInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  maxItems?: number;
  // Tope por tag: el schema compartido limita cada elemento a 40 chars (80
  // para CTAs, packages/shared/src/brand-voice.ts). Sin este cap el 400 del
  // servidor no dice qué tag es el problema — ver callers.
  maxLength?: number;
  id?: string;
}

// Chips removibles + input de texto libre (Enter o coma agrega). Usado para
// nicho (onboarding) y, en Configuración, modismos permitidos/prohibidos,
// temas clave y CTAs preferidos — vocabulario abierto, sin presets (doc §3).
export function TagInput({ value, onChange, placeholder, maxItems, maxLength, id }: TagInputProps) {
  const [draft, setDraft] = useState("");
  const atLimit = maxItems !== undefined && value.length >= maxItems;

  function addTag() {
    const trimmed = draft.trim().slice(0, maxLength);
    setDraft("");
    if (!trimmed || atLimit || value.includes(trimmed)) return;
    onChange([...value, trimmed]);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  function removeTag(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-line bg-card px-2 py-1.5 focus-within:border-line-focus">
      {value.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded-sm bg-tint-plum px-2 py-0.5 text-xs text-fg-secondary"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            aria-label={`Quitar ${tag}`}
            className="text-fg-muted hover:text-fg"
          >
            ×
          </button>
        </span>
      ))}
      {!atLimit && (
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={addTag}
          maxLength={maxLength}
          placeholder={value.length === 0 ? placeholder : undefined}
          className="min-w-20 flex-1 bg-transparent text-sm text-fg placeholder:text-fg-muted focus:outline-none"
        />
      )}
    </div>
  );
}
