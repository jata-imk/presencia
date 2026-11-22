import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { AnaliticasError, LenteSkeleton, ResumenSkeleton } from "./AnaliticasStates.js";
import { LentePorPublicacion } from "./LentePorPublicacion.js";
import { TarjetaRed } from "./LentePorRed.js";
import { ResumenKpis } from "./ResumenKpis.js";
import {
  PUBLICACIONES,
  RED_EN_CAMINO,
  RED_FACEBOOK,
  RED_INSTAGRAM,
  RED_LINKEDIN,
  RED_RECONECTAR,
  RED_TIKTOK,
  RESUMEN_POCA,
  RESUMEN_SEIS_REDES,
} from "../../stories/fixtures/analiticas.js";

// Los estados sueltos de Analíticas (F12): cada tarjeta de "Por red", la
// celda de engagement con más redes de las que caben, las filas de la tabla
// en cada estado y los errores y esqueletos por bloque. La pantalla entera,
// en cada estado, está en "Analíticas/Pantalla".

/** El mismo marco que la pantalla: fondo, `@container` y sus márgenes. */
function Frame({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <div className="@container relative bg-surface">
        <div className="mx-auto max-w-[1240px] px-4 py-5 @lg:px-6 @4xl:px-8">{children}</div>
      </div>
    </MemoryRouter>
  );
}

const AHORA = new Date();
const ZONA = "America/Merida";
const noop = () => undefined;

const meta = {
  title: "Analíticas/Estados",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const tarjeta = (red: typeof RED_INSTAGRAM) => (
  <TarjetaRed red={red} periodo={30} ahora={AHORA} timeZone={ZONA} />
);

export const TarjetasDeRed: Story = {
  name: "Por red · cada tarjeta",
  render: () => (
    <Frame>
      <div className="flex flex-col gap-3">
        {tarjeta(RED_INSTAGRAM)}
        {tarjeta(RED_TIKTOK)}
        {tarjeta(RED_FACEBOOK)}
        {tarjeta(RED_EN_CAMINO)}
        {tarjeta(RED_RECONECTAR)}
        {tarjeta(RED_LINKEDIN)}
      </div>
    </Frame>
  ),
};

export const EngagementConSeisRedes: Story = {
  name: "Resumen · seis redes",
  render: () => (
    <Frame>
      <ResumenKpis resumen={RESUMEN_SEIS_REDES} onVerPorRed={noop} />
    </Frame>
  ),
};

export const ResumenPocaData: Story = {
  name: "Resumen · poca data",
  render: () => (
    <Frame>
      <ResumenKpis resumen={RESUMEN_POCA} onVerPorRed={noop} />
    </Frame>
  ),
};

export const FilasEnCadaEstado: Story = {
  name: "Por publicación · cada estado",
  render: () => (
    <Frame>
      <LentePorPublicacion publicaciones={PUBLICACIONES} ahora={AHORA} timeZone={ZONA} />
    </Frame>
  ),
};

export const ErrorDeUnaLente: Story = {
  name: "Error de una lente",
  render: () => (
    <Frame>
      <AnaliticasError compacto onReintentar={noop} />
    </Frame>
  ),
};

export const Esqueletos: Story = {
  render: () => (
    <Frame>
      <div className="flex flex-col gap-7">
        <ResumenSkeleton />
        <LenteSkeleton />
        <LenteSkeleton forma="tabla" />
      </div>
    </Frame>
  ),
};
