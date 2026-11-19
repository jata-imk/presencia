import { Download, Trash2, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import type { LibraryAssetDto, LibraryDeleteResultDto } from "@presencia/shared";
import { Button } from "../ui/Button.js";
import { ConfirmDeleteModal } from "../ui/ConfirmDeleteModal.js";
import { Modal } from "../ui/Modal.js";
import { deleteLibraryAsset, deleteLibraryAssets } from "../../lib/library/library-api.js";
import { deleteDialogCopy, deletePlan } from "../../lib/library/library.js";

// Selección múltiple y eliminar de Biblioteca (F12 PR 4, lore doc §3 y §5).

/** Cuánto suben los toasts mientras la barra está abajo (diseño: 92 px). */
const TOAST_LIFT = "92px";

const BAR_BUTTON =
  "flex h-10 shrink-0 items-center gap-2 rounded-md px-3 font-display text-sm font-semibold transition-colors hover:bg-primary-fg/12";

/** La barra flotante: cuántas hay marcadas y qué se puede hacer con ellas. */
export function LibrarySelectionBar({
  count,
  onClear,
  onDownload,
  onDelete,
}: {
  count: number;
  onClear: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  // Los toasts salen abajo al centro, justo donde está la barra: mientras
  // ella está, suben.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--toast-lift", TOAST_LIFT);
    return () => {
      root.style.removeProperty("--toast-lift");
    };
  }, []);

  return (
    <div
      role="toolbar"
      aria-label="Imágenes seleccionadas"
      className="absolute bottom-6 left-1/2 z-20 flex h-[52px] w-[440px] max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-1 rounded-[14px] bg-primary px-1.5 text-primary-fg shadow-xl"
    >
      <button
        type="button"
        onClick={onClear}
        aria-label="Quitar selección"
        className={`${BAR_BUTTON} w-10 justify-center px-0`}
      >
        <X size={18} aria-hidden />
      </button>
      <span role="status" className="min-w-0 flex-1 truncate font-display text-sm font-semibold">
        {count === 1 ? "1 seleccionada" : `${String(count)} seleccionadas`}
      </span>
      <button type="button" onClick={onDownload} className={BAR_BUTTON}>
        <Download size={16} aria-hidden />
        <span className="hidden @sm:inline">Descargar</span>
      </button>
      <button type="button" onClick={onDelete} className={BAR_BUTTON}>
        <Trash2 size={16} aria-hidden />
        <span className="hidden @sm:inline">Eliminar</span>
      </button>
    </div>
  );
}

/**
 * Confirmar eliminar una o varias. Avisa antes con lo que la web ya sabe de
 * cada imagen: una programada no se ofrece (decisión 5 de F12), los
 * borradores que la pierden y que las publicadas se quedan con el ícono. La
 * API vuelve a decidir con la base bloqueada; si algo cambió en otra pestaña,
 * su 409 (una) o su resultado (varias) llega igual.
 */
export function LibraryDeleteDialog({
  assets,
  onClose,
  onDeleted,
}: {
  assets: LibraryAssetDto[];
  onClose: () => void;
  onDeleted: (result: LibraryDeleteResultDto) => void;
}) {
  const titleId = useId();
  const plan = deletePlan(assets);
  const copy = deleteDialogCopy(plan);
  const result = useRef<LibraryDeleteResultDto | null>(null);

  if (copy.kind === "blocked") {
    return (
      <Modal onClose={onClose} labelledBy={titleId} maxWidth="max-w-sm">
        <h2 id={titleId} className="text-lg font-bold text-fg">
          {copy.title}
        </h2>
        <p className="mt-1.5 text-sm text-fg-secondary">{copy.description}</p>
        <div className="mt-5 flex justify-end">
          <Button onClick={onClose}>Entendido</Button>
        </div>
      </Modal>
    );
  }

  async function confirm() {
    const ids = plan.deletable.map((asset) => asset.id);
    const [only] = ids;
    if (ids.length === 1 && only && plan.scheduled.length === 0) {
      // Una sola: el DELETE, que responde 409 con el porqué si la API no la
      // deja ir. El mensaje sale en el mismo diálogo.
      await deleteLibraryAsset(only);
      result.current = { deleted: [only], blocked: [] };
    } else {
      result.current = await deleteLibraryAssets(ids);
    }
  }

  return (
    <ConfirmDeleteModal
      titleId={titleId}
      title={copy.title}
      description={copy.description}
      warning={
        copy.warnings.length > 0 ? (
          <>
            {copy.warnings.map((line) => (
              <span key={line} className="block [&+&]:mt-1">
                {line}
              </span>
            ))}
          </>
        ) : undefined
      }
      confirmLabel={copy.confirmLabel}
      errorFallback="No pudimos eliminar. Revisa tu conexión e inténtalo de nuevo."
      onClose={onClose}
      onConfirm={confirm}
      onConfirmed={() => {
        if (result.current) onDeleted(result.current);
      }}
    />
  );
}
