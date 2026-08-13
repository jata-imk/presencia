import type { QuotaStatusDto } from "@presencia/shared";
import { Link } from "react-router";

// Kit crudo sobre tokens de capa 3 (docs/reference/design-tokens.md) —
// mismo criterio que components/ui/Button.tsx. Solo se muestra bajo el 20%
// de cuota (state "low"/"critical", CreditsService.quotaStateFromPercent en
// la API); nunca un número crudo de créditos ni de tokens (addendum
// ADR-012) — siempre la traducción a publicaciones.
export function QuotaBanner({
  quota,
  onDismiss,
}: {
  quota: QuotaStatusDto;
  onDismiss: () => void;
}) {
  if (quota.state !== "low" && quota.state !== "critical") return null;
  const urgent = quota.state === "critical";

  return (
    <div
      role="status"
      className={`flex items-center gap-3 rounded-md p-3 text-sm ${
        urgent ? "bg-error-bg text-error" : "bg-warning-bg text-warning"
      }`}
    >
      <span className="flex-1">
        Te alcanza para ~{quota.publicationsRemaining} publicaciones más este mes.
      </span>
      <Link to="/configuracion/plan" className="shrink-0 font-semibold underline">
        Ver plan
      </Link>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Cerrar aviso de cuota"
        className="shrink-0 text-base leading-none"
      >
        ×
      </button>
    </div>
  );
}
