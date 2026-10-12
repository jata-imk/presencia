import { CloudOff } from "lucide-react";
import { Button } from "./Button.js";

/**
 * Lo que se ve al abrir o recargar la app mientras la API no contesta
 * (F10.8.4): un deploy que reinicia el contenedor, o la red. Antes eso se
 * leía como "no hay sesión" y mandaba a /login con la sesión intacta. La
 * sesión sigue siendo válida; solo hace falta volver a preguntar.
 *
 * Presentacional: quien la monta (ProtectedLayout) reintenta solo y le dice
 * si hay un intento en curso.
 */
export function ReconnectScreen({
  reintentando,
  onReintentar,
}: {
  reintentando: boolean;
  onReintentar: () => void;
}) {
  return (
    <main className="flex h-dvh items-center justify-center bg-app px-4">
      <div
        role="status"
        aria-live="polite"
        className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-line bg-card px-6 py-8 text-center"
      >
        <span className="flex size-12 items-center justify-center rounded-xl bg-tint-plum text-fg-secondary">
          <CloudOff size={22} strokeWidth={1.8} aria-hidden />
        </span>
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-lg font-bold text-brand">
            No pudimos conectar con Presencia
          </h1>
          <p className="text-sm leading-relaxed text-fg-secondary">
            Puede ser tu conexión o que estemos actualizando la app. Tu sesión sigue abierta: lo
            intentamos de nuevo en unos segundos.
          </p>
        </div>
        <Button onClick={onReintentar} disabled={reintentando} className="min-w-40">
          {reintentando ? "Conectando…" : "Reintentar ahora"}
        </Button>
      </div>
    </main>
  );
}
