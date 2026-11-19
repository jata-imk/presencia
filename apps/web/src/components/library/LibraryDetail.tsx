import {
  ArrowUpRight,
  Check,
  ChevronLeft,
  Copy,
  Download,
  LayoutTemplate,
  Loader2,
  MessageSquare,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router";
import {
  NETWORK_LABELS,
  assetContentUrl,
  type LibraryAssetDto,
  type LibraryCardRef,
  type LibraryVersionDto,
} from "@presencia/shared";
import { Tooltip } from "../ui/Tooltip.js";
import { formatSize } from "../../lib/attachments/attachments.js";
import {
  ORIGIN_LABELS,
  STATUS_LABELS,
  assetName,
  detailDate,
  inUseLabel,
  formatLabel,
  statusKind,
  versionLabel,
  viewCardTarget,
} from "../../lib/library/library.js";

// El panel de detalle de Biblioteca (F12, Claude Design "Presencia -
// Biblioteca" §03; lore doc §3). Tres acomodos según el ancho que le queda a
// la pantalla (`@container` de la raíz):
//
// - Escritorio (@4xl): 380 px a la derecha que EMPUJA la cuadrícula; la
//   pantalla le deja el hueco con su padding.
// - Tablet (@lg): 400 px encima, con velo.
// - Móvil: pantalla completa, con "Volver" en vez de ✕.
//
// Solo lee: lo que cambia (eliminar, ir al chat) lo decide la pantalla.

export interface LibraryDetailActions {
  onClose: () => void;
  onDelete: (asset: LibraryAssetDto) => void;
  onCopyPrompt: (asset: LibraryAssetDto) => void;
  onDownload: (asset: LibraryAssetDto) => void;
  onSelectVersion: (assetId: string) => void;
  /** "Ver card": el chat con su panel ya abierto en esa card. */
  onViewCard: (card: LibraryCardRef & { chatId: string }) => void;
}

const HEADER_BUTTON =
  "flex size-11 shrink-0 items-center justify-center rounded-md text-fg-secondary transition-colors hover:bg-secondary hover:text-fg @lg:size-9";

const PILL: Record<"draft" | "scheduled" | "published", string> = {
  draft: "bg-secondary text-fg-secondary",
  scheduled: "bg-info-bg text-info-fg",
  published: "bg-success-bg text-success-fg",
};

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-display text-xs font-semibold tracking-[.04em] text-fg-secondary uppercase">
      {children}
    </h3>
  );
}

function Chip({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      className={`flex h-6 items-center gap-1.5 rounded-full px-2.5 font-display text-xs font-semibold ${className}`}
    >
      {children}
    </span>
  );
}

function CardRow({ card }: { card: LibraryCardRef }) {
  const kind = statusKind(card.status);
  return (
    <span className="flex min-w-0 items-center gap-2 text-sm text-fg">
      <span className="truncate">{NETWORK_LABELS[card.network]}</span>
      {kind && (
        <span
          className={`flex h-5 shrink-0 items-center rounded-full px-[7px] text-xs font-medium ${PILL[kind]}`}
        >
          {STATUS_LABELS[kind]}
        </span>
      )}
    </span>
  );
}

/** Una card donde se usa: abre esa card (el handoff del Calendario) si tiene chat. */
function UseRow({
  card,
  onViewCard,
}: {
  card: LibraryCardRef;
  onViewCard: LibraryDetailActions["onViewCard"];
}) {
  const chatId = card.chatId;
  if (!chatId) return <CardRow card={card} />;
  return (
    <button
      type="button"
      onClick={() => onViewCard({ ...card, chatId })}
      aria-label={`Ver la card de ${NETWORK_LABELS[card.network]}`}
      className="-mx-1.5 flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-left transition-colors hover:bg-secondary"
    >
      <CardRow card={card} />
      <ArrowUpRight size={14} className="shrink-0 text-accent" aria-hidden />
    </button>
  );
}

