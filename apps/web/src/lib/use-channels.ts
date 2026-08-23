import { useCallback, useEffect, useState } from "react";
import type { ChannelAccountDto, ConnectIntentDto } from "@presencia/shared";
import { apiFetch } from "./api.js";

// Mismo patrón casero que use-quota.ts — no hay react-query en este repo.
// F6 follow-up: las cuentas desconectadas ya no viven mezcladas en
// `channels` (GET /api/channels las excluye del lado del backend) — tienen
// su propia vista (canales-desconectadas.tsx), con su propio fetch
// perezoso vía refreshDisconnected (no se pide en cada montaje de
// useChannels, solo cuando esa vista lo pide explícitamente).
export function useChannels() {
  const [channels, setChannels] = useState<ChannelAccountDto[] | null>(null);
  const [disconnectedChannels, setDisconnectedChannels] = useState<ChannelAccountDto[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    apiFetch<ChannelAccountDto[]>("/api/channels")
      .then((rows) => {
        setChannels(rows);
        setError(null);
      })
      .catch(() => setError("No pudimos cargar tus canales conectados."));
  }, []);

  const refreshDisconnected = useCallback(() => {
    apiFetch<ChannelAccountDto[]>("/api/channels/disconnected")
      .then((rows) => {
        setDisconnectedChannels(rows);
        setError(null);
      })
      .catch(() => setError("No pudimos cargar tus cuentas desconectadas."));
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

  // Borrado permanente — ruta distinta de `disconnect` (esa es DELETE
  // /api/channels/:id, el soft-disconnect que ya existía).
  const deleteForever = useCallback(
    (id: string) => apiFetch<undefined>(`/api/channels/${id}/permanent`, { method: "DELETE" }),
    [],
  );

  return {
    channels,
    disconnectedChannels,
    error,
    refresh,
    refreshDisconnected,
    createConnectIntent,
    claimConnectIntent,
    disconnect,
    reactivate,
    deleteForever,
  };
}
