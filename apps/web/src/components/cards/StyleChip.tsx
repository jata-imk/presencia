import { ChevronDown, Settings } from "lucide-react";
import { IMAGE_STYLES, imageStyleDef, type ImageStyle } from "@presencia/shared";
import { Menu, MENU_ITEM_CLASS } from "../ui/Menu.js";
import { Tooltip } from "../ui/Tooltip.js";

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
        className="inline-flex h-8 items-center gap-2 rounded-full border border-line bg-card py-1 pr-2.5 pl-1 font-display text-xs font-semibold text-fg hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50 aria-expanded:border-line-focus aria-expanded:bg-tint-plum"
      >
        {/* F10.6.1: la miniatura del estilo elegido, no un ícono genérico:
            se ve QUÉ estilo sin abrir el menú. */}
        <img
          src={`/assets/estilos/${actual.id}-base.webp`}
          alt=""
          className="size-6 rounded-full object-cover ring-1 ring-line"
        />
        <span className="font-medium text-fg-muted">Estilo</span>
        {actual.name}
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
                className="flex flex-col items-center gap-1 rounded-lg p-0.5 outline-none data-[active]:bg-secondary-hover"
              >
                {/* El tooltip cuelga de la miniatura: Menu.Item no recibe ref de afuera. */}
                <Tooltip label={estilo.desc}>
                  <img
                    src={`/assets/estilos/${estilo.id}-base.webp`}
                    alt=""
                    loading="lazy"
                    className={`aspect-square w-full rounded-md object-cover ${
                      elegido ? "outline-2 outline-offset-2 outline-primary" : ""
                    }`}
                  />
                </Tooltip>
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
