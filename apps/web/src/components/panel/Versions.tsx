import { diffWordsWithSpace } from "diff";
import { Check, ChevronDown, Eye, GitCompare, History, RotateCcw, X } from "lucide-react";
import { useEffect, useRef } from "react";
import {
  NETWORK_TEXT_LIMITS,
  buildPostText,
  type CardContent,
  type CardVersionDto,
  type SocialNetwork,
} from "@presencia/shared";
import { Tooltip } from "../ui/Tooltip.js";

// Versiones del texto de una card (F10.5, rd-panel.jsx → VersionsMenu y
// CompareBody). Nada se borra: restaurar crea una versión nueva.

export function versionLabel(v: CardVersionDto): string {
  switch (v.source) {
    case "chat":
      return "Original · del chat";
    case "manual":
      return "Editada por ti";
    case "ai":
      return v.instruction ? `Ajustada por IA: ${v.instruction}` : "Ajustada por IA";
    case "restore":
      return `Restaurada de la Versión ${String(v.restoredFrom ?? "")}`;
  }
}

/** "hace 2 min", "hace 3 h", "12 sep". */
export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "hace un momento";
  if (s < 3600) return `hace ${String(Math.round(s / 60))} min`;
  if (s < 86400) return `hace ${String(Math.round(s / 3600))} h`;
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

/** La versión como card completa: con la imagen que la card tiene hoy. */
export function versionAsContent(v: CardVersionDto, current: CardContent): CardContent {
  return { ...v.content, assetIds: current.assetIds };
}

export function VersionsButton({
  latest,
  viewing,
  open,
  onToggle,
}: {
  latest: number | null;
  viewing: number | null;
  open: boolean;
  onToggle: () => void;
}) {
  const label =
    // "Texto": son las versiones del caption y los hashtags; las imágenes
    // tienen su propio historial (recorrido de F10.6: recortar no movía este
    // número y parecía un error).
    latest === null
      ? "Texto"
      : viewing !== null && viewing !== latest
        ? `Texto · viendo v${String(viewing)} de ${String(latest)}`
        : `Texto · v${String(latest)}`;
  return (
    <button
      type="button"
      aria-haspopup="listbox"
      aria-expanded={open}
      onClick={onToggle}
      className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-line px-2.5 font-display text-xs font-semibold whitespace-nowrap text-fg-secondary hover:bg-surface"
    >
      <History size={13} aria-hidden="true" />
      {label}
      <ChevronDown size={12} aria-hidden="true" />
    </button>
  );
}

