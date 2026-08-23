import type { ComponentType } from "react";
import { AlertCircle, Check, CheckCircle2, Clock, Sparkles } from "lucide-react";
import type { CardStatus } from "@presencia/shared";

// Portado de arquetipos.jsx (Claude Design "Presencia - Chat"). El mockup
// no diseñó "failed" (nuestro estado real de reconciliación, F6 PR2) ni
// "canceled" (reservado para Biblioteca) — se extienden en el mismo
// lenguaje visual (pastilla redondeada, ícono + label) con tokens de
// estado ya existentes, no colores nuevos inventados.
export type BadgeKind = CardStatus | "waiting";

interface BadgeVariant {
  Icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  classes: string;
}

const VARIANTS: Record<BadgeKind, BadgeVariant> = {
  draft: {
    Icon: Sparkles,
    label: "Borrador",
    classes: "bg-ai-bg text-accent border-ai-border",
  },
  scheduled: {
    Icon: Check,
    label: "Programado",
    classes: "bg-info-bg text-info border-info-border",
  },
  published: {
    Icon: CheckCircle2,
    label: "Publicado",
    classes: "bg-success-bg text-success border-success-border",
  },
  waiting: {
    Icon: Clock,
    label: "Esperando material",
    classes: "bg-warning-bg text-warning border-warning-border",
  },
  failed: {
    Icon: AlertCircle,
    label: "Falló",
    classes: "bg-error-bg text-error border-error-border",
  },
  canceled: {
    Icon: AlertCircle,
    label: "Cancelado",
    classes: "bg-secondary text-fg-muted border-line",
  },
};

export function Badge({ kind, small = false }: { kind: BadgeKind; small?: boolean }) {
  const variant = VARIANTS[kind];
  const Icon = variant.Icon;
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full border font-semibold ${
        small ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"
      } ${variant.classes}`}
    >
      <Icon size={small ? 10 : 11} strokeWidth={2} />
      <span>{variant.label}</span>
    </div>
  );
}
