import type { LucideIcon } from "lucide-react";

// Las piezas comunes de las secciones de lectura rápida de Analíticas (Tus
// mejores publicaciones, Hallazgos): el encabezado con su ventana y el vacío
// que dice por qué no hay nada (la regla de Ritmo: nunca rellenar con ceros).

export function EncabezadoSeccion({
  id,
  titulo,
  subtitulo,
}: {
  id: string;
  titulo: string;
  subtitulo: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
      <h2
        id={id}
        className="font-display text-xl font-semibold tracking-[-0.01em] text-brand @4xl:text-2xl"
      >
        {titulo}
      </h2>
      <span className="text-[13px] text-fg-muted">{subtitulo}</span>
    </div>
  );
}

/** El vacío de una sección: borde punteado, un ícono y la razón. */
export function VacioSeccion({ icono: Icono, texto }: { icono: LucideIcon; texto: string }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-dashed border-ana-degradada-border bg-ana-degradada px-5 py-6 @4xl:gap-[18px] @4xl:px-7 @4xl:py-[30px]">
      <span className="flex size-[38px] shrink-0 items-center justify-center rounded-full border border-line bg-tint-plum">
        <Icono size={17} className="text-fg-secondary" aria-hidden />
      </span>
      <p className="max-w-[620px] text-sm leading-relaxed text-fg-secondary @4xl:text-[15px]">
        {texto}
      </p>
    </div>
  );
}
