import type { ButtonHTMLAttributes } from "react";

// Botón base sobre tokens de capa 3 (docs/reference/design-tokens.md). Lo
// usan el onboarding, Configuración, los modales, el drawer y Ritmo, así que
// su piel se decide en un pase de toda la app y no en el de una pantalla:
// F9.7 (Configuración) lo dejó como estaba a propósito.

const VARIANT_CLASSES = {
  primary: "bg-primary text-primary-fg hover:bg-primary-hover active:bg-primary-press",
  secondary: "border border-line bg-secondary text-fg hover:bg-secondary-hover",
  // F11 PR7a: una acción destructiva que todavía pide confirmación
  // ("Desconectar" Telegram). El rojo lleno queda para el botón del modal.
  danger: "border border-error-border bg-card text-error-fg hover:bg-error-bg",
} as const;

export type ButtonVariant = keyof typeof VARIANT_CLASSES;

/**
 * La piel del botón, para un `<a>` que se ve como uno (F11 PR7a: un deep link
 * a Telegram es un enlace de verdad, no un `window.open` que el navegador
 * puede bloquear).
 */
export function buttonClass(variant: ButtonVariant = "primary"): string {
  return `rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ variant = "primary", className = "", ...rest }: ButtonProps) {
  return <button className={`${buttonClass(variant)} ${className}`} {...rest} />;
}
