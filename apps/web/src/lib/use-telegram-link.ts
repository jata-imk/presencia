import { useEffect, useState } from "react";
import { useTelegramLinkStore } from "../stores/telegram-link-store.js";
import { telegramCardView, type TelegramCardView } from "./telegram-card-view.js";

// La tarjeta de Telegram de Configuración, viva (F11 PR7a). Mientras hay un
// enlace pendiente (o el aviso de "ya en otra cuenta", que todavía puede
// conectar con el mismo enlace), pregunta cada 3 s y cambia sola cuando el
// creator toca Iniciar en Telegram: nadie le avisa a la web. Solo con la
// pestaña visible, y solo hasta que el enlace vence.

const POLL_MS = 3_000;

export function useTelegramLink(): {
  view: TelegramCardView | null;
  loadError: string | null;
} {
  const status = useTelegramLinkStore((s) => s.status);
  const link = useTelegramLinkStore((s) => s.link);
  const loadError = useTelegramLinkStore((s) => s.loadError);
  const refresh = useTelegramLinkStore((s) => s.refresh);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      setNow(Date.now());
      void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const pending =
    (status?.state === "waiting" || status?.state === "taken") &&
    status.expiresAt !== null &&
    Date.parse(status.expiresAt) > now;

  useEffect(() => {
    if (!pending) return;
    // El reloj (la cuenta regresiva, y saber cuándo dejar de preguntar) y la
    // consulta van aparte: el reloj cada segundo, la consulta cada 3.
    const clock = setInterval(() => setNow(Date.now()), 1_000);
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => {
      clearInterval(clock);
      clearInterval(poll);
    };
  }, [pending, refresh]);

  return { view: status ? telegramCardView(status, link, now) : null, loadError };
}
