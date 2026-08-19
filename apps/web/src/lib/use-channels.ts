import { useCallback, useEffect, useState } from "react";
import type { ChannelAccountDto, ConnectIntentDto } from "@presencia/shared";
import { apiFetch } from "./api.js";

// Mismo patrón casero que use-quota.ts — no hay react-query en este repo.
export function useChannels() {
  const [channels, setChannels] = useState<ChannelAccountDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    apiFetch<ChannelAccountDto[]>("/api/channels")
      .then((rows) => {
        setChannels(rows);
        setError(null);
      })
      .catch(() => setError("No pudimos cargar tus canales conectados."));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createConnectIntent = useCallback(
    () => apiFetch<ConnectIntentDto>("/api/channels/connect-intent", { method: "POST" }),
    [],
  );

  const claimConnectIntent = useCallback(
    (intentId: string) =>
      apiFetch<ChannelAccountDto[]>(`/api/channels/connect-intent/${intentId}/claim`, {
        method: "POST",
      }),
    [],
  );

  const disconnect = useCallback(
    (id: string) => apiFetch<undefined>(`/api/channels/${id}`, { method: "DELETE" }),
    [],
  );

  // Reconectar una cuenta que ya es nuestra (desconectada solo de nuestro
  // lado, la cuenta sigue viva en PostFast) es directo — no hace falta
  // volver a pasar por postfa.st. Si el backend rechaza con 409 (la cuenta
  // ya no existe del lado del proveedor — token revocado, etc.), sí hace
  // falta: "Conectar red" de nuevo, reautorizar ahí, y el claim se
  // encarga de reactivarla (ver ChannelsService.claimConnectIntent).
  const reactivate = useCallback(
    (id: string) =>
      apiFetch<ChannelAccountDto>(`/api/channels/${id}/reactivate`, {
        method: "PATCH",
      }),
    [],
  );

  return {
    channels,
    error,
    refresh,
    createConnectIntent,
    claimConnectIntent,
    disconnect,
    reactivate,
  };
}
