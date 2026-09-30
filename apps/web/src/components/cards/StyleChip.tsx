import { ChevronDown, Palette, Settings } from "lucide-react";
import { IMAGE_STYLES, imageStyleDef, type ImageStyle } from "@presencia/shared";
import { Menu, MENU_ITEM_CLASS } from "../ui/Menu.js";

// "Estilo: X ▾" junto a las acciones de imagen (F10.6, StyleMenu de "Chat
// Rediseño"). Elige el estilo de la SIGUIENTE generación de esta card: no
// genera nada por sí solo, y no toca el default de la Voz de marca —para eso
// está el link de abajo, que lleva a Configuración.
//
// Las miniaturas son la escena base de la galería de Configuración: el mismo
// café en cada estilo, así que se comparan estilos y no escenas. Los nombres
// cortan con guion ("Neobru-talismo"): a 320 px la columna mide ~69 px.

export function StyleChip({
  value,
  onChange,
  disabled,
}: {
  value: ImageStyle;
  onChange: (style: ImageStyle) => void;
  disabled?: boolean;
}) {
  const actual = imageStyleDef(value);
  return (
    <Menu placement="bottom-start">
      <Menu.Trigger
        disabled={disabled}
        aria-label={`Estilo de la imagen: ${actual.name}`}
        className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-card px-2.5 font-display text-xs font-semibold text-fg hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50 aria-expanded:border-line-focus aria-expanded:bg-tint-plum"
      >
        <Palette size={13} strokeWidth={1.75} aria-hidden />
        Estilo: {actual.name}
        <ChevronDown size={12} aria-hidden />
      </Menu.Trigger>
      <Menu.Content className="w-80 rounded-xl border border-line bg-card p-2.5 shadow-lg outline-none">
        <div className="grid grid-cols-4 gap-2">
          {IMAGE_STYLES.map((estilo) => {
            const elegido = estilo.id === value;
            return (
              <Menu.Item
                key={estilo.id}
                onClick={() => onChange(estilo.id)}
                title={estilo.desc}
                className="flex flex-col items-center gap-1 rounded-lg p-0.5 outline-none data-[active]:bg-secondary-hover"
              >
                <img
                  src={`/assets/estilos/${estilo.id}-base.webp`}
                  alt=""
                  loading="lazy"
                  className={`aspect-square w-full rounded-md object-cover ${
                    elegido ? "outline-2 outline-offset-2 outline-primary" : ""
                  }`}
                />
                <span
                  className={`w-full text-center text-[10.5px] leading-tight hyphens-auto ${
                    elegido ? "font-semibold text-fg" : "font-medium text-fg-secondary"
                  }`}
                >
                  {estilo.name}
                  {elegido && <span className="sr-only"> (elegido)</span>}
                </span>
              </Menu.Item>
            );
          })}
        </div>
        <div className="mt-2.5 border-t border-line pt-1.5">
          <Menu.Item
            href="/configuracion/estilo-visual"
            className={`${MENU_ITEM_CLASS} font-display text-xs font-semibold text-accent`}
          >
            <Settings size={12} aria-hidden />
            Cambiar tu estilo por defecto
          </Menu.Item>
        </div>
      </Menu.Content>
    </Menu>
  );
}
