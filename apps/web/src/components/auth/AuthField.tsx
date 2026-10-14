import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { useId, useState, type InputHTMLAttributes, type ReactNode, type Ref } from "react";

// Campo de las pantallas de acceso (Auth Flow.html): etiqueta, caja de 48px,
// error con ícono debajo. Los inputs NO son controlados por defecto: login y
// registro leen el FormData al enviar porque los gestores de contraseñas
// rellenan el DOM sin disparar el evento que React necesita (ver login.tsx).

interface AuthFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  error?: string | null;
  hint?: ReactNode;
  /** Algo a la derecha de la caja: un check de "coinciden", un spinner. */
  trailing?: ReactNode;
  /** Al input (React 19: ref es una prop más). */
  ref?: Ref<HTMLInputElement>;
}

export function AuthField({
  label,
  error,
  hint,
  trailing,
  type,
  className = "",
  ...rest
}: AuthFieldProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const esPassword = type === "password";
  const descripcion = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className={`font-display text-[13px] font-semibold ${error ? "text-error-fg" : "text-fg-secondary"}`}
      >
        {label}
      </label>
      <div
        className={`flex h-12 items-center gap-2 rounded-[10px] border-[1.5px] px-3.5 transition-[border-color,box-shadow,background-color] focus-within:ring-3 ${
          error
            ? "border-error-border bg-error-bg focus-within:ring-error-border"
            : "border-line bg-card focus-within:border-line-focus focus-within:bg-secondary focus-within:ring-focus-ring"
        }`}
      >
        <input
          id={id}
          type={esPassword && visible ? "text" : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={descripcion}
          className={`min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-muted disabled:opacity-50 ${className}`}
          {...rest}
        />
        {esPassword && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-pressed={visible}
            className="flex text-fg-muted hover:text-fg-secondary"
          >
            {visible ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
          </button>
        )}
        {trailing}
        {error && <AlertCircle size={16} aria-hidden className="shrink-0 text-error-fg" />}
      </div>
      {error && (
        <p id={`${id}-error`} className="animate-[aparecer_180ms_ease-out] text-xs text-error-fg">
          {error}
        </p>
      )}
      {hint && !error && (
        <div id={`${id}-hint`} className="text-xs text-fg-muted">
          {hint}
        </div>
      )}
    </div>
  );
}
