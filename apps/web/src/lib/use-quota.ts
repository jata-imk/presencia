import { useCallback, useEffect, useState } from "react";
import type { QuotaStatusDto } from "@presencia/shared";
import { apiFetch } from "./api.js";

// Nunca crudo (addendum ADR-012): este DTO ya trae el % y la traducción a
// publicaciones — el componente no hace ninguna cuenta.
export function useQuota() {
  const [quota, setQuota] = useState<QuotaStatusDto | null>(null);

  const refresh = useCallback(() => {
    apiFetch<QuotaStatusDto>("/api/me/quota")
      .then(setQuota)
      .catch(() => {
        // Silencioso a propósito (mismo criterio que loadVoiceForPrompt en
        // la API): el banner de cuota no debe tumbar el chat si esto falla.
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { quota, refresh };
}
