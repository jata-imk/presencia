import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import type { LibraryAssetDto } from "@presencia/shared";
import { LibraryBento } from "./LibraryBento.js";
import { LibraryDetail } from "./LibraryDetail.js";
import { LibraryGrid, LibraryList } from "./LibraryItems.js";
import { LibraryDeleteDialog, LibrarySelectionBar } from "./LibrarySelection.js";
import { LibraryNoResults, LibrarySkeleton } from "./LibraryStates.js";
import { LibraryDropOverlay, UploadPanel } from "./LibraryUpload.js";
import { groupByDate, type LibraryUpload } from "../../lib/library/library.js";
import {
  LIBRARY_ASSETS,
  LIBRARY_DETAILS,
  LIBRARY_SUMMARY,
} from "../../stories/fixtures/library.js";

// Los estados de Biblioteca que en la app solo se ven un momento o después de
// hacer algo (F12): la lista, un atajo encendido, sin resultados, cargando, el
// panel de subida en cada etapa y el velo de arrastre. Del PR 4: el panel de
// detalle, la selección múltiple y cada versión del diálogo de eliminar. La
// pantalla entera, vacía y con error está en "Biblioteca/Pantalla".

/** El mismo marco que la pantalla: fondo, `@container` y sus márgenes. */
function Frame({ children, tall = false }: { children: ReactNode; tall?: boolean }) {
  return (
    <div className={`@container relative bg-surface ${tall ? "h-[560px]" : ""}`}>
      <div className="px-4 py-4 @lg:px-6 @4xl:px-8">{children}</div>
    </div>
  );
}

const NOW = new Date();
const GROUPS = groupByDate(LIBRARY_ASSETS, "America/Merida", NOW);
const noop = () => undefined;
const ITEMS = {
  groups: GROUPS,
  hasMore: false,
  match: { network: null, cardStatus: null },
  timeZone: "America/Merida",
  now: NOW,
  selection: new Set<string>() as ReadonlySet<string>,
  onOpen: noop,
  onCopyPrompt: noop,
  onDownload: noop,
  onToggleSelect: noop,
};

const asset = (n: number): LibraryAssetDto => {
  const found = LIBRARY_ASSETS[n - 1];
  if (!found) throw new Error(`No hay imagen ${String(n)} en los datos de ejemplo`);
  return found;
};

const SELECTED = new Set([asset(2).id, asset(4).id]);

