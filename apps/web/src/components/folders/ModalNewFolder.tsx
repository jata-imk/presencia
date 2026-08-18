import { useId, useState } from "react";
import { Modal } from "../ui/Modal.js";
import { Button } from "../ui/Button.js";
import { ApiError } from "../../lib/api.js";
import { useFoldersStore } from "../../stores/folders-store.js";

// Portado de ModalNewFolder (Chat Part 3.html). El mockup trae un toggle
// "Agregar contexto ahora" (documentos/instrucciones de la carpeta) — no se
// pinta: folders.brand_voice_id existe en el schema pero no hay UI de
// Voz de marca por carpeta todavía (fuera de F6 PR8), y el resto de
// "contexto compartido" (documentos) depende de Biblioteca/assets, que
// tampoco existen. Los emojis son un subconjunto curado del grid del
// mockup, no los 16 completos — suficiente variedad sin saturar.
const ICONS = ["📌", "🎯", "💡", "📅", "🎨", "🚀", "💼", "📸", "✨", "🔥", "⭐", "📚"];

export function ModalNewFolder({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (folderId: string) => void;
}) {
  const titleId = useId();
  const create = useFoldersStore((s) => s.create);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      const folder = await create(trimmed, icon ?? undefined);
      onCreated(folder.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo crear la carpeta.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy={titleId} maxWidth="max-w-sm">
      <h2 id={titleId} className="text-lg font-bold text-fg">
        Nueva carpeta
      </h2>
      <label className="mt-4 block text-[11px] font-bold tracking-wide text-fg-secondary uppercase">
        Nombre
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void handleCreate()}
          placeholder="Ej. Cliente Acme"
          className="mt-1.5 w-full rounded-lg border border-line-focus bg-card px-3 py-2 text-sm font-normal text-fg normal-case outline-none"
        />
      </label>
      <p className="mt-4 mb-2 text-[11px] font-bold tracking-wide text-fg-secondary uppercase">
        Ícono (opcional)
      </p>
      <div className="grid grid-cols-6 gap-1.5">
        {ICONS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setIcon(icon === e ? null : e)}
            aria-pressed={icon === e}
            className={`flex aspect-square items-center justify-center rounded-lg text-lg ${
              icon === e ? "bg-primary" : "bg-tint-plum"
            }`}
          >
            {e}
          </button>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-error">{error}</p>}
      <div className="mt-5 flex gap-2">
        <Button variant="secondary" onClick={onClose} disabled={submitting} className="flex-1">
          Cancelar
        </Button>
        <Button
          onClick={() => void handleCreate()}
          disabled={submitting || !name.trim()}
          className="flex-1"
        >
          {submitting ? "Creando…" : "Crear"}
        </Button>
      </div>
    </Modal>
  );
}
