import { Link } from "react-router";
import { BarChart2, WifiOff } from "lucide-react";
import { Button } from "../ui/Button.js";
import { COLUMNAS_RED } from "./LentePorRed.js";

// Los estados especiales de Analíticas (lore doc §6). La regla es la de
// Ritmo: se dice por qué está vacío y qué falta, nunca se rellena con ceros.

/** Nunca ha publicado nada (3a). */
export function CeroAbsoluto() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line bg-card px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-secondary">
        <BarChart2 size={22} className="text-fg-muted" aria-hidden />
      </div>
      <p className="font-display text-lg font-semibold text-brand">Todavía no hay datos</p>
      <p className="max-w-[380px] text-[13px] leading-relaxed text-fg-secondary">
        Cuando publiques tus primeras piezas, aquí vas a ver cómo te fue.
      </p>
      <Link
        to="/chats"
        className="mt-1 inline-flex h-10 items-center rounded-full bg-primary px-5 font-display text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
      >
        Crear mi primera publicación
      </Link>
    </div>
  );
}

/**
 * No se pudo cargar (el diseño no lo traía; lore doc §6). "Tus datos siguen
 * ahí": un fallo de red no es "no tienes publicaciones".
 */
export function AnaliticasError({
  onReintentar,
  compacto = false,
}: {
  onReintentar: () => void;
  /** Dentro de una lente: el resto de la pantalla sigue en pie. */
  compacto?: boolean;
}) {
  return (
    <div
      role="alert"
      className={`flex items-center gap-3 rounded-xl border border-error-border bg-error-bg px-4 ${
        compacto ? "py-3" : "py-4"
      }`}
    >
      <WifiOff size={16} className="shrink-0 text-error" aria-hidden />
      <span className="flex-1 text-[13px] text-error-fg">
        {compacto
          ? "No pudimos cargar esta vista. Tus datos siguen ahí."
          : "No pudimos cargar tus analíticas. Tus datos siguen ahí. Inténtalo de nuevo."}
      </span>
      <Button variant="secondary" onClick={onReintentar}>
        Reintentar
      </Button>
    </div>
  );
}

function Barra({ className }: { className: string }) {
  return <div className={`rounded-md bg-secondary ${className}`} />;
}

/** Los cuatro tiles mientras carga el resumen, con su alto real. */
export function ResumenSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-3.5" aria-hidden>
      <Barra className="h-[18px] w-[280px] max-w-full" />
      <div className="grid grid-cols-2 gap-3 @4xl:grid-cols-4 @4xl:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-line bg-card p-4 @4xl:p-5">
            <Barra className="h-3 w-24" />
            <Barra className="mt-3 h-9 w-20" />
            <Barra className="mt-3 h-5 w-32 max-w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Las tarjetas de "Por red" o las filas de la tabla, con su forma. */
export function LenteSkeleton({ forma = "red" }: { forma?: "red" | "tabla" }) {
  if (forma === "tabla") {
    return (
      <div className="flex animate-pulse flex-col gap-2" aria-hidden>
        <Barra className="mb-1 h-[18px] w-[300px] max-w-full" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 @4xl:gap-4 @4xl:px-5 @4xl:py-3.5"
          >
            <Barra className="size-11 shrink-0 rounded-lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Barra className="h-3 w-20" />
              <Barra className="h-4 w-full max-w-[260px]" />
            </div>
            <Barra className="h-6 w-14" />
          </div>
        ))}
      </div>
    );
  }
  const filas = 3;
  return (
    <div className="flex animate-pulse flex-col gap-3" aria-hidden>
      {Array.from({ length: filas }).map((_, i) => (
        <div
          key={i}
          className={`grid gap-4 rounded-xl border border-line bg-card px-5 py-4 ${COLUMNAS_RED}`}
        >
          <div className="flex items-center gap-3">
            <Barra className="size-8 rounded-[9px]" />
            <Barra className="h-4 w-24" />
          </div>
          <Barra className="h-8 w-20" />
          <div className="flex min-w-0 flex-wrap gap-x-6 gap-y-2 @4xl:gap-x-8">
            <Barra className="h-9 w-16" />
            <Barra className="h-9 w-16" />
            <Barra className="h-9 w-16" />
          </div>
          <Barra className="h-14 w-full" />
        </div>
      ))}
    </div>
  );
}

/** La pantalla entera mientras llega el resumen (3h). */
export function AnaliticasSkeleton() {
  return (
    <div className="flex flex-col gap-7">
      <ResumenSkeleton />
      <div className="flex animate-pulse flex-col gap-4" aria-hidden>
        <Barra className="h-10 w-[250px] rounded-full" />
      </div>
      <LenteSkeleton />
    </div>
  );
}
