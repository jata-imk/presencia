import { ChevronRight, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Tooltip } from "../ui/Tooltip.js";

// Piezas del panel de publicación (F10.5) compartidas entre la vista previa,
// el editor y las versiones.

export function Section({
  title,
  Icon,
  meta,
  defaultOpen = true,
  children,
}: {
  title: string;
  Icon: LucideIcon;
  meta?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-line">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-11 w-full items-center gap-2 px-4 text-left"
      >
        <ChevronRight
          size={14}
          aria-hidden="true"
          className={`text-fg-muted transition-transform ${open ? "rotate-90" : ""}`}
        />
        <Icon size={15} aria-hidden="true" className="text-fg-secondary" />
        <span className="font-display text-[13.5px] font-semibold text-fg">{title}</span>
        {meta && <span className="text-xs text-fg-muted">{meta}</span>}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

/** Cuánto del límite de la red usa el texto que se publicaría. */
export function Counter({
  used,
  limit,
  network,
}: {
  used: number;
  limit: number;
  network: string;
}) {
  const ratio = used / limit;
  const color = ratio > 1 ? "bg-error" : ratio > 0.85 ? "bg-warning" : "bg-success";
  const textColor = ratio > 1 ? "text-error" : ratio > 0.85 ? "text-warning" : "text-fg-muted";
  return (
    <div className="mt-2 flex items-center gap-2.5 text-[11.5px] text-fg-muted">
      <span className="whitespace-nowrap">Límite de {network}</span>
      <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-line">
        <div
          className={`h-full ${color}`}
          style={{ width: `${String(Math.min(ratio, 1) * 100)}%` }}
        />
      </div>
      <span className={`font-display font-semibold ${textColor}`}>
        {used.toLocaleString("es-MX")} / {limit.toLocaleString("es-MX")}
      </span>
    </div>
  );
}

export function Notice({
  kind,
  Icon,
  children,
  action,
}: {
  kind: "info" | "error";
  Icon: LucideIcon;
  children: ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-[12.5px] leading-normal text-fg ${
        kind === "error" ? "bg-error-bg" : "bg-info-bg"
      }`}
    >
      <Icon
        size={15}
        aria-hidden="true"
        className={`mt-px shrink-0 ${kind === "error" ? "text-error" : "text-info"}`}
      />
      <div className="flex-1">
        {children}
        {action && (
          <div className="mt-2">
            <button
              type="button"
              onClick={action.onClick}
              className="inline-flex h-7 items-center rounded-md bg-card px-2.5 font-display text-xs font-semibold text-fg shadow-xs hover:bg-surface"
            >
              {action.label}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface SegmentOption<T extends string> {
  value: T;
  label: string;
  Icon: LucideIcon;
  disabled?: boolean;
  title?: string;
}

export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  small = false,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  small?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-lg border border-line bg-surface p-0.5"
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Tooltip key={o.value} label={o.title}>
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={o.disabled}
              onClick={() => onChange(o.value)}
              className={`inline-flex items-center gap-1.5 rounded-md font-display font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                small ? "h-6 px-2 text-[11.5px]" : "h-7 px-2.5 text-[12.5px]"
              } ${selected ? "bg-card text-fg shadow-xs" : "text-fg-muted hover:text-fg-secondary"}`}
            >
              <o.Icon size={small ? 13 : 14} aria-hidden="true" />
              {o.label}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
