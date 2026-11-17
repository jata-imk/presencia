import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { LibraryBento } from "./LibraryBento.js";
import { LibraryGrid, LibraryList } from "./LibraryItems.js";
import { LibraryNoResults, LibrarySkeleton } from "./LibraryStates.js";
import { LibraryDropOverlay, UploadPanel } from "./LibraryUpload.js";
import { groupByDate, type LibraryUpload } from "../../lib/library/library.js";
import { LIBRARY_ASSETS, LIBRARY_SUMMARY } from "../../stories/fixtures/library.js";

// Los estados de Biblioteca que en la app solo se ven un momento o después de
// hacer algo (F12): la lista, un atajo encendido, sin resultados, cargando, el
// panel de subida en cada etapa y el velo de arrastre. La pantalla entera,
// vacía y con error está en "Biblioteca/Pantalla".

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
  onOpen: noop,
  onCopyPrompt: noop,
  onDownload: noop,
};

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
