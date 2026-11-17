import { Check, Copy, Download, Maximize2, Sparkles, Upload } from "lucide-react";
import { assetContentUrl, type LibraryAssetDto } from "@presencia/shared";
import { Tooltip } from "../ui/Tooltip.js";
import { formatSize } from "../../lib/attachments/attachments.js";
import {
  ORIGIN_LABELS,
  STATUS_LABELS,
  assetName,
  chatLabel,
  copyablePrompt,
  displayCard,
  networkLabel,
  pickLabel,
  shortDate,
  statusKind,
  type LibraryGroup,
  type LibraryStatusKind,
} from "../../lib/library/library.js";

// La cuadrícula y la lista de Biblioteca (F12, Claude Design "Presencia -
// Biblioteca" §01 y §02). Las dos pintan los mismos grupos de fecha; cambia
// la forma. Los anchos salen del contenedor (`@container` en la pantalla), no
// de la ventana: con el sidebar abierto o el drawer de programar, el espacio
// real es otro.
//
// En este PR una imagen se abre en el visor. El panel de detalle, la casilla
// de selección y eliminar llegan en el siguiente.

export interface LibraryItemActions {
  onOpen: (asset: LibraryAssetDto) => void;
  onCopyPrompt: (asset: LibraryAssetDto) => void;
  onDownload: (asset: LibraryAssetDto) => void;
}

interface ItemsProps extends LibraryItemActions {
  groups: LibraryGroup[];
  /**
   * Quedan páginas por pedir: el último grupo puede estar incompleto, así
   * que no dice cuántas tiene (diría las que hay cargadas, no las que son).
   */
  hasMore: boolean;
  timeZone: string;
  now: Date;
}

const DOT: Record<LibraryStatusKind, string> = {
  draft: "bg-fg-muted",
  scheduled: "bg-info-fg",
  published: "bg-success",
};

const PILL: Record<LibraryStatusKind, string> = {
  draft: "bg-secondary text-fg-secondary",
  scheduled: "bg-info-bg text-info-fg",
  published: "bg-success-bg text-success-fg",
};

function statusOf(asset: LibraryAssetDto): LibraryStatusKind | null {
  const card = displayCard(asset);
  return card ? statusKind(card.status) : null;
}

function OriginIcon({ asset, size }: { asset: LibraryAssetDto; size: number }) {
  const Icon = asset.origin === "generated" ? Sparkles : Upload;
  return (
    <Icon
      size={size}
      strokeWidth={1.75}
      className="shrink-0 text-accent"
      role="img"
      aria-label={ORIGIN_LABELS[asset.origin]}
    />
  );
}

/**
 * La imagen completa, con su proporción real, dentro de un cuadro. La
 * horizontal manda en ancho y la vertical en alto; el cuadro tiene tamaño
 * definido (`absolute inset-*`), así que el `h-full` de la vertical sí tiene
 * contra qué medirse.
 */
function FittedImage({
  asset,
  alt,
  radius,
}: {
  asset: LibraryAssetDto;
  alt: string;
  radius: string;
}) {
  const landscape = asset.width >= asset.height;
  return (
    <img
      src={assetContentUrl(asset.id)}
      alt={alt}
      loading="lazy"
      decoding="async"
      width={asset.width}
      height={asset.height}
      style={{ aspectRatio: `${String(asset.width)} / ${String(asset.height)}` }}
      className={`${radius} object-cover ${landscape ? "h-auto w-full" : "h-full w-auto"}`}
    />
  );
}

const ACTION_CLASS =
  "flex size-7 items-center justify-center rounded-md bg-lib-action text-brand shadow-md transition-colors hover:bg-card";

