import type {
  LibraryAssetDetailDto,
  LibraryAssetDto,
  LibraryCardRef,
  LibraryPageDto,
  LibrarySummaryDto,
  LibraryVersionDto,
} from "@presencia/shared";

// Datos de ejemplo de Biblioteca (F12). Los ids son los de las imágenes de
// `fixtures/assets/`, que Storybook sirve en /api/assets/<id>/content.
//
// Las fechas se calculan desde "ahora" y no van escritas: así siempre hay algo
// en "Hoy", en "Esta semana" y en un mes anterior, corra cuando corra.

const HOUR = 60 * 60 * 1000;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();

const id = (n: number) => `a1b2c3d4-000${String(n)}-4a00-8000-00000000000${String(n)}`;

const card = (
  network: LibraryCardRef["network"],
  status: LibraryCardRef["status"],
  n: number,
): LibraryCardRef => ({ id: `card-${String(n)}`, chatId: `chat-${String(n)}`, network, status });

const base = (n: number, over: Partial<LibraryAssetDto>): LibraryAssetDto => ({
  id: id(n),
  kind: "image",
  origin: "generated",
  mimeType: "image/png",
  sizeBytes: 1_800_000,
  width: 1080,
  height: 1350,
  alt: null,
  originalName: null,
  createdAt: ago(1),
  prompt: null,
  instruction: null,
  parentAssetId: null,
  chat: null,
  bornInCard: null,
  uses: [],
  state: "unused",
  ...over,
});

const CAFE = { id: "chat-1", title: "Café de especialidad para Instagram" };
const CURSO = { id: "chat-2", title: "Lanzamiento curso de fotografía" };
const TENDENCIAS = { id: "chat-3", title: "Tendencias de IA para creators" };

export const LIBRARY_ASSETS: LibraryAssetDto[] = [
  // Las dos primeras, de hace minutos: así "Hoy" casi nunca falta.
  base(1, {
    createdAt: ago(0.05),
    instruction: "Quita a las personas del fondo.",
    parentAssetId: id(2),
    alt: "Taza de café humeante sobre una mesa de madera junto a una ventana.",
    chat: CAFE,
    bornInCard: card("instagram", "draft", 1),
    uses: [card("instagram", "draft", 1)],
    state: "chosen",
  }),
  base(2, {
    createdAt: ago(0.1),
    sizeBytes: 1_900_000,
    prompt:
      "Taza de café de especialidad sobre mesa de madera, luz de mañana entrando por la ventana, tonos cálidos, estilo editorial.",
    chat: CAFE,
    bornInCard: card("instagram", "draft", 1),
    state: "discarded",
  }),
  base(3, {
    createdAt: ago(3),
    width: 1920,
    height: 1080,
    sizeBytes: 2_400_000,
    prompt: "Portada de carrusel minimalista: escritorio ordenado con laptop y libreta.",
    chat: { id: "chat-4", title: "Carrusel LinkedIn: 5 errores" },
    bornInCard: card("linkedin", "scheduled", 4),
    uses: [card("linkedin", "scheduled", 4)],
    state: "chosen",
  }),
  base(4, {
    createdAt: ago(4),
    origin: "uploaded",
    mimeType: "image/jpeg",
    width: 3024,
    height: 3024,
    sizeBytes: 3_100_000,
    originalName: "IMG_4821.jpg",
  }),
  base(5, {
    createdAt: ago(52),
    width: 1080,
    height: 1080,
    sizeBytes: 1_200_000,
    prompt: "Cámara réflex vintage sobre fondo oscuro, composición centrada, sombra suave.",
    chat: CURSO,
    bornInCard: card("facebook", "published", 2),
    uses: [card("facebook", "published", 2)],
    state: "chosen",
  }),
  base(6, {
    createdAt: ago(96),
    width: 1600,
    height: 900,
    sizeBytes: 900_000,
    prompt: "Ilustración plana de un calendario con notas adhesivas, colores pastel.",
    chat: null,
    bornInCard: null,
  }),
  base(7, {
    createdAt: ago(24 * 40),
    origin: "uploaded",
    mimeType: "image/jpeg",
    sizeBytes: 2_700_000,
    originalName: "taller-al-aire-libre.jpg",
    alt: "Alumnas practicando con cámaras en un taller al aire libre.",
    chat: TENDENCIAS,
    bornInCard: card("x", "published", 3),
    uses: [card("x", "published", 3)],
    state: "chosen",
  }),
];

export const LIBRARY_PAGE: LibraryPageDto = { items: LIBRARY_ASSETS, nextCursor: null };

export const LIBRARY_SUMMARY: LibrarySummaryDto = {
  total: LIBRARY_ASSETS.length,
  generatedThisWeek: { count: 5, assetIds: [id(1), id(2), id(3), id(5), id(6)] },
  readyToPublish: { count: 1, assetIds: [id(1)] },
  uploaded: { count: 2, assetIds: [id(4), id(7)] },
  published: { count: 2, assetIds: [id(5), id(7)] },
};

export const LIBRARY_SUMMARY_EMPTY: LibrarySummaryDto = {
  total: 0,
  generatedThisWeek: { count: 0, assetIds: [] },
  readyToPublish: { count: 0, assetIds: [] },
  uploaded: { count: 0, assetIds: [] },
  published: { count: 0, assetIds: [] },
};

const version = (
  asset: LibraryAssetDto,
  over: Partial<LibraryVersionDto> = {},
): LibraryVersionDto => ({
  assetId: asset.id,
  kind: asset.instruction ? "edit" : "original",
  instruction: asset.instruction,
  width: asset.width,
  height: asset.height,
  createdAt: asset.createdAt,
  ...over,
});

/**
 * El detalle de cada imagen (`GET /api/library/:id`). La 1 es una edición de
 * la 2: las dos comparten historial.
 */
export const LIBRARY_DETAILS: Record<string, LibraryAssetDetailDto> = Object.fromEntries(
  LIBRARY_ASSETS.map((asset) => {
    const [first, second] = LIBRARY_ASSETS;
    const lineage =
      first && second && (asset.id === first.id || asset.id === second.id)
        ? [version(second), version(first)]
        : [version(asset)];
    return [asset.id, { ...asset, versions: lineage }];
  }),
);

/** Las respuestas de ejemplo del detalle, por ruta, para `parameters.api`. */
export const LIBRARY_DETAIL_ROUTES = Object.fromEntries(
  Object.values(LIBRARY_DETAILS).map((detail) => [`/api/library/${detail.id}`, { body: detail }]),
);
