import { X } from "lucide-react";
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
  /**
   * Convierte lo escrito en el tag que se guarda, o `null` si no sirve. Sin
   * esto el tag es el texto recortado. Un `null` deja el borrador en el input
   * para que se pueda corregir, y avisa por `onInvalid`.
   */
  normalize?: (raw: string) => string | null;
  /**
   * El texto que `normalize` rechazó, o `null` en cuanto el borrador cambia:
   * quien pinta el error sabe así cuándo dejar de pintarlo.
   */
  onInvalid?: (raw: string | null) => void;
  /** Color de los chips (F9.7): neutro por default; permitidos/prohibidos en Voz de marca. */
  tono?: TonoDeTag;
  /** Chips que se tachan en ámbar: el modismo que también está en la otra lista. */
  enConflicto?: (tag: string) => boolean;
}

export type TonoDeTag = "neutro" | "permitido" | "prohibido";

const CLASE_TONO: Record<TonoDeTag | "conflicto", string> = {
  neutro: "border-tag-neutro-border bg-tint-pink text-tag-neutro-fg",
  permitido: "border-info-border bg-info-bg text-info-fg",
  prohibido: "border-error-border bg-error-bg text-error-fg",
  conflicto: "border-warning-border bg-warning-bg text-warning-fg line-through",
};

// Chips removibles + input de texto libre (Enter o coma agrega). Usado para
// nicho (onboarding) y, en Configuración, modismos permitidos/prohibidos,
// temas clave y CTAs preferidos — vocabulario abierto, sin presets (doc §3).
export function TagInput({
  value,
  onChange,
  placeholder,
  maxItems,
  maxLength,
  id,
  normalize,
  onInvalid,
  tono = "neutro",
  enConflicto,
}: TagInputProps) {
  const [draft, setDraft] = useState("");
  const atLimit = maxItems !== undefined && value.length >= maxItems;

  function addTag() {
    const trimmed = draft.trim().slice(0, maxLength);
    if (!trimmed) {
      setDraft("");
      return;
    }
    const tag = normalize ? normalize(trimmed) : trimmed;
    if (tag === null) {
      onInvalid?.(trimmed);
      return;
    }
    setDraft("");
    if (atLimit || value.includes(tag)) return;
    onChange([...value, tag]);
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
    <div className="flex min-h-11.5 flex-wrap items-center gap-2 rounded-md border-[1.5px] border-line bg-card p-2 transition-[border-color,box-shadow] focus-within:border-line-focus focus-within:ring-3 focus-within:ring-focus-ring">
      {value.map((tag) => (
        <span
          key={tag}
          className={`inline-flex items-center gap-1 rounded-full border py-1.25 pr-1.5 pl-3 text-[12.5px] leading-tight font-medium ${
            CLASE_TONO[enConflicto?.(tag) ? "conflicto" : tono]
          }`}
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            aria-label={`Quitar ${tag}`}
            className="inline-flex size-4 items-center justify-center opacity-55 hover:opacity-100"
          >
            <X size={12} strokeWidth={2.4} aria-hidden />
          </button>
        </span>
      ))}
      {!atLimit && (
        <input
          id={id}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            onInvalid?.(null);
          }}
          onKeyDown={handleKeyDown}
          onBlur={addTag}
          maxLength={maxLength}
          placeholder={value.length === 0 ? placeholder : undefined}
          className="min-w-24 flex-1 bg-transparent p-1 text-sm text-fg placeholder:text-fg-muted focus:outline-none"
        />
      )}
    </div>
  );
}
