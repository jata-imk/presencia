import { create } from "zustand";

// F6 PR4: reemplaza el Context/ToastProvider de PR3 por un store — mismo
// API pública (show({title, ...})), sin envolver <App> en un provider.
// "kit crudo sobre tokens" ya quedaba bien con Context; el cambio es para
// que ScheduleDrawer y PublicationCard puedan mostrar un toast sin
// depender de que el árbol de componentes los tenga como descendientes de
// un provider específico — coherente con los otros 2 stores de este PR.

export interface ToastOptions {
  title: string;
  description?: string;
  /** Si viene, se pinta un botón "Deshacer" que lo llama y cierra el toast. */
  onUndo?: () => void;
  durationMs?: number;
}

export interface ToastItem extends ToastOptions {
  id: number;
  durationMs: number;
}

interface ToastState {
  toasts: ToastItem[];
  show: (options: ToastOptions) => void;
  dismiss: (id: number) => void;
}

const DEFAULT_DURATION_MS = 5000;
let nextId = 0;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show: (options) => {
    const id = nextId++;
    const durationMs = options.durationMs ?? DEFAULT_DURATION_MS;
    set((state) => ({ toasts: [...state.toasts, { ...options, id, durationMs }] }));
    window.setTimeout(() => get().dismiss(id), durationMs);
  },
  dismiss: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));

/** Atajo para llamar desde fuera de un componente (handlers, catch blocks). */
export function showToast(options: ToastOptions): void {
  useToastStore.getState().show(options);
}
