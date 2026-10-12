import { AlertCircle, CheckCircle2, Clock, X } from "lucide-react";
import type { ReactNode } from "react";
import { IsotipoGlyph } from "../ui/BrandMark.js";

// Las piezas de las pantallas de acceso (F10.8.4, Auth Flow.html de Claude
// Design): login, registro, verificar correo y recuperar contraseña. Todo con
// tokens: el mock trae hex fijos, aquí cada color sale del tema y las
// pantallas se ven bien en claro y en oscuro.

/**
 * Fondo de la app con dos halos suaves (orquídea arriba a la izquierda, azul
 * abajo a la derecha) y la tarjeta centrada. Scroll propio: en móvil el
 * registro con el medidor de fuerza no cabe en una pantalla.
 */
export function AuthShell({ children, above }: { children: ReactNode; above?: ReactNode }) {
  return (
    <main className="relative min-h-dvh overflow-x-hidden bg-app">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_60%_50%_at_20%_20%,color-mix(in_srgb,var(--color-pink-orchid)_22%,transparent)_0%,transparent_70%),radial-gradient(ellipse_50%_60%_at_80%_80%,color-mix(in_srgb,var(--color-icy-blue)_18%,transparent)_0%,transparent_70%)]"
      />
      <div className="relative flex min-h-dvh flex-col items-center justify-center gap-4 px-4 py-10">
        {above}
        <div className="flex w-full max-w-[420px] animate-[aparecer_280ms_ease-out] flex-col gap-5 rounded-[20px] border border-line-subtle bg-card px-6 pt-8 pb-7 shadow-lg sm:px-10 sm:pt-9 sm:pb-8">
          {children}
        </div>
      </div>
    </main>
  );
}

/** Isotipo + "Presencia": el BrandMark grande y apilado. */
export function AuthLogo() {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="flex size-13 items-center justify-center rounded-[14px] bg-primary text-primary-fg">
        <IsotipoGlyph className="size-7" />
      </span>
      <span className="font-display text-xl font-bold text-brand">Presencia</span>
    </div>
  );
}

/** Título y bajada de la tarjeta. `align` start para los pasos con ícono. */
export function AuthHeading({
  title,
  subtitle,
  align = "center",
}: {
  title: string;
  subtitle?: ReactNode;
  align?: "center" | "start";
}) {
  return (
    <div className={align === "center" ? "text-center" : ""}>
      <h1 className="mb-1.5 font-display text-2xl font-bold text-brand">{title}</h1>
      {subtitle && <p className="text-sm leading-relaxed text-fg-secondary">{subtitle}</p>}
    </div>
  );
}

const TONOS = {
  error: { caja: "border-error-border bg-error-bg text-error-fg", Icono: AlertCircle },
  warning: { caja: "border-warning-border bg-warning-bg text-warning-fg", Icono: Clock },
  success: { caja: "border-success-border bg-success-bg text-success-fg", Icono: CheckCircle2 },
  info: { caja: "border-info-border bg-info-bg text-info-fg", Icono: Clock },
} as const;

/** Aviso dentro de la tarjeta: credenciales, demasiados intentos, sesión expirada. */
export function AuthBanner({
  tone,
  title,
  children,
  onClose,
}: {
  tone: keyof typeof TONOS;
  title?: string;
  children?: ReactNode;
  onClose?: () => void;
}) {
  const { caja, Icono } = TONOS[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex animate-[aparecer_200ms_ease-out] items-start gap-2.5 rounded-[10px] border px-3.5 py-3 text-[13px] leading-snug ${caja}`}
    >
      <Icono size={16} strokeWidth={1.8} aria-hidden className="mt-px shrink-0" />
      <div className="flex-1">
        {title && <p className="mb-0.5 font-display font-semibold">{title}</p>}
        {children}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar aviso"
          className="shrink-0 opacity-60 hover:opacity-100"
        >
          <X size={14} aria-hidden />
        </button>
      )}
    </div>
  );
}

/** El botón principal de la tarjeta, a todo lo ancho. */
export function AuthSubmit({
  children,
  disabled,
  loading,
}: {
  children: ReactNode;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled || loading}
      aria-busy={loading}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-primary font-display text-[15px] font-semibold text-primary-fg transition-[transform,background-color] hover:bg-primary-hover active:scale-[0.98] active:bg-primary-press disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
    >
      {loading && (
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}

/** "¿No tienes cuenta? Crear cuenta" al pie de la tarjeta. */
export function AuthFooter({ children }: { children: ReactNode }) {
  return <p className="text-center text-[13px] text-fg-secondary">{children}</p>;
}

export const AUTH_LINK = "font-semibold text-brand underline-offset-2 hover:underline";
