import { Check, ChevronDown, Clock, Globe } from "lucide-react";
import {
  NETWORK_LABELS,
  PERIODOS_ANALITICAS,
  type PeriodoAnaliticas,
  type SocialNetwork,
} from "@presencia/shared";
import { NETWORK_META } from "../cards/NetworkLogos.js";
import { Menu, MENU_CONTENT_CLASS, MENU_ITEM_CLASS } from "../ui/Menu.js";
import { avisarActualizacion } from "../../lib/analiticas/formato.js";
import { haceCuanto } from "../../lib/relative-time.js";

// La barra de control de Analíticas (lore doc §3): periodo, red y, si los
// datos llevan rato sin moverse, "Actualizado hace…". Sin "Personalizado" ni
// filtro de carpeta en V1 (§8).

const PILL = "rounded-full border border-line bg-card";

export function BarraControl({
  periodo,
  onPeriodo,
  red,
  onRed,
  redes,
  ultimaMedicion,
  ahora,
}: {
  periodo: PeriodoAnaliticas;
  onPeriodo: (periodo: PeriodoAnaliticas) => void;
  red: SocialNetwork | null;
  onRed: (red: SocialNetwork | null) => void;
  /** Las redes con publicaciones en el periodo; la elegida se agrega si no está. */
  redes: readonly SocialNetwork[];
  ultimaMedicion: string | null;
  ahora: Date;
}) {
  const opciones = red && !redes.includes(red) ? [...redes, red] : redes;
  const MetaRed = red ? NETWORK_META[red] : null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] text-brand @4xl:text-[30px]">
        Analíticas
      </h1>
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Periodo" className={`inline-flex gap-0.5 p-[3px] ${PILL}`}>
          {PERIODOS_ANALITICAS.map((dias) => {
            const activo = dias === periodo;
            return (
              <button
                key={dias}
                type="button"
                role="tab"
                aria-selected={activo}
                onClick={() => onPeriodo(dias)}
                className={`rounded-full px-3.5 py-1.5 font-display text-[13px] transition-colors ${
                  activo
                    ? "bg-primary font-semibold text-primary-fg"
                    : "font-medium text-fg-secondary hover:text-fg"
                }`}
              >
                {dias} días
              </button>
            );
          })}
        </div>

        <Menu placement="bottom-start">
          <Menu.Trigger
            aria-label="Red"
            className={`flex items-center gap-2 px-3.5 py-[7px] font-display text-[13px] font-medium text-brand transition-colors hover:border-line-focus ${PILL}`}
          >
            {MetaRed ? (
              <MetaRed.Logo size={14} />
            ) : (
              <Globe size={14} className="text-fg-secondary" aria-hidden />
            )}
            {red ? NETWORK_LABELS[red] : "Todas las redes"}
            <ChevronDown size={13} className="text-fg-muted" aria-hidden />
          </Menu.Trigger>
          <Menu.Content className={MENU_CONTENT_CLASS}>
            <Menu.Item className={MENU_ITEM_CLASS} onClick={() => onRed(null)}>
              <Globe size={15} className="text-fg-secondary" aria-hidden />
              <span className="flex-1">Todas las redes</span>
              {red === null && <Check size={14} className="text-brand" aria-label="Elegida" />}
            </Menu.Item>
            {opciones.map((network) => {
              const meta = NETWORK_META[network];
              return (
                <Menu.Item key={network} className={MENU_ITEM_CLASS} onClick={() => onRed(network)}>
                  <meta.Logo size={15} />
                  <span className="flex-1">{meta.label}</span>
                  {red === network && (
                    <Check size={14} className="text-brand" aria-label="Elegida" />
                  )}
                </Menu.Item>
              );
            })}
          </Menu.Content>
        </Menu>

        {/* Una nota, no una alarma (lore doc §6): la escalera de la ingesta
            mide una vez al día lo que ya tiene días, así que con poca
            actividad aparece seguido, y siempre es cierta. */}
        {avisarActualizacion(ultimaMedicion, ahora) && ultimaMedicion && (
          <span className="flex items-center gap-1.5 text-xs text-fg-muted">
            <Clock size={13} aria-hidden />
            Actualizado {haceCuanto(ultimaMedicion, ahora)}
          </span>
        )}
      </div>
    </div>
  );
}
