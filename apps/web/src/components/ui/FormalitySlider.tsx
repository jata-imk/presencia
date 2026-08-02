// Slider continuo 0-100 (doc presencia-configuracion-voz-de-marca.md §4):
// reemplaza el single-select del onboarding en Configuración. El usuario
// razona en zonas, no en el número pelado — el pin muestra su posición
// exacta, las 4 etiquetas dan contexto cualitativo a lo largo del track.
const ZONES = [
  { max: 25, label: "De barrio" },
  { max: 50, label: "Casual" },
  { max: 75, label: "Neutro-profesional" },
  { max: 100, label: "Técnico/formal" },
];

function zoneLabel(value: number): string {
  return ZONES.find((zone) => value <= zone.max)?.label ?? "Técnico/formal";
}

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
        {ZONES.map((zone) => (
          <span key={zone.label}>{zone.label}</span>
        ))}
      </div>
      <p className="text-xs text-fg-secondary">Zona actual: {zoneLabel(value)}</p>
    </div>
  );
}