function Versions({
  versions,
  current,
  onSelect,
}: {
  versions: LibraryVersionDto[];
  current: string;
  onSelect: (assetId: string) => void;
}) {
  return (
    <ol className="flex flex-wrap gap-2.5">
      {versions.map((version, index) => {
        const active = version.assetId === current;
        const label = versionLabel(version, index);
        return (
          <li key={version.assetId} className="w-[88px]">
            <button
              type="button"
              onClick={() => onSelect(version.assetId)}
              aria-current={active ? "true" : undefined}
              aria-label={active ? `${label} (actual)` : `Ver ${label}`}
              className={`relative flex size-[88px] items-center justify-center rounded-lg bg-lib-tile p-2 transition-shadow ${
                active ? "ring-2 ring-accent" : "ring-1 ring-line hover:ring-accent"
              }`}
            >
              <img
                src={assetContentUrl(version.assetId)}
                alt=""
                loading="lazy"
                decoding="async"
                width={version.width}
                height={version.height}
                className="max-h-full max-w-full rounded-sm object-contain"
              />
              {active && (
                <span className="absolute -top-1.5 -right-1.5 flex h-[18px] items-center rounded-full bg-accent px-1.5 font-display text-[10px] font-semibold text-fg-inverse">
                  Actual
                </span>
              )}
            </button>
            <p className="mt-1.5 truncate text-xs text-fg-secondary" title={label}>
              {label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

export function LibraryDetail({
  asset,
  versions,
  failed,
  timeZone,
  onClose,
  onDelete,
  onCopyPrompt,
  onDownload,
  onSelectVersion,
  onViewCard,
}: {
  /** Null mientras llega una versión que no estaba en el listado. */
  asset: LibraryAssetDto | null;
  /** Null mientras llega el detalle. */
  versions: LibraryVersionDto[] | null;
  /** El detalle no se pudo traer y no hay nada que mostrar. */
  failed: boolean;
  timeZone: string;
} & LibraryDetailActions) {
  const panel = useRef<HTMLElement>(null);
  const openedId = asset?.id ?? null;
  // Al abrir (y al saltar de versión) el foco va al panel: con teclado se
  // sigue leyendo ahí, y Esc lo cierra.
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
  }, [openedId]);

  const name = asset ? assetName(asset) : "Imagen";
  // F12 PR5: una imagen puede estar en varias cards, o en una sin haber
  // nacido en ninguna. "Ver card" va a donde se usa; si no, a donde nació.
  const viewable = asset ? viewCardTarget(asset) : null;
  const uses = asset?.uses ?? [];
  const born = uses.length === 0 ? (asset?.bornInCard ?? null) : null;
  const chip = asset ? inUseLabel(asset) : null;
  const asked = asset?.prompt ?? asset?.instruction ?? null;

  return (
    <aside
      ref={panel}
      tabIndex={-1}
      aria-label={`Detalle de ${name}`}
      className="absolute inset-0 z-30 flex flex-col bg-card outline-none @lg:left-auto @lg:w-[400px] @lg:border-l @lg:border-line @lg:shadow-xl @4xl:static @4xl:w-[380px] @4xl:shrink-0 @4xl:shadow-none"
    >
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line px-2 @lg:px-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Volver"
          className={`${HEADER_BUTTON} @lg:hidden`}
        >
          <ChevronLeft size={20} aria-hidden />
        </button>
        <h2 className="min-w-0 flex-1 truncate px-1 font-display text-sm font-semibold text-fg">
          {name}
        </h2>
        {asset && (
          <>
            <Tooltip label="Descargar">
              <a
                href={`${assetContentUrl(asset.id)}?download=1`}
                aria-label="Descargar"
                onClick={() => onDownload(asset)}
                className={HEADER_BUTTON}
              >
                <Download size={16} aria-hidden />
              </a>
            </Tooltip>
            <Tooltip label="Eliminar">
              <button
                type="button"
                aria-label="Eliminar"
                onClick={() => onDelete(asset)}
                className={`${HEADER_BUTTON} hover:bg-error-bg hover:text-error`}
              >
                <Trash2 size={16} aria-hidden />
              </button>
            </Tooltip>
          </>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className={`${HEADER_BUTTON} hidden @lg:flex`}
        >
          <X size={18} aria-hidden />
        </button>
      </header>

      {!asset ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-fg-secondary">
          {failed ? (
            "No pudimos abrir esta imagen. Puede que se haya eliminado."
          ) : (
            <Loader2 size={20} className="animate-spin text-fg-muted" aria-label="Cargando" />
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pt-4 pb-8">
          <div className="flex h-[340px] shrink-0 items-center justify-center rounded-lg bg-lib-tile p-4 @lg:h-[300px]">
            <img
              src={assetContentUrl(asset.id)}
              alt={asset.alt ?? ""}
              width={asset.width}
              height={asset.height}
              className="max-h-full max-w-full rounded-lg object-contain shadow-md"
            />
          </div>

          {(asset.chat || viewable) && (
            <div className="grid grid-cols-2 gap-2">
              {asset.chat && (
                <Link
                  to={`/chats/${asset.chat.id}`}
                  className={`flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 font-display text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover ${
                    viewable ? "" : "col-span-2"
                  }`}
                >
                  <MessageSquare size={15} aria-hidden />
                  Abrir en el chat
                </Link>
              )}
              {viewable && (
                <button
                  type="button"
                  onClick={() => onViewCard(viewable)}
                  className={`flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-card px-3 font-display text-sm font-semibold text-fg transition-colors hover:bg-secondary ${
                    asset.chat ? "" : "col-span-2"
                  }`}
                >
                  <LayoutTemplate size={15} aria-hidden />
                  Ver card
                </button>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Chip className="bg-tint-plum text-brand">
              {asset.origin === "generated" ? (
                <Sparkles size={12} aria-hidden />
              ) : (
                <Upload size={12} aria-hidden />
              )}
              {ORIGIN_LABELS[asset.origin]}
            </Chip>
            {chip && (
              <Chip className="bg-success-bg text-success-fg">
                <Check size={12} aria-hidden />
                {chip}
              </Chip>
            )}
            {asset.state === "discarded" && (
              <Chip className="bg-secondary text-fg-secondary">Variante descartada</Chip>
            )}
          </div>

          {(uses.length > 0 || born || asset.chat) && (
            <dl className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 text-sm">
              {uses.length > 0 && (
                <>
                  <dt className={`text-fg-secondary ${uses.length > 1 ? "self-start pt-1" : ""}`}>
                    Se usa en
                  </dt>
                  <dd className="min-w-0">
                    <ul className="flex flex-col gap-1">
                      {uses.map((use) => (
                        <li key={use.id}>
                          <UseRow card={use} onViewCard={onViewCard} />
                        </li>
                      ))}
                    </ul>
                  </dd>
                </>
              )}
              {born && (
                <>
                  <dt className="text-fg-secondary">Nació en</dt>
                  <dd className="min-w-0">
                    <CardRow card={born} />
                  </dd>
                </>
              )}
              {asset.chat && (
                <>
                  <dt className="text-fg-secondary">Chat</dt>
                  <dd className="min-w-0">
                    <Link
                      to={`/chats/${asset.chat.id}`}
                      className="flex min-w-0 items-center gap-1 text-accent hover:underline"
                    >
                      <span className="truncate">{asset.chat.title || "Chat sin título"}</span>
                      <ArrowUpRight size={14} className="shrink-0" aria-hidden />
                    </Link>
                  </dd>
                </>
              )}
            </dl>
          )}

          {asked && (
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <SectionLabel>{asset.prompt ? "Prompt" : "Instrucción de edición"}</SectionLabel>
                <button
                  type="button"
                  onClick={() => onCopyPrompt(asset)}
                  className="flex h-7 items-center gap-1.5 rounded-md px-2 font-display text-xs font-semibold text-accent transition-colors hover:bg-secondary"
                >
                  <Copy size={13} aria-hidden />
                  Copiar
                </button>
              </div>
              <p className="rounded-md bg-secondary p-3 text-[13px] leading-[1.6] break-words whitespace-pre-wrap text-fg">
                {asked}
              </p>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <SectionLabel>Texto alternativo</SectionLabel>
            <p className={`text-sm leading-relaxed ${asset.alt ? "text-fg" : "text-fg-muted"}`}>
              {asset.alt ?? "Sin texto alternativo todavía."}
            </p>
          </section>

          {versions && versions.length > 1 && (
            <section className="flex flex-col gap-3">
              <SectionLabel>Historial de versiones</SectionLabel>
              <Versions versions={versions} current={asset.id} onSelect={onSelectVersion} />
            </section>
          )}

          <section className="flex flex-col gap-2">
            <SectionLabel>Detalles</SectionLabel>
            <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-fg-secondary">Fecha</dt>
              <dd className="text-fg">{detailDate(asset.createdAt, timeZone)}</dd>
              <dt className="text-fg-secondary">Dimensiones</dt>
              <dd className="text-fg">
                {asset.width} × {asset.height}
              </dd>
              <dt className="text-fg-secondary">Peso</dt>
              <dd className="text-fg">{formatSize(asset.sizeBytes)}</dd>
              <dt className="text-fg-secondary">Formato</dt>
              <dd className="text-fg">{formatLabel(asset.mimeType)}</dd>
            </dl>
          </section>
        </div>
      )}
    </aside>
  );
}
