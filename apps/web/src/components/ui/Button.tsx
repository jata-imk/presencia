import type { ButtonHTMLAttributes } from "react";

// Botón base sobre tokens de capa 3 (docs/reference/design-tokens.md). Lo
// usan el onboarding, Configuración, los modales, el drawer y Ritmo, así que
// su piel se decide en un pase de toda la app y no en el de una pantalla:
// F9.7 (Configuración) lo dejó como estaba a propósito.

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
