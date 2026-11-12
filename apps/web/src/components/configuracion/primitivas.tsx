import {
  Check,
  CircleAlert,
  Info,
  LoaderCircle,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
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
    <div className="mb-4">
      <h1 className="mb-1 font-display text-xl font-bold text-fg">{titulo}</h1>
      <p className="text-sm text-fg-secondary">{subtitulo}</p>
    </div>
  );
}

interface SeccionProps {
  icono: LucideIcon;
  titulo: string;
  subtitulo?: string;
  /** A la derecha del título (F12.5: el interruptor de «Aprender de mis ediciones»). */
  accion?: ReactNode;
  children: ReactNode;
}

/**
 * Un bloque de la página: tarjeta con cuadrito de ícono, título y subtítulo.
 *
 * F12.5: más compacta (padding, huecos y textos un paso abajo). Jose sentía
 * Configuración "muy grande y separada": inputs altos, ayudas lejos de su
 * campo. Afecta a todas las páginas de Configuración por igual.
 */
export function Seccion({ icono: Icono, titulo, subtitulo, accion, children }: SeccionProps) {
  return (
    <section className="mb-4 rounded-lg border border-line bg-card p-4 md:p-5">
      <div className="mb-1 flex items-center gap-2.5">
        <div className="flex size-7.5 shrink-0 items-center justify-center rounded-md bg-secondary">
          <Icono size={16} strokeWidth={1.5} className="text-accent" aria-hidden />
        </div>
        <h2 className="min-w-0 flex-1 font-display text-md font-semibold text-fg">{titulo}</h2>
        {accion}
      </div>
      {subtitulo && <p className="mb-4 text-[12.5px] text-fg-muted md:ml-10">{subtitulo}</p>}
      <div className="flex flex-col gap-4">{children}</div>
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
      <div className="mb-1.5 flex min-h-4.5 flex-wrap items-center gap-2">
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
        <p role="alert" className="mt-1 text-[11.5px] leading-snug text-error-fg">
          {mensajeDeError}
        </p>
      ) : (
        hint && <p className="mt-1 text-[11.5px] leading-snug text-fg-muted">{hint}</p>
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
    <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-info-border bg-info-bg px-3.5 py-2.75">
      <Info size={16} strokeWidth={1.75} className="mt-px shrink-0 text-info-fg" aria-hidden />
      <div className="text-[12.5px] leading-relaxed text-fg">{children}</div>
    </div>
  );
}

/** "Agrega esto para que…": invitación ámbar bajo un campo vacío, que no bloquea nada. */
export function Invitacion({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 text-[11.5px] leading-snug text-warning-fg italic">{children}</p>;
}

const TONO_AVISO = {
  warning: {
    Icono: TriangleAlert,
    caja: "border-warning-border bg-warning-bg",
    texto: "text-warning-fg",
  },
  // F11 PR7a: algo que no se pudo hacer ("ya está conectada a otro perfil").
  error: { Icono: CircleAlert, caja: "border-error-border bg-error-bg", texto: "text-error-fg" },
} as const;

/** Aviso dentro de una sección: ámbar (ej. modismo en las dos listas) o rojo. */
export function Aviso({
  children,
  tono = "warning",
}: {
  children: ReactNode;
  tono?: keyof typeof TONO_AVISO;
}) {
  const { Icono, caja, texto } = TONO_AVISO[tono];
  return (
    <div className={`flex items-start gap-2 rounded-md border px-3 py-2.5 ${caja}`}>
      <Icono size={15} strokeWidth={1.8} className={`mt-px shrink-0 ${texto}`} aria-hidden />
      <div className={`text-xs leading-normal ${texto}`}>{children}</div>
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
