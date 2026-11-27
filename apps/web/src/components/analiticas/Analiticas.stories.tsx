import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { AnaliticasError, LenteSkeleton, ResumenSkeleton } from "./AnaliticasStates.js";
import { Hallazgos, HallazgosSkeleton } from "./Hallazgos.js";
import { LentePorConcepto } from "./LentePorConcepto.js";
import { LentePorPublicacion } from "./LentePorPublicacion.js";
import { TarjetaRed } from "./LentePorRed.js";
import { MejoresPublicaciones, MejoresSkeleton } from "./MejoresPublicaciones.js";
import { ResumenKpis } from "./ResumenKpis.js";
import {
  CONCEPTOS,
  HALLAZGOS_COMPLETO,
  HALLAZGOS_SIN_DIFERENCIA,
  HALLAZGOS_SIN_MUESTRA,
  MEJORES,
  PUBLICACIONES,
  PUBLICACIONES_DTO,
  PUBLICACIONES_SIN_MUESTRA,
  PUBLICACIONES_SIN_POSITIVOS,
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
      <LentePorPublicacion
        publicaciones={PUBLICACIONES}
        ahora={AHORA}
        timeZone={ZONA}
        activa={null}
        onAbrir={noop}
      />
    </Frame>
  ),
};

export const FilaActiva: Story = {
  name: "Por publicación · fila con el detalle abierto",
  render: () => (
    <Frame>
      <LentePorPublicacion
        publicaciones={PUBLICACIONES}
        ahora={AHORA}
        timeZone={ZONA}
        activa={PUBLICACIONES[1]?.cardId ?? null}
        onAbrir={noop}
      />
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
        <MejoresSkeleton periodo={30} />
        <HallazgosSkeleton />
        <LenteSkeleton />
        <LenteSkeleton forma="tabla" />
      </div>
    </Frame>
  ),
};

// ---------------------------------------------------------------------------
// Tus mejores publicaciones, Hallazgos y Por concepto (PR 8b)

const mejores = (dto: typeof PUBLICACIONES_DTO, ids = dto.mejores) => (
  <MejoresPublicaciones
    publicaciones={dto.publicaciones}
    mejores={ids}
    periodo={30}
    timeZone={ZONA}
    onAbrir={noop}
  />
);

export const MejoresCinco: Story = {
  name: "Mejores · cinco",
  render: () => <Frame>{mejores(PUBLICACIONES_DTO)}</Frame>,
};

/** Con menos de cinco, la #1 no se estira: las columnas que sobran quedan vacías. */
export const MejoresDos: Story = {
  name: "Mejores · solo dos superaron su promedio",
  render: () => <Frame>{mejores(PUBLICACIONES_DTO, MEJORES.slice(0, 2))}</Frame>,
};

export const MejoresSinMuestra: Story = {
  name: "Mejores · sin muestra (5c)",
  render: () => <Frame>{mejores(PUBLICACIONES_SIN_MUESTRA)}</Frame>,
};

export const MejoresSinPositivos: Story = {
  name: "Mejores · ninguna superó su promedio",
  render: () => <Frame>{mejores(PUBLICACIONES_SIN_POSITIVOS)}</Frame>,
};

const hallazgos = (dto: typeof HALLAZGOS_COMPLETO) => (
  <Hallazgos hallazgos={dto} onCrearEnChat={noop} onVerEnRitmo={noop} />
);

export const HallazgosCompletos: Story = {
  name: "Hallazgos · formato y día",
  render: () => <Frame>{hallazgos(HALLAZGOS_COMPLETO)}</Frame>,
};

export const HallazgosSinMuestra: Story = {
  name: "Hallazgos · sin muestra",
  render: () => <Frame>{hallazgos(HALLAZGOS_SIN_MUESTRA)}</Frame>,
};

export const HallazgosSinDiferencia: Story = {
  name: "Hallazgos · ninguna diferencia se sostiene",
  render: () => <Frame>{hallazgos(HALLAZGOS_SIN_DIFERENCIA)}</Frame>,
};

const MUESTRA = new Map([
  ["tiktok", "suficiente"],
  ["instagram", "poca"],
  ["facebook", "suficiente"],
  ["linkedin", "no_reporta"],
] as const);

export const PorConcepto: Story = {
  name: "Por concepto · multi-red",
  render: () => (
    <Frame>
      <LentePorConcepto
        conceptos={CONCEPTOS}
        publicaciones={PUBLICACIONES}
        muestraPorRed={MUESTRA}
        ahora={AHORA}
        timeZone={ZONA}
        activa={null}
        onAbrir={noop}
      />
    </Frame>
  ),
};

export const PorConceptoFilaActiva: Story = {
  name: "Por concepto · red con el detalle abierto",
  render: () => (
    <Frame>
      <LentePorConcepto
        conceptos={CONCEPTOS}
        publicaciones={PUBLICACIONES}
        muestraPorRed={MUESTRA}
        ahora={AHORA}
        timeZone={ZONA}
        activa={CONCEPTOS[0]?.hermanas[1]?.cardId ?? null}
        onAbrir={noop}
      />
    </Frame>
  ),
};

export const PorConceptoVacio: Story = {
  name: "Por concepto · sin ideas multi-red",
  render: () => (
    <Frame>
      <LentePorConcepto
        conceptos={[]}
        publicaciones={PUBLICACIONES}
        muestraPorRed={MUESTRA}
        ahora={AHORA}
        timeZone={ZONA}
        activa={null}
        onAbrir={noop}
      />
    </Frame>
  ),
};
