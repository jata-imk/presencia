import { FORMALITY_ZONES, formalityZoneLabel } from "@presencia/shared";

// Slider continuo 0-100 (doc presencia-configuracion-voz-de-marca.md §4):
// reemplaza el single-select del onboarding en Configuración. El usuario
// razona en zonas, no en el número pelado — el pin muestra su posición
// exacta, las etiquetas dan contexto cualitativo a lo largo del track.
// Zonas importadas de shared (no propias): tienen que coincidir exacto con
// las que usa el system prompt (chat/system-prompt.ts) para el mismo
// valor, o el usuario ve un registro en la UI distinto al que recibe el
// modelo.

interface FormalitySliderProps {
  value: number;
  onChange: (next: number) => void;
  id?: string;
}

export function FormalitySlider({ value, onChange, id }: FormalitySliderProps) {
  return (
    <div className="flex flex-col gap-2">
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
      <div className="flex justify-between text-xs text-fg-muted">
        {FORMALITY_ZONES.map((zone) => (
          <span key={zone.label}>{zone.label}</span>
        ))}
      </div>
      <p className="text-xs text-fg-secondary">Zona actual: {formalityZoneLabel(value)}</p>
    </div>
  );
}
