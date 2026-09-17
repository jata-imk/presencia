import { useEffect } from "react";
import type { PublicationCardDto } from "@presencia/shared";
import { useCardsStore } from "../../stores/cards-store.js";

const RECONNECT_MIN_MS = 3_000;
const RECONNECT_MAX_MS = 60_000;
/**
 * Sin ningún evento en este tiempo, la conexión se da por muerta. El servidor
 * manda `ping` cada 20 s (HEARTBEAT_MS en la API): 50 s tolera que se pierda
 * uno sin reconectar de más.
 */
const STALE_MS = 50_000;

/**
 * Mantiene las cards al día sin recargar (F8.6, addenda de ADR-006 y
 * ADR-018). Abre `GET /api/stream` mientras el shell autenticado está
 * montado y aplica cada evento al store normalizado. No renderiza nada.
 *
 * Tres caminos llevan a `revalidate` (volver a pedir lo que está en
 * pantalla), porque NOTIFY no se encola y lo que pasó sin stream no vuelve:
 * - el servidor avisa `resync` (su listener de Postgres se reconectó);
 * - el stream se reconecta después de un corte (deploy, red, laptop dormida);
 * - la pestaña vuelve a ser visible.
 *
 * Vive dentro del shell y no en ProtectedLayout: ahí los hooks correrían
 * antes de saber si hay sesión, y en onboarding no hay cards que mirar.
 * Cerrar sesión desmonta el shell y el cleanup cierra el stream.
 */
export function LiveCards(): null {
  const apply = useCardsStore((s) => s.apply);
  const remove = useCardsStore((s) => s.remove);
  const revalidate = useCardsStore((s) => s.revalidate);

  useEffect(() => {
    let source: EventSource | null = null;
    let disposed = false;
    let lostConnection = false;
    let lastSeen = Date.now();
    let reconnectDelay = RECONNECT_MIN_MS;
    let reconnectTimer: number | null = null;
    // Coalescida: volver a la pestaña justo cuando el stream se reconecta no
    // tiene por qué pedir todo dos veces.
    let inFlight: Promise<void> | null = null;
    const revalidateOnce = () => {
      inFlight ??= revalidate().finally(() => {
        inFlight = null;
      });
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer !== null) return;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        open();
      }, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
    };

    const open = () => {
      if (disposed) return;
      source?.close();
      const es = new EventSource("/api/stream");
      source = es;
      lastSeen = Date.now();
      const seen = () => {
        lastSeen = Date.now();
      };

      es.addEventListener("ping", seen);
      es.addEventListener("card", (event) => {
        seen();
        apply(JSON.parse((event as MessageEvent<string>).data) as PublicationCardDto);
      });
      es.addEventListener("card-deleted", (event) => {
        seen();
        remove((JSON.parse((event as MessageEvent<string>).data) as { id: string }).id);
      });
      es.addEventListener("resync", () => {
        seen();
        revalidateOnce();
      });

      es.onopen = () => {
        seen();
        reconnectDelay = RECONNECT_MIN_MS;
        if (lostConnection) {
          lostConnection = false;
          revalidateOnce();
        }
      };
      es.onerror = () => {
        lostConnection = true;
        // Un corte de red lo reconecta EventSource solo (queda CONNECTING).
        // Pero si la respuesta no fue un stream —un 502 de nginx durante un
        // deploy, un 401— lo cierra para siempre: ahí se reintenta a mano,
        // con espera creciente para no martillar un servidor caído.
        if (es.readyState !== EventSource.CLOSED) return;
        es.close();
        scheduleReconnect();
      };
    };

    // Watchdog: una conexión medio abierta (laptop dormida, un proxy que no
    // propaga el cierre del servidor) no dispara `error` nunca. Sin pings, se
    // cierra y se abre otra.
    const watchdog = window.setInterval(() => {
      if (disposed || reconnectTimer !== null) return;
      if (Date.now() - lastSeen < STALE_MS) return;
      lostConnection = true;
      source?.close();
      open();
    }, 10_000);

    const onVisibility = () => {
      if (document.visibilityState === "visible") revalidateOnce();
    };

    open();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      window.clearInterval(watchdog);
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      source?.close();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [apply, remove, revalidate]);

  return null;
}
