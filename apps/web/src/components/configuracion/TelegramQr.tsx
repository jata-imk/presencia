import { TimerOff } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

// El QR del enlace para conectar Telegram (F11 PR7a, Claude Design "Chat
// Telegram" §1.2): para escanearlo con el cel cuando la web está en la
// compu. Módulos y fondo con tokens fijos en los dos temas (--qr-*): un QR
// invertido no lo leen todas las cámaras.
//
// Sin enlace (se generó antes de recargar) no se dibuja un QR de relleno:
// uno falso se podría escanear. Se queda el cuadro vacío con su aviso.

/** 132 px, igual que `size-33` del cuadro vacío. */
const SIZE = 132;

export function TelegramQr({ url, expired }: { url: string | null; expired: boolean }) {
  return (
    <div className="relative shrink-0 rounded-[10px] border border-line bg-qr-bg p-2 text-qr-fg">
      {url ? (
        <QRCodeSVG
          value={url}
          size={SIZE}
          fgColor="currentColor"
          bgColor="transparent"
          marginSize={0}
          role="img"
          aria-label="Código QR para conectar Telegram"
          className={expired ? "opacity-15" : undefined}
        />
      ) : (
        <div className="size-33" aria-hidden />
      )}
      {expired && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-center font-display text-xs font-semibold">
          <TimerOff size={20} strokeWidth={1.75} aria-hidden />
          Código vencido
        </div>
      )}
    </div>
  );
}
