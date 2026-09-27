import { Zap } from "lucide-react";
import type { PlanTier } from "@presencia/shared";
import {
  EncabezadoDePagina,
  Seccion,
  SkeletonDePagina,
} from "../../components/configuracion/primitivas.js";
import { formatShortDate } from "../../lib/format-date.js";
import { useQuota } from "../../lib/use-quota.js";

// Créditos y plan (F5, addendum ADR-012): el saldo nunca se muestra crudo —
// porcentaje de la cuota y su traducción a publicaciones.

const TIER_LABELS: Record<PlanTier, string> = {
  creator: "Creator",
  pro: "Pro",
  agencia: "Agencia",
};

export function PlanPage() {
  const { quota } = useQuota();

  if (!quota) return <SkeletonDePagina />;

  return (
    <div>
      <EncabezadoDePagina
        titulo="Créditos y plan"
        subtitulo="Lo que te queda este mes, en lo que importa: publicaciones."
      />

      <Seccion icono={Zap} titulo={`Plan ${TIER_LABELS[quota.tier]}`}>
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-display text-2xl font-bold text-fg">
              {quota.percentRemaining}%
              <span className="ml-1.5 text-sm font-medium text-fg-secondary">de tu cuota</span>
            </p>
            <p className="text-xs text-fg-muted">Renueva el {formatShortDate(quota.renewsAt)}</p>
          </div>
          <div
            role="progressbar"
            aria-valuenow={quota.percentRemaining}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Cuota restante"
            className="h-2 w-full overflow-hidden rounded-full bg-tint-plum"
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${quota.percentRemaining}%` }}
            />
          </div>
          <p className="text-sm text-fg-secondary">
            Te alcanza para ~{quota.publicationsRemaining} publicaciones más.
          </p>
        </div>
      </Seccion>
    </div>
  );
}
