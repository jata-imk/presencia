import { Check, Info, LoaderCircle, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { EstadoDeCampo } from "../../lib/autoguardado.js";

// Las piezas con las que se arman las páginas de Configuración (F9.7, mock de
// Claude Design): encabezado de página, tarjeta de sección, campo con su marca
// de guardado, nota informativa y skeleton de carga.
//
// Viven acá y no en components/ui porque son el lenguaje de ESTAS pantallas —
// el label en mayúsculas chicas, la marca "Guardado" por campo— y no del resto
// de la app. Los inputs sí son de ui/: los comparte el onboarding.

export function EncabezadoDePagina({ titulo, subtitulo }: { titulo: string; subtitulo: string }) {
  return (
    <div className="mb-5">
      <h1 className="mb-1.5 font-display text-xl font-bold text-fg">{titulo}</h1>
      <p className="text-base text-fg-secondary">{subtitulo}</p>
    </div>
  );
}

interface SeccionProps {
  icono: LucideIcon;
  titulo: string;
  subtitulo?: string;
  children: ReactNode;
}

/** Un bloque de la página: tarjeta con cuadrito de ícono, título y subtítulo. */
export function Seccion({ icono: Icono, titulo, subtitulo, children }: SeccionProps) {
  return (
    <section className="mb-5 rounded-lg border border-line bg-card p-5 md:p-6">
      <div className="mb-1.5 flex items-center gap-2.75">
        <div className="flex size-8.5 shrink-0 items-center justify-center rounded-md bg-secondary">
          <Icono size={17} strokeWidth={1.5} className="text-accent" aria-hidden />
        </div>
        <h2 className="font-display text-md font-semibold text-fg">{titulo}</h2>
      </div>
      {subtitulo && <p className="mb-5 text-sm text-fg-muted md:ml-11.25">{subtitulo}</p>}
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  );
}

interface CampoProps {
  label: string;
  htmlFor?: string;
  /** Estado del autoguardado de este campo. */
  estado?: EstadoDeCampo;
  /** Pills junto al label ("Heredado del onboarding"). */
  extra?: ReactNode;
  /** Color del label cuando significa algo (permitidos / prohibidos). */
  tono?: "normal" | "permitido" | "prohibido";
  hint?: ReactNode;
  /** Un error propio del campo, que no viene del guardado (ej. una fuente inválida). */
  error?: string | null;
  children: ReactNode;
}

const TONO_LABEL = {
  normal: "text-fg-secondary",
  permitido: "text-info-fg",
  prohibido: "text-error-fg",
} as const;

export function Campo({
  label,
  htmlFor,
  estado,
  extra,
  tono = "normal",
  hint,
  error,
  children,
}: CampoProps) {
  const mensajeDeError = error ?? (estado?.tipo === "error" ? estado.mensaje : null);
  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-2 flex min-h-5 flex-wrap items-center gap-2">
        <label
          htmlFor={htmlFor}
          className={`font-display text-[11px] font-semibold tracking-wider uppercase ${TONO_LABEL[tono]}`}
        >
          {label}
        </label>
        {extra}
        <MarcaDeGuardado estado={estado} />
      </div>
      {children}
      {mensajeDeError ? (
        <p role="alert" className="mt-1.5 text-xs text-error-fg">
          {mensajeDeError}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-fg-muted">{hint}</p>
      )}
    </div>
  );
}

/**
 * "✓ Guardado" junto al label, o "Guardando…" mientras viaja. El error no va
 * acá sino debajo del campo, donde se lee junto a lo que hay que corregir.
 */
export function MarcaDeGuardado({ estado }: { estado: EstadoDeCampo | undefined }) {
  if (estado?.tipo === "guardando") {
    return (
      <span className="inline-flex items-center gap-1 font-display text-[11px] font-semibold text-fg-muted">
        <LoaderCircle size={12} className="motion-safe:animate-spin" aria-hidden />
        Guardando…
      </span>
    );
  }
  if (estado?.tipo === "guardado") {
    return (
      <span className="inline-flex animate-[aparecer_200ms_ease-out] items-center gap-1 font-display text-[11px] font-semibold text-success-fg">
        <Check size={12} strokeWidth={2.6} aria-hidden />
        Guardado
      </span>
    );
  }
  if (estado?.tipo === "error") {
    return <TriangleAlert size={13} className="text-error-fg" aria-label="No se guardó" />;
  }
  return null;
}

/** Pill chica junto a un label. */
export function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-secondary px-2.25 py-0.5 text-[10px] font-semibold text-accent">
      {children}
    </span>
  );
}

/** Nota azul con ícono de info: contexto fijo de la página, nunca un tooltip escondido. */
export function NotaInfo({ children }: { children: ReactNode }) {
  return (
    <div className="mb-7 flex items-start gap-2.75 rounded-lg border border-info-border bg-info-bg px-4 py-3.25">
      <Info size={17} strokeWidth={1.75} className="mt-px shrink-0 text-info-fg" aria-hidden />
      <div className="text-sm leading-relaxed text-fg">{children}</div>
    </div>
  );
}

/** "Agrega esto para que…": invitación ámbar bajo un campo vacío, que no bloquea nada. */
export function Invitacion({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-xs text-warning-fg italic">{children}</p>;
}

/** Aviso ámbar dentro de una sección (ej. modismo en las dos listas). */
export function Aviso({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-warning-border bg-warning-bg px-3.5 py-3">
      <TriangleAlert size={17} strokeWidth={1.8} className="mt-px shrink-0 text-warning-fg" />
      <div className="text-xs leading-normal text-warning-fg">{children}</div>
    </div>
  );
}

function Barra({ className }: { className: string }) {
  return <div className={`skeleton rounded-md ${className}`} />;
}

/** La página cargando: título, subtítulo y tres tarjetas. */
export function SkeletonDePagina() {
  return (
    <div aria-busy="true" aria-label="Cargando">
      <Barra className="mb-2.5 h-7.5 w-55" />
      <Barra className="mb-7 h-3.5 w-full max-w-95" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="mb-5 rounded-lg border border-line bg-card p-6">
          <Barra className="mb-4.5 h-4 w-45" />
          <Barra className="mb-3 h-11 w-full" />
          <Barra className="h-11 w-[70%]" />
        </div>
      ))}
    </div>
  );
}
