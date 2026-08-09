interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}

// role="switch" + aria-checked en vez de <input type="checkbox"> disfrazado:
// el control es visualmente un switch, no una casilla.
export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? "bg-primary" : "border border-line bg-secondary"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-card shadow-sm transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}