const meta = {
  title: "Biblioteca/Estados",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Cuadricula: Story = {
  name: "Cuadrícula",
  render: () => (
    <Frame>
      <LibraryGrid {...ITEMS} />
    </Frame>
  ),
};

export const Lista: Story = {
  render: () => (
    <Frame>
      <LibraryList {...ITEMS} />
    </Frame>
  ),
};

/** Con páginas por pedir, el último grupo no dice cuántas imágenes tiene. */
export const ListaConMasPaginas: Story = {
  name: "Lista · quedan páginas por cargar",
  render: () => (
    <Frame>
      <LibraryList {...ITEMS} hasMore />
    </Frame>
  ),
};

export const AtajoEncendido: Story = {
  name: "Atajos · uno encendido",
  render: () => (
    <Frame>
      <LibraryBento summary={LIBRARY_SUMMARY} active="ready" onToggle={noop} />
    </Frame>
  ),
};

export const SinResultadosDeBusqueda: Story = {
  name: "Sin resultados · búsqueda",
  render: () => (
    <Frame>
      <LibraryNoResults query="atardecer en la playa" onClear={noop} />
    </Frame>
  ),
};

export const SinResultadosDeFiltros: Story = {
  name: "Sin resultados · filtros",
  render: () => (
    <Frame>
      <LibraryNoResults query="" onClear={noop} />
    </Frame>
  ),
};

export const Cargando: Story = {
  render: () => (
    <Frame>
      <LibrarySkeleton />
    </Frame>
  ),
};

const upload = (over: Partial<LibraryUpload>): LibraryUpload => ({
  id: "subida-0",
  name: "retrato-estudio.jpg",
  sizeBytes: 2_100_000,
  status: "done",
  percent: 100,
  error: null,
  ...over,
});

export const SubiendoArchivos: Story = {
  name: "Subida · en curso",
  render: () => (
    <Frame tall>
      <UploadPanel
        busy
        onClose={noop}
        uploads={[
          upload({ id: "a", name: "producto-mesa.webp", status: "queued", percent: 0 }),
          upload({ id: "b", name: "foto-portada-taller.jpg", status: "uploading", percent: 62 }),
          upload({ id: "c" }),
        ]}
      />
    </Frame>
  ),
};

export const SubidaTerminada: Story = {
  name: "Subida · terminada",
  render: () => (
    <Frame tall>
      <UploadPanel
        busy={false}
        onClose={noop}
        uploads={[upload({ id: "a", name: "producto-mesa.webp" }), upload({ id: "b" })]}
      />
    </Frame>
  ),
};

export const SubidaConErrores: Story = {
  name: "Subida · con errores",
  render: () => (
    <Frame tall>
      <UploadPanel
        busy={false}
        onClose={noop}
        uploads={[
          upload({
            id: "a",
            name: "foto-portada-taller.jpg",
            sizeBytes: 14 * 1024 * 1024,
            status: "error",
            percent: 0,
            error:
              "El límite es 10 MB. Tu archivo pesa 14 MB. Prueba comprimirlo o sube uno más pequeño.",
          }),
          upload({
            id: "b",
            name: "guion-del-reel.pdf",
            sizeBytes: 420_000,
            status: "error",
            percent: 0,
            error: "Solo aceptamos JPG, PNG o WebP. Prueba con otro archivo.",
          }),
          upload({ id: "c" }),
        ]}
      />
    </Frame>
  ),
};

export const ArrastrandoArchivos: Story = {
  name: "Arrastre · se puede soltar",
  render: () => (
    <Frame tall>
      <LibraryGrid {...ITEMS} />
      <LibraryDropOverlay verdict="accept" />
    </Frame>
  ),
};

export const ArrastreRechazado: Story = {
  name: "Arrastre · tipo no aceptado",
  render: () => (
    <Frame tall>
      <LibraryGrid {...ITEMS} />
      <LibraryDropOverlay verdict="type" count={3} />
    </Frame>
  ),
};

// ── Panel de detalle ─────────────────────────────────────────────────────

/**
 * El panel se acomoda al ancho de la RAÍZ de la pantalla: aquí la raíz es el
 * marco. Con el ancho de la barra de Storybook se ven los tres acomodos
 * (pantalla completa, encima, a la derecha).
 */
function DetailFrame({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <div className="@container relative flex h-[820px] bg-surface">
        <div className="min-w-0 flex-1 px-4 py-4 @lg:px-6">
          <LibraryGrid {...ITEMS} />
        </div>
        {children}
      </div>
    </MemoryRouter>
  );
}

const DETAIL_ACTIONS = {
  failed: false,
  timeZone: "America/Merida",
  onClose: noop,
  onDelete: noop,
  onCopyPrompt: noop,
  onDownload: noop,
  onSelectVersion: noop,
  onViewCard: noop,
};

const detail = (n: number) => {
  const found = LIBRARY_DETAILS[asset(n).id];
  if (!found) throw new Error("Falta el detalle de ejemplo");
  return found;
};

export const DetalleEditada: Story = {
  name: "Detalle · edición con historial",
  render: () => (
    <DetailFrame>
      <LibraryDetail {...DETAIL_ACTIONS} asset={detail(1)} versions={detail(1).versions} />
    </DetailFrame>
  ),
};

export const DetalleDescartada: Story = {
  name: "Detalle · variante descartada (la original)",
  render: () => (
    <DetailFrame>
      <LibraryDetail {...DETAIL_ACTIONS} asset={detail(2)} versions={detail(2).versions} />
    </DetailFrame>
  ),
};

export const DetalleProgramada: Story = {
  name: "Detalle · en una publicación programada",
  render: () => (
    <DetailFrame>
      <LibraryDetail {...DETAIL_ACTIONS} asset={detail(3)} versions={detail(3).versions} />
    </DetailFrame>
  ),
};

export const DetalleSubida: Story = {
  name: "Detalle · subida a Biblioteca, sin alt",
  render: () => (
    <DetailFrame>
      <LibraryDetail {...DETAIL_ACTIONS} asset={detail(4)} versions={detail(4).versions} />
    </DetailFrame>
  ),
};

export const DetalleSinChat: Story = {
  name: "Detalle · generada sin chat de origen",
  render: () => (
    <DetailFrame>
      <LibraryDetail {...DETAIL_ACTIONS} asset={detail(6)} versions={detail(6).versions} />
    </DetailFrame>
  ),
};

export const DetalleCargando: Story = {
  name: "Detalle · cargando una versión",
  render: () => (
    <DetailFrame>
      <LibraryDetail {...DETAIL_ACTIONS} asset={null} versions={null} />
    </DetailFrame>
  ),
};

export const DetalleNoSePudo: Story = {
  name: "Detalle · no se pudo abrir",
  render: () => (
    <DetailFrame>
      <LibraryDetail {...DETAIL_ACTIONS} asset={null} versions={null} failed />
    </DetailFrame>
  ),
};

// ── Selección múltiple ───────────────────────────────────────────────────

export const CuadriculaConSeleccion: Story = {
  name: "Selección · cuadrícula",
  render: () => (
    <Frame tall>
      <LibraryGrid {...ITEMS} selection={SELECTED} />
      <LibrarySelectionBar count={SELECTED.size} onClear={noop} onDownload={noop} onDelete={noop} />
    </Frame>
  ),
};

export const ListaConSeleccion: Story = {
  name: "Selección · lista",
  render: () => (
    <Frame tall>
      <LibraryList {...ITEMS} selection={SELECTED} />
      <LibrarySelectionBar count={SELECTED.size} onClear={noop} onDownload={noop} onDelete={noop} />
    </Frame>
  ),
};

// ── Eliminar ─────────────────────────────────────────────────────────────

function DeleteStory({ assets }: { assets: LibraryAssetDto[] }) {
  return (
    <Frame tall>
      <LibraryGrid {...ITEMS} />
      <LibraryDeleteDialog assets={assets} onClose={noop} onDeleted={noop} />
    </Frame>
  );
}

export const EliminarSuelta: Story = {
  name: "Eliminar · una sin card",
  render: () => <DeleteStory assets={[asset(6)]} />,
};

export const EliminarEnBorrador: Story = {
  name: "Eliminar · en un borrador",
  render: () => <DeleteStory assets={[asset(1)]} />,
};

export const EliminarPublicada: Story = {
  name: "Eliminar · en una publicada",
  render: () => <DeleteStory assets={[asset(5)]} />,
};

export const EliminarProgramada: Story = {
  name: "Eliminar · programada (no se puede)",
  render: () => <DeleteStory assets={[asset(3)]} />,
};

export const EliminarVarias: Story = {
  name: "Eliminar · varias, una programada",
  render: () => <DeleteStory assets={[asset(1), asset(3), asset(5), asset(6)]} />,
};
