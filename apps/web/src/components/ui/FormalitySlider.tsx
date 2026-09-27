import { FORMALITY_ZONES, formalityZoneLabel } from "@presencia/shared";

// Slider continuo 0-100 (doc presencia-configuracion-voz-de-marca.md §4):
// reemplaza el single-select del onboarding en Configuración. El usuario
// razona en zonas, no en el número pelado — el pin encima del thumb dice en
// qué zona está, y las etiquetas de abajo marcan la activa. Zonas importadas
// de shared (no propias): tienen que coincidir exacto con las que usa el
// system prompt (chat/system-prompt.ts) para el mismo valor, o el usuario ve
// un registro en la UI distinto al que recibe el modelo.
//
// Diseño del mock de Claude Design (F9.7), con una diferencia: el mock dibuja
// cuatro zonas iguales y las reales son cinco y desparejas, así que cada
// etiqueta se centra sobre SU tramo del track (y el degradado de app.css
// corta en los mismos `max`).

interface FormalitySliderProps {
  value: number;
  onChange: (next: number) => void;
  id?: string;
}

/** Radio del thumb en px: el pin tiene que seguir su CENTRO, no el valor crudo. */
const RADIO_THUMB = 12;

export function FormalitySlider({ value, onChange, id }: FormalitySliderProps) {
  const zonaActiva = formalityZoneLabel(value);
  // El thumb no recorre el ancho entero: su centro va de RADIO a (ancho - RADIO).
  const pin = `calc(${String(value)}% + ${String(RADIO_THUMB - (value * RADIO_THUMB * 2) / 100)}px)`;
  const tramos = FORMALITY_ZONES.map((zona, i) => {
    const desde = i === 0 ? 0 : (FORMALITY_ZONES[i - 1]?.max ?? 0) + 1;
    return { ...zona, centro: (desde + zona.max) / 2 };
  });

  return (
    <div className="relative px-1 pt-9.5">
      <div
        className="pointer-events-none absolute top-0 -translate-x-1/2"
        style={{ left: pin }}
        aria-hidden
      >
        <span className="inline-block rounded-full bg-primary px-2.5 py-1 font-display text-[11px] font-semibold whitespace-nowrap text-primary-fg">
          {zonaActiva}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        value={value}
        aria-valuetext={zonaActiva}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider-formalidad"
      />
      <div className="relative mt-3.5 h-8">
        {tramos.map((zona, i) => (
          <span
            key={zona.label}
            // En móvil no caben las cinco (a 375px "Profesional" y
            // "Técnico/formal" se enciman): quedan las dos puntas como ancla
            // y el pin dice en cuál estás.
            className={`absolute w-16 -translate-x-1/2 text-center font-display text-[10.5px] leading-tight ${
              zona.label === zonaActiva ? "font-bold text-brand" : "font-medium text-fg-muted"
            } ${i === 0 || i === tramos.length - 1 ? "" : "hidden md:block"}`}
            style={{ left: `${String(zona.centro)}%` }}
          >
            {zona.label}
          </span>
        ))}
      </div>
    </div>
  );
}
