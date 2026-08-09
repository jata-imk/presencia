import type { PlanTier } from "@presencia/shared";
import { useQuota } from "../../lib/use-quota.js";

const TIER_LABELS: Record<PlanTier, string> = {
  creator: "Creator",
  pro: "Pro",
  agencia: "Agencia",
};

export function PlanPage() {
  const { quota } = useQuota();

  if (!quota) return <p className="text-sm text-fg-muted">Cargando…</p>;

  const renewsAtLabel = new Date(quota.renewsAt).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
  });

  return (
    <div className="flex max-w-sm flex-col gap-4">
      <h1 className="text-xl font-bold text-fg">Créditos y plan</h1>
      <div className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4">
        <p className="text-sm font-semibold text-fg">Plan {TIER_LABELS[quota.tier]}</p>
        <div
          role="progressbar"
          aria-valuenow={quota.percentRemaining}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2 w-full overflow-hidden rounded-full bg-tint-plum"
        >
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${quota.percentRemaining}%` }}
          />
        </div>
        <p className="text-sm text-fg-secondary">
          Te alcanza para ~{quota.publicationsRemaining} publicaciones más
        </p>
        <p className="text-xs text-fg-muted">Renueva el {renewsAtLabel}</p>
      </div>
    </div>
  );
}
