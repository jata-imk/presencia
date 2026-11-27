import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router";
import type { AnaliticasPublicacionDetalleDto } from "@presencia/shared";
import { AnaliticasPage } from "./analiticas.js";
import {
  DETALLE_CONCEPTO,
  DETALLE_EN_CAMINO,
  DETALLE_NO_REPORTA,
  DETALLE_SIN_CHAT,
  DETALLE_SIN_COMPARAR,
  DETALLE_SIN_MEDICION,
  RESUMEN_COMPLETO,
  rutaDeDetalle,
  rutasDeAnaliticas,
} from "../stories/fixtures/analiticas.js";

// El detalle de una publicación (F12 PR 7b), abierto sobre la pantalla con la
// lente Por publicación, como se ve de verdad: con velo desde @lg y a
// pantalla completa debajo. La fila de la publicación abierta queda
// resaltada detrás.
//
// Todas las historias responden todos los detalles: así, "En otras redes"
// abre la hermana en vez de caer en el error del mock.
//
// Para móvil, cambia el ancho con la barra de Storybook (o mira la historia
// "Móvil a pantalla completa").

const TODOS = [
  DETALLE_CONCEPTO,
  DETALLE_SIN_CHAT,
  DETALLE_EN_CAMINO,
  DETALLE_NO_REPORTA,
  DETALLE_SIN_MEDICION,
  DETALLE_SIN_COMPARAR,
];

function rutas(extra: Record<string, unknown> = {}) {
  return {
    ...rutasDeAnaliticas(RESUMEN_COMPLETO),
    ...Object.fromEntries(TODOS.map((dto) => [rutaDeDetalle(dto), { body: dto }])),
    ...extra,
  };
}

function abierto(dto: AnaliticasPublicacionDetalleDto) {
  return { ruta: `/analiticas?lente=publicacion&post=${dto.cardId}`, api: rutas() };
}

const meta = {
  title: "Analíticas/Detalle",
  component: AnaliticasPage,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story, { parameters }) => (
      <MemoryRouter initialEntries={[(parameters.ruta as string | undefined) ?? "/analiticas"]}>
        <div className="h-[1000px]">
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof AnaliticasPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MedidaConConcepto: Story = {
  name: "Medida, con concepto (2c)",
  parameters: abierto(DETALLE_CONCEPTO),
};

export const SinCarpetaNiChat: Story = {
  name: "Con foto, sin carpeta ni chat",
  parameters: abierto(DETALLE_SIN_CHAT),
};

export const EnCamino: Story = {
  name: "Métricas en camino",
  parameters: abierto(DETALLE_EN_CAMINO),
};

export const LinkedInNoReporta: Story = {
  name: "LinkedIn no reporta",
  parameters: abierto(DETALLE_NO_REPORTA),
};

export const SinMedicion: Story = {
  name: "Sin medición",
  parameters: abierto(DETALLE_SIN_MEDICION),
};

export const SinComparar: Story = {
  name: "Sin comparar (poca muestra)",
  parameters: abierto(DETALLE_SIN_COMPARAR),
};

export const Cargando: Story = {
  parameters: {
    ruta: `/analiticas?lente=publicacion&post=${DETALLE_CONCEPTO.cardId}`,
    api: rutas({ [rutaDeDetalle(DETALLE_CONCEPTO)]: { pending: true } }),
  },
};

export const NoExiste: Story = {
  name: "No existe (404)",
  parameters: {
    ruta: "/analiticas?lente=publicacion&post=00000000-0000-4000-8000-0000000000aa",
    api: rutas({
      "/api/analiticas/publicaciones/00000000-0000-4000-8000-0000000000aa": {
        status: 404,
        body: { message: "No encontramos esa publicación." },
      },
    }),
  },
};

export const ErrorAlCargar: Story = {
  name: "Error al cargar",
  parameters: {
    ruta: `/analiticas?lente=publicacion&post=${DETALLE_CONCEPTO.cardId}`,
    api: rutas({
      [rutaDeDetalle(DETALLE_CONCEPTO)]: { status: 500, body: { message: "Error interno" } },
    }),
  },
};

export const Movil: Story = {
  name: "Móvil a pantalla completa",
  parameters: abierto(DETALLE_CONCEPTO),
  globals: { viewport: { value: "movil" } },
};