function Tile({
  asset,
  onOpen,
  onCopyPrompt,
  onDownload,
}: { asset: LibraryAssetDto } & LibraryItemActions) {
  const status = statusOf(asset);
  const name = assetName(asset);
  return (
    <li className="group flex min-w-0 flex-col gap-2">
      <div className="relative">
        <button
          type="button"
          onClick={() => onOpen(asset)}
          aria-label={`Abrir ${name}`}
          className="relative block aspect-square w-full rounded-lg bg-lib-tile transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line-focus"
        >
          <span className="absolute inset-2 flex items-center justify-center @lg:inset-3">
            <FittedImage asset={asset} alt={asset.alt ?? ""} radius="rounded-[6px]" />
          </span>
        </button>
        {/* Sombra arriba para que los botones se lean sobre una imagen clara. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-lg bg-linear-to-b from-lib-shade to-transparent to-42% opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
        />
        {/* Sin cursor (táctil) no hay hover: los botones se quedan sin
            recibir toques, para que un dedo en esa esquina abra la imagen y
            no descargue a ciegas. */}
        <div className="pointer-events-none absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
          <Tooltip label="Abrir">
            <button
              type="button"
              aria-label="Abrir"
              onClick={() => onOpen(asset)}
              className={ACTION_CLASS}
            >
              <Maximize2 size={14} aria-hidden />
            </button>
          </Tooltip>
          <Tooltip label="Descargar">
            <a
              // La API la sirve para guardar (Content-Disposition), igual que
              // en el visor: un `download` no sirve si redirige al bucket.
              href={`${assetContentUrl(asset.id)}?download=1`}
              aria-label="Descargar"
              onClick={() => onDownload(asset)}
              className={ACTION_CLASS}
            >
              <Download size={14} aria-hidden />
            </a>
          </Tooltip>
          {copyablePrompt(asset) && (
            <Tooltip label="Copiar prompt">
              <button
                type="button"
                aria-label="Copiar prompt"
                onClick={() => onCopyPrompt(asset)}
                className={ACTION_CLASS}
              >
                <Copy size={14} aria-hidden />
              </button>
            </Tooltip>
          )}
        </div>
        {asset.state === "chosen" && (
          <span className="pointer-events-none absolute bottom-2 left-2 flex h-[22px] items-center gap-1 rounded-full bg-lib-chosen px-2 font-display text-xs font-semibold text-lib-chosen-fg">
            <Check size={12} aria-hidden />
            Elegida
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 px-0.5">
        <div className="truncate text-sm font-medium text-fg">{chatLabel(asset)}</div>
        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden text-xs whitespace-nowrap text-fg-secondary">
          <OriginIcon asset={asset} size={13} />
          <span>{networkLabel(asset)}</span>
          {status && (
            <>
              <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${DOT[status]}`} />
              <span className="truncate">{STATUS_LABELS[status]}</span>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function GroupHeading({ group, counted }: { group: LibraryGroup; counted: boolean }) {
  return (
    <div className="mb-3.5 flex items-baseline gap-2">
      <h2 className="font-display text-[15px] font-semibold text-brand">{group.label}</h2>
      {counted && <span className="text-xs text-fg-muted">{group.items.length}</span>}
    </div>
  );
}

export const GRID_CLASS =
  "grid grid-cols-2 gap-x-3 gap-y-4 @lg:grid-cols-[repeat(auto-fill,minmax(148px,1fr))] @lg:gap-x-4 @lg:gap-y-5";

export function LibraryGrid({ groups, hasMore, ...actions }: Omit<ItemsProps, "timeZone" | "now">) {
  return (
    <>
      {groups.map((group, index) => (
        <section key={group.key} className="mb-8" aria-label={group.label}>
          <GroupHeading group={group} counted={!hasMore || index < groups.length - 1} />
          <ul className={GRID_CLASS}>
            {group.items.map((asset) => (
              <Tile key={asset.id} asset={asset} {...actions} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

// Las columnas de la lista. En angosto solo miniatura y nombre; lo demás se
// resume en el segundo renglón del nombre.
const LIST_COLS =
  "grid grid-cols-[48px_minmax(0,1fr)] items-center gap-3 @2xl:grid-cols-[40px_minmax(0,1.4fr)_minmax(0,1.2fr)_150px_84px_56px] @4xl:grid-cols-[40px_minmax(0,2fr)_minmax(0,1.6fr)_170px_90px_60px]";

function Row({
  asset,
  timeZone,
  now,
  onOpen,
}: { asset: LibraryAssetDto; timeZone: string; now: Date } & Pick<LibraryItemActions, "onOpen">) {
  const status = statusOf(asset);
  const card = displayCard(asset);
  const date = shortDate(asset.createdAt, timeZone, now);
  const wide = [ORIGIN_LABELS[asset.origin], pickLabel(asset)].filter(Boolean).join(" · ");
  const narrow = [chatLabel(asset), card ? networkLabel(asset) : null, date]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="border-t border-line">
      <button
        type="button"
        onClick={() => onOpen(asset)}
        className={`${LIST_COLS} min-h-[60px] w-full px-4 py-2 text-left transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none`}
      >
        <span className="relative block size-12 rounded-md bg-lib-tile @2xl:size-10">
          <span className="absolute inset-[3px] flex items-center justify-center">
            <FittedImage asset={asset} alt="" radius="rounded-sm" />
          </span>
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-fg">{assetName(asset)}</span>
          <span className="flex items-center gap-1.5 text-xs text-fg-secondary">
            <OriginIcon asset={asset} size={12} />
            <span className="truncate @2xl:hidden">{narrow}</span>
            <span className="hidden truncate @2xl:inline">{wide}</span>
          </span>
        </span>
        <span className="hidden truncate text-sm text-fg-secondary @2xl:block">
          {chatLabel(asset)}
        </span>
        <span className="hidden min-w-0 items-center gap-1.5 text-sm whitespace-nowrap text-fg-secondary @2xl:flex">
          <span>{networkLabel(asset)}</span>
          {status && (
            <span
              className={`flex h-5 items-center rounded-full px-[7px] text-xs font-medium ${PILL[status]}`}
            >
              {STATUS_LABELS[status]}
            </span>
          )}
        </span>
        <span className="hidden text-sm whitespace-nowrap text-fg-secondary @2xl:block">
          {date}
        </span>
        <span className="hidden text-right text-sm whitespace-nowrap text-fg-secondary @2xl:block">
          {formatSize(asset.sizeBytes)}
        </span>
      </button>
    </li>
  );
}

export function LibraryList({ groups, hasMore, timeZone, now, onOpen }: ItemsProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-card">
      <div
        aria-hidden
        className={`${LIST_COLS} hidden h-10 px-4 font-display text-xs font-semibold text-fg-secondary @2xl:grid`}
      >
        <span />
        <span>Nombre</span>
        <span>Chat</span>
        <span>Red</span>
        <span>Fecha</span>
        <span className="text-right">Peso</span>
      </div>
      {groups.map((group, index) => (
        <section key={group.key} aria-label={group.label}>
          {/* En angosto no hay fila de encabezados: el primer grupo va pegado
              al borde de la tabla y no lleva su propia línea. */}
          <h2
            className={`bg-surface px-4 pt-2.5 pb-2 font-display text-xs font-semibold text-fg-secondary ${
              index === 0 ? "@2xl:border-t @2xl:border-line" : "border-t border-line"
            }`}
          >
            {group.label}
            {(!hasMore || index < groups.length - 1) && ` · ${String(group.items.length)}`}
          </h2>
          <ul>
            {group.items.map((asset) => (
              <Row key={asset.id} asset={asset} timeZone={timeZone} now={now} onOpen={onOpen} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
