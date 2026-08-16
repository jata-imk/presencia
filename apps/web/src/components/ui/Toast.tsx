import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

// Primer sistema de toasts de la app (F6) — mismo criterio "kit crudo sobre
// tokens" que Button.tsx / QuotaExhaustedModal.tsx: sin librería, se
// reemplaza en el pase de diseño visual. Usado hoy solo por la cancelación
// de programación (Deshacer 5s), pero genérico para cualquier caller futuro.

interface ToastOptions {
  title: string;
  description?: string;
  /** Si viene, se pinta un botón "Deshacer" que lo llama y cierra el toast. */
  onUndo?: () => void;
  durationMs?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

interface ToastContextValue {
  show: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 5000;

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (options: ToastOptions) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { ...options, id }]);
      window.setTimeout(() => dismiss(id), options.durationMs ?? DEFAULT_DURATION_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2">
        {toasts.map((t) => (
          <ToastCard
            key={t.id}
            toast={t}
            onDismiss={() => dismiss(t.id)}
            durationMs={t.durationMs ?? DEFAULT_DURATION_MS}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({
  toast,
  onDismiss,
  durationMs,
}: {
  toast: ToastItem;
  onDismiss: () => void;
  durationMs: number;
}) {
  return (
    <div
      role="status"
      className="relative flex items-center gap-3 overflow-hidden rounded-lg bg-primary py-3 pr-3 pl-4 text-primary-fg shadow-lg"
    >
      <div className="flex-1">
        <p className="text-sm font-semibold">{toast.title}</p>
        {toast.description && <p className="text-xs opacity-80">{toast.description}</p>}
      </div>
      {toast.onUndo && (
        <button
          type="button"
          className="shrink-0 text-sm font-semibold underline"
          onClick={() => {
            toast.onUndo?.();
            onDismiss();
          }}
        >
          Deshacer
        </button>
      )}
      <button
        type="button"
        aria-label="Cerrar"
        className="shrink-0 text-base leading-none opacity-70"
        onClick={onDismiss}
      >
        ×
      </button>
      <div
        className="absolute bottom-0 left-0 h-0.5 bg-accent-cta"
        style={{ animation: `toast-progress ${durationMs}ms linear forwards` }}
      />
    </div>
  );
}
