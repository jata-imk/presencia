import { Unplug } from "lucide-react";
import { ConfirmDeleteModal } from "../ui/ConfirmDeleteModal.js";

// "¿Desconectar Telegram?" (F11 PR7a, Claude Design "Chat Telegram" §1.6).
// Desconectar no borra nada: los chats, también los que empezaron en
// Telegram, se quedan en la web.
export function ModalDisconnectTelegram({
  username,
  onClose,
  onConfirm,
  onDisconnected,
}: {
  username: string | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  onDisconnected: () => void;
}) {
  return (
    <ConfirmDeleteModal
      titleId="disconnect-telegram-title"
      title="¿Desconectar Telegram?"
      icon={Unplug}
      description={
        <>
          Presencia dejará de responderte en{" "}
          {username ? <strong className="text-fg">@{username}</strong> : "Telegram"}. Tus chats se
          quedan aquí, incluidos los que empezaste en Telegram.
        </>
      }
      confirmLabel="Desconectar"
      confirmingLabel="Desconectando…"
      errorFallback="No se pudo desconectar Telegram."
      onClose={onClose}
      onConfirm={onConfirm}
      onConfirmed={onDisconnected}
    />
  );
}
