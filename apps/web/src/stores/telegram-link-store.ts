import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { TelegramLinkDto, TelegramLinkStatusDto } from "@presencia/shared";
import { apiFetch } from "../lib/api.js";

// El vínculo con Telegram (F11 PR7a, ADR-030): lo pinta Configuración →
// Canales conectados, y en PR7b lo lee el menú de cada chat ("Continuar en
// Telegram"). Un store y no un hook casero para que los dos lean el mismo.
//
// `link` (el deep link con el código) vive SOLO en memoria: quien lo tenga
// conecta su Telegram a esta cuenta. Nunca a localStorage ni sessionStorage.
// Por eso, tras recargar con un enlace pendiente, la web ya no lo tiene (el
// servidor solo guarda su hash) y ofrece generar otro.

interface TelegramLinkState {
  status: TelegramLinkStatusDto | null;
  link: TelegramLinkDto | null;
  loadError: string | null;
  refresh: () => Promise<void>;
  /** Genera un enlace nuevo; el anterior deja de servir. Lanza ApiError. */
  createLink: () => Promise<void>;
  /** Desconecta, o cancela el enlace pendiente. Lanza ApiError. */
  unlink: () => Promise<void>;
}

let inFlight: Promise<void> | null = null;
/**
 * Sube con cada cambio que hace esta pestaña (generar, desconectar). Una
 * consulta que salió antes llega con el estado viejo, y no debe pisar el nuevo
 * (revisión del PR7a: el polling cada 3 s casi siempre tiene una en camino).
 */
let generation = 0;

/** Lo que salió antes de este punto ya no cuenta, y la siguiente consulta va de nuevo. */
function forgetInFlight(): void {
  generation += 1;
  inFlight = null;
}

export const useTelegramLinkStore = create<TelegramLinkState>()(
  devtools(
    (set, get) => ({
      status: null,
      link: null,
      loadError: null,

      refresh: () => {
        const startedAt = generation;
        inFlight ??= apiFetch<TelegramLinkStatusDto>("/api/telegram/link")
          .then((status) => {
            if (startedAt !== generation) return;
            set({
              status,
              loadError: null,
              // Ya conectado (o cancelado): el código no sirve para nada más.
              ...(status.state === "connected" || status.state === "disconnected"
                ? { link: null }
                : {}),
            });
          })
          .catch(() => {
            if (startedAt !== generation) return;
            set({ loadError: "No pudimos revisar tu conexión con Telegram." });
          })
          .finally(() => {
            if (startedAt === generation) inFlight = null;
          });
        return inFlight;
      },

      createLink: async () => {
        try {
          const link = await apiFetch<TelegramLinkDto>("/api/telegram/link", { method: "POST" });
          forgetInFlight();
          set({
            link,
            status: {
              state: "waiting",
              username: null,
              linkedAt: null,
              expiresAt: link.expiresAt,
              botUsername: get().status?.botUsername ?? null,
            },
          });
        } catch (error) {
          // Un 409 (ya se conectó desde otra pestaña) deja la verdad a la vista.
          forgetInFlight();
          void get().refresh();
          throw error;
        }
      },

      unlink: async () => {
        await apiFetch<void>("/api/telegram/link", { method: "DELETE" });
        forgetInFlight();
        set({ link: null });
        await get().refresh();
      },
    }),
    { name: "telegram-link-store" },
  ),
);

/** Para Storybook y tests: vuelve al estado inicial. */
export function resetTelegramLinkStore(): void {
  forgetInFlight();
  useTelegramLinkStore.setState({ status: null, link: null, loadError: null });
}
