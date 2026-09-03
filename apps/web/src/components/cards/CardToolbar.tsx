import type { ComponentType } from "react";
import {
  BarChart2,
  Calendar,
  CalendarClock,
  ExternalLink,
  Maximize2,
  Pencil,
  RefreshCw,
  Repeat2,
  XCircle,
} from "lucide-react";
import type { CardStatus } from "@presencia/shared";
import { Tooltip } from "../ui/Tooltip.js";

// Portado de Toolbar/TBtn (arquetipos.jsx). Editar/Adaptar/Regenerar/
// Expandir/Ver estadísticas/Ver post/Adaptar a otra red no existen todavía
// (dependen de módulos fuera de F6) — se muestran deshabilitadas con
// tooltip "Próximamente" en el mismo lenguaje visual, no se inventan.
// "failed" (F6 PR2, reconciliación real vía PostFast) no está en el
// mockup — extendido en el mismo lenguaje visual: "Reintentar" primario.

interface ToolbarAction {
  Icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  primary?: boolean;
  danger?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

function ToolbarButton({ action }: { action: ToolbarAction }) {
  const { Icon, label, primary, danger, onClick, disabled } = action;
  return (
    <Tooltip label={disabled ? "Próximamente" : undefined}>
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50 ${
          primary
            ? "bg-primary font-semibold text-primary-fg"
            : danger
              ? "border border-error-border bg-card font-medium text-error"
              : "border border-line bg-card font-medium text-fg-secondary"
        }`}
      >
        <Icon size={13} strokeWidth={primary ? 2 : 1.75} />
        {label}
      </button>
    </Tooltip>
  );
}

function Separator() {
  return <div className="mx-0.5 h-6 w-px shrink-0 bg-line" />;
}

export function CardToolbar({
  status,
  busy,
  onSchedule,
  onCancel,
}: {
  status: CardStatus;
  busy: boolean;
  onSchedule: () => void;
  onCancel: () => void;
}) {
  const actions: (ToolbarAction | "sep")[] = (() => {
    switch (status) {
      case "draft":
        return [
          { Icon: Calendar, label: "Programar", primary: true, onClick: onSchedule },
          { Icon: Pencil, label: "Editar", disabled: true },
          { Icon: Repeat2, label: "Adaptar", disabled: true },
          { Icon: RefreshCw, label: "Regenerar", disabled: true },
          { Icon: Maximize2, label: "Expandir", disabled: true },
        ];
      case "scheduled":
        return [
          { Icon: CalendarClock, label: "Reprogramar", primary: true, onClick: onSchedule },
          { Icon: Pencil, label: "Editar", disabled: true },
          { Icon: Repeat2, label: "Adaptar", disabled: true },
          { Icon: Maximize2, label: "Expandir", disabled: true },
          "sep",
          {
            Icon: XCircle,
            label: "Cancelar programación",
            danger: true,
            onClick: onCancel,
            disabled: busy,
          },
        ];
      case "failed":
        return [
          { Icon: RefreshCw, label: "Reintentar", primary: true, onClick: onSchedule },
          { Icon: Pencil, label: "Editar", disabled: true },
        ];
      case "published":
        return [
          { Icon: BarChart2, label: "Ver estadísticas", disabled: true },
          { Icon: Repeat2, label: "Adaptar a otra red", disabled: true },
          { Icon: ExternalLink, label: "Ver post", disabled: true },
          { Icon: Maximize2, label: "Expandir", disabled: true },
        ];
      case "canceled":
        return [];
    }
  })();

  if (actions.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto border-t border-line px-3.5 py-2.5">
      {actions.map((action, i) =>
        action === "sep" ? <Separator key={i} /> : <ToolbarButton key={i} action={action} />,
      )}
    </div>
  );
}
