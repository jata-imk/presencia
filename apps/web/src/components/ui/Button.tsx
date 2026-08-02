import type { ButtonHTMLAttributes } from "react";

// Kit crudo sobre tokens de capa 3 (docs/reference/design-tokens.md) — se
// reemplaza cuando entre el handoff de diseño. Reusado en el onboarding y
// en Configuración > Voz de marca.

const VARIANT_CLASSES = {
  primary: "bg-primary text-primary-fg hover:bg-primary-hover active:bg-primary-press",
  secondary: "border border-line bg-secondary text-fg hover:bg-secondary-hover",
} as const;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANT_CLASSES;
}

export function Button({ variant = "primary", className = "", ...rest }: ButtonProps) {
  return (
    <button
      className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    />
  );
}
