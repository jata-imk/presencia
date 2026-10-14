// Marca de la app: cuadrado plum con el isotipo + wordmark opcional
// (Chat Module.html §Sidebar). Reemplaza el literal "P" que el header del
// Sidebar usaba de placeholder mientras el PNG no estaba en el repo.
//
// El glifo se pinta con mask-image, no con <img> + brightness-0 invert.
// Motivo concreto: `invert` fuerza el glifo a blanco, y en dark mode
// --interactive-primary invierte a Blush Pop (claro) — glifo blanco sobre
// fondo claro = invisible. Con máscara, el glifo toma currentColor y sigue
// el token en los dos temas. Funciona porque el PNG lleva el dibujo en el
// canal alfa (85% de sus píxeles son transparentes).
//
// El wordmark es texto vivo, no logotipo.png: nítido a cualquier DPI, se
// re-colorea solo con el tema, y pesa cero.

/**
 * Solo el glifo del isotipo, con el color del texto (`currentColor`). El
 * tamaño lo pone quien lo usa: el BrandMark de la app y el logo de las
 * pantallas de acceso (AuthLogo).
 */
export function IsotipoGlyph({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`bg-current [mask-image:url(/assets/isotipo.png)] [mask-size:contain] [mask-position:center] [mask-repeat:no-repeat] [-webkit-mask-image:url(/assets/isotipo.png)] [-webkit-mask-position:center] [-webkit-mask-repeat:no-repeat] [-webkit-mask-size:contain] ${className}`}
    />
  );
}

export function BrandMark({ withWordmark = true }: { withWordmark?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-fg">
        <IsotipoGlyph className="size-4" />
      </span>
      {withWordmark && (
        <span className="font-display text-sm font-semibold text-brand">Presencia</span>
      )}
    </span>
  );
}
