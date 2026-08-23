import { X, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toastIn } from "../../lib/motion.js";
import { useToastStore } from "../../stores/toast-store.js";

// Portado de ToastUndo (Chat Part 3.html). El mockup usa un fondo negro
// fijo (#1A1A1A) sin variante de dark mode — acá se usa bg-fg/text-fg-inverse
// (que sí invierten con el tema) en su lugar: en modo oscuro la app ya es
// oscura, un toast "siempre negro" perdería contraste contra el fondo.
// Se monta una sola vez (ver App.tsx) — antes (PR3) era un <ToastProvider>
// envolviendo <App>; ahora lee directo de toast-store (F6 PR4). Entrada/
// salida con motion (F6 PR5, ADR-014) — antes aparecía y desaparecía de
// golpe.
export function ToastViewport() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div
      // Marcador estable para que un panel inspector (el del Calendario)
      // pueda excluir sus clicks de su propio "cerrar al clickear afuera":
      // apretar "Deshacer" no debe hacer desaparecer el panel.
      data-toast-viewport
      className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2"
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            role="status"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={toastIn}
            className="relative flex max-w-[440px] items-stretch overflow-hidden rounded-xl bg-fg shadow-xl"
          >
            <div className="flex flex-1 items-center gap-3 px-4 py-3.5">
              <div
                className="flex size-8 shrink-0 items-center justify-center rounded-full"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--color-blush-pop) 20%, transparent)",
                }}
              >
                <XCircle size={16} className="text-blush-pop" strokeWidth={2} />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-fg-inverse">{t.title}</p>
                {t.description && (
                  <p className="text-[11px] text-fg-inverse-muted">{t.description}</p>
                )}
              </div>
            </div>
            {t.onUndo && (
              <button
                type="button"
                onClick={() => {
                  t.onUndo?.();
                  dismiss(t.id);
                }}
                className="shrink-0 border-l border-fg-inverse-faint px-3.5 text-[13px] font-bold text-blush-pop"
              >
                Deshacer
              </button>
            )}
            <button
              type="button"
              aria-label="Cerrar"
              onClick={() => dismiss(t.id)}
              className="shrink-0 px-3 text-fg-inverse-subtle"
            >
              <X size={14} strokeWidth={2} />
            </button>
            <div
              className="absolute bottom-0 left-0 h-[3px] rounded-br-xl bg-blush-pop"
              style={{ animation: `toast-progress ${t.durationMs}ms linear forwards` }}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