export function VersionsMenu({
  versions,
  viewing,
  editable,
  mobile,
  onView,
  onCompare,
  onRestore,
  onClose,
}: {
  versions: CardVersionDto[] | null;
  viewing: number | null;
  editable: boolean;
  mobile: boolean;
  onView: (n: number) => void;
  onCompare: (n: number) => void;
  onRestore: (n: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    // En el siguiente tick: el mismo click que lo abrió no debe cerrarlo.
    const t = setTimeout(() => document.addEventListener("pointerdown", onDown), 0);
    // En captura: corre antes que el Esc del panel (escuchado en burbuja) y lo
    // marca como atendido, así Esc cierra el menú y no el panel entero.
    window.addEventListener("keydown", onKey, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  const latest = versions?.at(-1)?.n ?? null;
  const list = versions ? [...versions].reverse() : null;

  return (
    <>
      {mobile && (
        <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-40 bg-overlay" />
      )}
      <div
        ref={ref}
        role="listbox"
        aria-label="Versiones del texto de este borrador"
        className={
          mobile
            ? "fixed inset-x-0 bottom-0 z-50 max-h-[70dvh] overflow-y-auto rounded-t-2xl border-t border-line bg-card p-2 pb-5 shadow-xl"
            : "absolute top-full right-3 z-30 mt-1 max-h-[60vh] w-[320px] overflow-y-auto rounded-xl border border-line bg-card p-1.5 shadow-xl"
        }
      >
        <p className="px-2 py-1.5 font-display text-[11px] font-bold tracking-[0.08em] text-fg-muted">
          VERSIONES DE ESTE BORRADOR
        </p>
        {!list ? (
          <div aria-busy="true" aria-label="Cargando versiones" className="flex flex-col gap-1 p-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col gap-1.5 rounded-lg px-2 py-2">
                <div className="skeleton h-3.5 w-1/3 rounded-md" />
                <div className="skeleton h-3 w-2/3 rounded-md" />
              </div>
            ))}
          </div>
        ) : (
          list.map((v) => {
            const current = v.n === latest;
            const shown = viewing === null ? current : viewing === v.n;
            return (
              <div
                key={v.n}
                role="option"
                aria-selected={shown}
                className={`group flex items-center gap-2.5 rounded-lg px-2 py-2 ${shown ? "bg-surface" : "hover:bg-surface"}`}
              >
                <button
                  type="button"
                  onClick={() => onView(v.n)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <span
                    aria-hidden="true"
                    className={`size-2 shrink-0 rounded-full ${current ? "bg-primary" : "bg-line"}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-[13px] font-semibold text-fg">
                      Versión {v.n}
                      {current && <span className="font-medium text-fg-muted"> · actual</span>}
                    </span>
                    <span className="block truncate text-xs text-fg-secondary">
                      {versionLabel(v)} · {ago(v.updatedAt)}
                    </span>
                  </span>
                </button>
                {!current && (
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => onCompare(v.n)}
                      className="inline-flex h-7 items-center rounded-lg px-2 font-display text-xs font-semibold text-fg-secondary hover:bg-card"
                    >
                      Comparar
                    </button>
                    {editable && (
                      <button
                        type="button"
                        onClick={() => onRestore(v.n)}
                        className="inline-flex h-7 items-center gap-1 rounded-lg bg-tint-plum px-2 font-display text-xs font-semibold text-accent"
                      >
                        <RotateCcw size={12} aria-hidden="true" />
                        Restaurar
                      </button>
                    )}
                  </span>
                )}
              </div>
            );
          })
        )}
        <p className="mt-1 border-t border-line px-2 pt-2 pb-1 text-[11.5px] text-fg-muted">
          Restaurar crea una versión nueva; no se borra ninguna.
        </p>
      </div>
    </>
  );
}

/** La franja arriba de la vista previa cuando se mira una versión que no es la actual. */
export function ViewingBanner({
  version,
  editable,
  onCompare,
  onRestore,
  onBack,
}: {
  version: CardVersionDto;
  editable: boolean;
  onCompare: () => void;
  onRestore: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-tint-plum px-4 py-2">
      <Eye size={14} className="text-accent" aria-hidden="true" />
      <span className="flex-1 font-display text-[12.5px] font-semibold text-accent">
        Vista previa de la Versión {version.n} · {versionLabel(version)}
      </span>
      <button
        type="button"
        onClick={onCompare}
        className="inline-flex h-7 items-center gap-1 rounded-lg px-2 font-display text-xs font-semibold text-fg-secondary hover:bg-card"
      >
        <GitCompare size={12} aria-hidden="true" />
        Comparar
      </button>
      {editable && (
        <button
          type="button"
          onClick={onRestore}
          className="inline-flex h-7 items-center gap-1 rounded-lg bg-card px-2 font-display text-xs font-semibold text-accent"
        >
          <RotateCcw size={12} aria-hidden="true" />
          Restaurar
        </button>
      )}
      <Tooltip label="Volver a la actual">
        <button
          type="button"
          onClick={onBack}
          aria-label="Volver a la versión actual"
          className="inline-flex size-7 items-center justify-center rounded-lg text-fg-muted hover:bg-card"
        >
          <X size={14} />
        </button>
      </Tooltip>
    </div>
  );
}

/** Diff por palabra entre una versión y la actual, sobre el texto que se publicaría. */
export function CompareView({
  version,
  latest,
  current,
  network,
  editable,
  onRestore,
  onClose,
}: {
  version: CardVersionDto;
  latest: number;
  current: CardContent;
  network: SocialNetwork;
  editable: boolean;
  onRestore: () => void;
  onClose: () => void;
}) {
  const before = buildPostText(versionAsContent(version, current));
  const after = buildPostText(current);
  const parts = diffWordsWithSpace(before, after);
  const removed = parts.filter((p) => p.removed).reduce((n, p) => n + p.value.length, 0);
  const added = parts.filter((p) => p.added).reduce((n, p) => n + p.value.length, 0);
  const limit = NETWORK_TEXT_LIMITS[network];

  return (
    <div className="flex min-h-full flex-col bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-card px-4 py-2.5">
        <GitCompare size={15} className="text-fg-secondary" aria-hidden="true" />
        <span className="flex-1 font-display text-[13px] font-semibold text-fg">
          Versión {version.n} frente a la actual (Versión {latest})
        </span>
        {editable && (
          <button
            type="button"
            onClick={onRestore}
            className="inline-flex h-7 items-center gap-1 rounded-lg bg-tint-plum px-2.5 font-display text-xs font-semibold text-accent"
          >
            <RotateCcw size={12} aria-hidden="true" />
            Restaurar Versión {version.n}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar comparación"
          className="inline-flex size-7 items-center justify-center rounded-lg text-fg-muted hover:bg-surface"
        >
          <X size={14} />
        </button>
      </div>
      <div className="p-5">
        <div className="rounded-xl border border-line bg-card px-4.5 py-4">
          {before === after ? (
            <p className="flex items-center gap-2 text-sm text-fg-secondary">
              <Check size={14} className="text-success" aria-hidden="true" />
              El texto es igual en las dos versiones.
            </p>
          ) : (
            <p className="text-sm leading-[1.65] whitespace-pre-wrap text-fg">
              {parts.map((p, i) =>
                p.removed ? (
                  <del key={i} className="rounded-sm bg-error-bg text-error">
                    {p.value}
                  </del>
                ) : p.added ? (
                  <ins key={i} className="rounded-sm bg-success-bg text-success no-underline">
                    {p.value}
                  </ins>
                ) : (
                  <span key={i}>{p.value}</span>
                ),
              )}
            </p>
          )}
          <div className="mt-3.5 flex flex-wrap gap-3.5 text-xs text-fg-muted">
            <span className="text-error">− {removed.toLocaleString("es-MX")} caracteres</span>
            <span className="text-success">+ {added.toLocaleString("es-MX")} caracteres</span>
            <span>
              Resultado: {after.length.toLocaleString("es-MX")} / {limit.toLocaleString("es-MX")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
