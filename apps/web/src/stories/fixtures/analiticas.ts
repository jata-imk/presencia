import type {
  AnaliticasConceptoDto,
  AnaliticasEngagementDto,
  AnaliticasHallazgosDto,
  AnaliticasPublicacionDetalleDto,
  AnaliticasPublicacionDto,
  AnaliticasPublicacionesDto,
  AnaliticasRedDto,
  AnaliticasRedesDto,
  AnaliticasResumenDto,
} from "@presencia/shared";
import { IMAGEN_DEMO } from "./cards.js";

// Datos de ejemplo de Analíticas (F12) para Storybook. Los números son los del
// diseño "Presencia Analytics Overview", ajustados a lo que decidió V1: sin
// vistas de TikTok (su alcance es "No disponible") y el engagement por red,
// nunca uno global. Anclados a "ahora" para que los "hace…" se lean bien.

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
const ahora = Date.now();
const hace = (ms: number) => new Date(ahora - ms).toISOString();

const CUENTA = { nombre: "@jose.productivo", reconectar: false };

const ENG_INSTAGRAM: AnaliticasEngagementDto = {
  network: "instagram",
  base: "tasa",
  muestra: "suficiente",
  valor: 0.052,
  cambio: 0.004,
};
const ENG_TIKTOK: AnaliticasEngagementDto = {
  network: "tiktok",
  base: "interacciones",
  muestra: "suficiente",
  valor: 86.2,
  cambio: 9,
};
const ENG_FACEBOOK: AnaliticasEngagementDto = {
  network: "facebook",
  base: "tasa",
  muestra: "poca",
  valor: 0.021,
  cambio: -0.003,
};
const ENG_LINKEDIN: AnaliticasEngagementDto = {
  network: "linkedin",
  base: "interacciones",
  muestra: "no_reporta",
  valor: null,
  cambio: null,
};

export const RESUMEN_COMPLETO: AnaliticasResumenDto = {
  periodoDias: 30,
  red: null,
  ventanaReferenciaDias: 30,
  hayPublicaciones: true,
  publicaciones: { total: 23, cambio: 4 },
  alcance: { total: 48_200, cambioPct: 12, redes: ["instagram", "facebook"] },
  interacciones: { total: 2140, cambioPct: -3 },
  engagement: [ENG_INSTAGRAM, ENG_TIKTOK, ENG_FACEBOOK, ENG_LINKEDIN],
  ultimaMedicion: hace(HORA),
};

/** La ingesta lleva 7 horas sin medir (3g): la barra lo dice, lo demás igual. */
export const RESUMEN_DESACTUALIZADO: AnaliticasResumenDto = {
  ...RESUMEN_COMPLETO,
  ultimaMedicion: hace(7 * HORA),
};

/** Con TikTok elegido (5b): sin alcance, el engagement en interacciones. */
export const RESUMEN_TIKTOK: AnaliticasResumenDto = {
  ...RESUMEN_COMPLETO,
  red: "tiktok",
  publicaciones: { total: 9, cambio: 2 },
  alcance: { total: null, cambioPct: null, redes: [] },
  interacciones: { total: 862, cambioPct: -5 },
  engagement: [ENG_TIKTOK],
};

/** Poca data (3d): hay números, pero ningún cambio se sostiene. */
export const RESUMEN_POCA: AnaliticasResumenDto = {
  ...RESUMEN_COMPLETO,
  publicaciones: { total: 4, cambio: null },
  alcance: { total: 6100, cambioPct: null, redes: ["instagram", "facebook"] },
  interacciones: { total: 188, cambioPct: null },
  engagement: [
    { ...ENG_INSTAGRAM, muestra: "poca", valor: 0.034, cambio: null },
    { ...ENG_TIKTOK, muestra: "poca", valor: 41, cambio: null },
    { ...ENG_FACEBOOK, valor: 0.012, cambio: null },
    ENG_LINKEDIN,
  ],
};

/** Nunca ha publicado (3a). */
export const RESUMEN_CERO: AnaliticasResumenDto = {
  ...RESUMEN_COMPLETO,
  hayPublicaciones: false,
  publicaciones: { total: 0, cambio: null },
  alcance: { total: null, cambioPct: null, redes: [] },
  interacciones: { total: null, cambioPct: null },
  engagement: [],
  ultimaMedicion: null,
};

/** Seis redes: la celda de engagement muestra 4 y "y 2 redes más". */
export const RESUMEN_SEIS_REDES: AnaliticasResumenDto = {
  ...RESUMEN_COMPLETO,
  engagement: [
    ENG_INSTAGRAM,
    ENG_TIKTOK,
    ENG_FACEBOOK,
    { network: "threads", base: "tasa", muestra: "poca", valor: 0.031, cambio: null },
    { network: "youtube", base: "interacciones", muestra: "poca", valor: 40, cambio: null },
    ENG_LINKEDIN,
  ],
};

export const RED_INSTAGRAM: AnaliticasRedDto = {
  network: "instagram",
  cuenta: CUENTA,
  engagement: ENG_INSTAGRAM,
  nReferencia: 14,
  publicaciones: 10,
  alcance: 19_600,
  interacciones: 1020,
  tendencia: [0.042, 0.061, 0.05, 0.058, 0.049],
};
export const RED_TIKTOK: AnaliticasRedDto = {
  network: "tiktok",
  cuenta: { nombre: "@joseproductivo", reconectar: false },
  engagement: ENG_TIKTOK,
  nReferencia: 12,
  publicaciones: 9,
  alcance: null,
  interacciones: 862,
  tendencia: [62, 70, 118, 81, 95],
};
export const RED_FACEBOOK: AnaliticasRedDto = {
  network: "facebook",
  cuenta: { nombre: "Jose Productivo", reconectar: false },
  engagement: ENG_FACEBOOK,
  nReferencia: 4,
  publicaciones: 3,
  alcance: 4500,
  interacciones: 94,
  tendencia: [0.031, null, 0.019, null, null],
};
export const RED_LINKEDIN: AnaliticasRedDto = {
  network: "linkedin",
  cuenta: { nombre: "Perfil personal", reconectar: false },
  engagement: ENG_LINKEDIN,
  nReferencia: 0,
  publicaciones: 4,
  alcance: null,
  interacciones: null,
  tendencia: [null, null, null, null, null],
};
/** La conexión se cayó (3f): "Necesitamos permiso…" + "Reconectar". */
export const RED_RECONECTAR: AnaliticasRedDto = {
  ...RED_INSTAGRAM,
  cuenta: { nombre: "@jose.productivo", reconectar: true },
};
/** Publicó y nada trae número (en camino o sin medición: la tarjeta no promete). */
export const RED_EN_CAMINO: AnaliticasRedDto = {
  ...RED_FACEBOOK,
  engagement: { ...ENG_FACEBOOK, muestra: "sin_datos", valor: null, cambio: null },
  publicaciones: 1,
  alcance: null,
  interacciones: null,
  tendencia: [null, null, null, null, null],
};

export const REDES_COMPLETO: AnaliticasRedesDto = {
  periodoDias: 30,
  ventanaReferenciaDias: 30,
  redes: [RED_INSTAGRAM, RED_TIKTOK, RED_FACEBOOK, RED_LINKEDIN],
};

export const REDES_RECONECTAR: AnaliticasRedesDto = {
  ...REDES_COMPLETO,
  redes: [RED_RECONECTAR, RED_TIKTOK, RED_FACEBOOK, RED_LINKEDIN],
};

function publicacion(
  n: number,
  campos: Partial<AnaliticasPublicacionDto> & Pick<AnaliticasPublicacionDto, "titulo">,
): AnaliticasPublicacionDto {
  return {
    cardId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    network: "instagram",
    archetype: "visual_first",
    miniatura: { assetId: null, imagenes: 0 },
    publishedAt: hace(n * 2 * DIA),
    estado: "medida",
    alcance: 5400,
    interacciones: 214,
    lift: 8,
    groupId: null,
    ...campos,
  };
}

// Tres conceptos multi-red (lente Por concepto): uno en cuatro redes con
// LinkedIn sin números, uno en dos, y uno sin con qué comparar ("Mejor en"
// calla).
const GRUPO_APPS = "00000000-0000-4000-8000-0000000a7701";
const GRUPO_SETUP = "00000000-0000-4000-8000-0000000a7702";
const GRUPO_TREND = "00000000-0000-4000-8000-0000000a7703";

export const PUBLICACIONES: AnaliticasPublicacionDto[] = [
  publicacion(1, {
    titulo: "3 apps gratis que reemplazan a las de pago",
    network: "tiktok",
    archetype: "video_script",
    alcance: null,
    interacciones: 1251,
    lift: 62,
    groupId: GRUPO_APPS,
  }),
  publicacion(2, {
    titulo: "Mi setup de escritorio 2026",
    alcance: 7100,
    interacciones: 419,
    lift: 48,
    groupId: GRUPO_SETUP,
  }),
  publicacion(3, {
    titulo: "Carrusel: atajos de teclado que sí uso",
    // Una imagen que ya no está en Biblioteca: cae al ícono del formato.
    miniatura: { assetId: "00000000-0000-4000-8000-0000000000ff", imagenes: 5 },
    alcance: 6000,
    interacciones: 302,
    lift: 31,
    groupId: GRUPO_APPS,
  }),
  publicacion(4, {
    titulo: "Mi curso de productividad abre inscripciones",
    network: "facebook",
    archetype: "text_first",
    alcance: 2100,
    interacciones: 44,
    lift: -4,
    groupId: GRUPO_APPS,
  }),
  publicacion(5, {
    titulo: "Un día en Mérida con mi laptop",
    network: "tiktok",
    archetype: "video_script",
    alcance: null,
    interacciones: 121,
    lift: -38,
    groupId: GRUPO_SETUP,
  }),
  publicacion(6, {
    titulo: "El trend de las 5 pestañas",
    alcance: 5400,
    interacciones: 214,
    lift: null,
    groupId: GRUPO_TREND,
  }),
  {
    ...publicacion(7, { titulo: "5 extensiones de Chrome que uso todos los días" }),
    publishedAt: hace(2 * HORA),
    estado: "en_camino",
    alcance: null,
    interacciones: null,
    lift: null,
  },
  publicacion(8, {
    titulo: "Dejé de usar 6 apps de notas",
    network: "linkedin",
    archetype: "text_first",
    estado: "no_reporta",
    alcance: null,
    interacciones: null,
    lift: null,
    groupId: GRUPO_APPS,
  }),
  publicacion(9, {
    titulo: "Mi escritorio de trabajo en Mérida",
    network: "linkedin",
    archetype: "text_first",
    estado: "sin_medicion",
    alcance: null,
    interacciones: null,
    lift: null,
    groupId: GRUPO_TREND,
  }),
  publicacion(10, {
    titulo: "Cómo organizo mi semana en 4 minutos",
    network: "tiktok",
    archetype: "video_script",
    alcance: null,
    interacciones: 574,
    lift: 27,
  }),
  publicacion(11, {
    titulo: "Lo que aprendí en 100 días de publicar diario",
    network: "facebook",
    archetype: "text_first",
    alcance: 3200,
    interacciones: 96,
    lift: 12,
  }),
];

const fila = (n: number) => PUBLICACIONES[n - 1]!;

function hermana(n: number) {
  const { cardId, network, estado, lift } = fila(n);
  return { cardId, network, estado, lift };
}

export const CONCEPTOS: AnaliticasConceptoDto[] = [
  {
    groupId: GRUPO_APPS,
    titulo: fila(1).titulo,
    publishedAt: fila(8).publishedAt,
    hermanas: [hermana(1), hermana(3), hermana(4), hermana(8)],
    mejorEn: "tiktok",
  },
  {
    groupId: GRUPO_SETUP,
    titulo: fila(2).titulo,
    publishedAt: fila(5).publishedAt,
    hermanas: [hermana(2), hermana(5)],
    mejorEn: "instagram",
  },
  {
    groupId: GRUPO_TREND,
    titulo: fila(6).titulo,
    publishedAt: fila(9).publishedAt,
    hermanas: [hermana(6), hermana(9)],
    mejorEn: null,
  },
];

/** Las cinco de arriba: todas con lift > 0, ya en el orden del motor. */
export const MEJORES = [1, 2, 3, 10, 11].map((n) => fila(n).cardId);

export const PUBLICACIONES_DTO: AnaliticasPublicacionesDto = {
  periodoDias: 30,
  red: null,
  // Las filas, por lift como las manda la API; las sin número al final.
  publicaciones: [...PUBLICACIONES].sort((a, b) => (b.lift ?? -Infinity) - (a.lift ?? -Infinity)),
  mejores: MEJORES,
  conceptos: CONCEPTOS,
};

/** Hubo con qué comparar, pero ninguna superó su promedio. */
export const PUBLICACIONES_SIN_POSITIVOS: AnaliticasPublicacionesDto = {
  ...PUBLICACIONES_DTO,
  publicaciones: PUBLICACIONES.map((p) =>
    p.lift === null ? p : { ...p, lift: -Math.abs(p.lift) },
  ),
  mejores: [],
};

/** Ninguna red con muestra: ninguna fila tiene "sobre tu promedio". */
export const PUBLICACIONES_SIN_MUESTRA: AnaliticasPublicacionesDto = {
  ...PUBLICACIONES_DTO,
  publicaciones: PUBLICACIONES.map((p) => ({ ...p, lift: null })),
  mejores: [],
  conceptos: CONCEPTOS.map((c) => ({
    ...c,
    hermanas: c.hermanas.map((h) => ({ ...h, lift: null })),
    mejorEn: null,
  })),
};

// ---------------------------------------------------------------------------
// Hallazgos (PR 8b)

/** Los dos tipos, como los da el seed: formato en Instagram y martes en Facebook. */
export const HALLAZGOS_COMPLETO: AnaliticasHallazgosDto = {
  ventanaDias: 90,
  red: null,
  hayMuestra: true,
  hallazgos: [
    {
      tipo: "formato",
      network: "instagram",
      ganador: "carrusel",
      perdedor: "texto",
      diferenciaPct: 140,
      nGanador: 8,
      nPerdedor: 10,
    },
    {
      tipo: "dia",
      network: "facebook",
      ganador: { dia: 1 },
      diferenciaPct: 52,
      nGanador: 6,
      nPerdedor: 20,
    },
    {
      tipo: "dia",
      network: "tiktok",
      ganador: "entre_semana",
      diferenciaPct: 31,
      nGanador: 14,
      nPerdedor: 6,
    },
  ],
};

export const HALLAZGOS_SIN_MUESTRA: AnaliticasHallazgosDto = {
  ventanaDias: 90,
  red: null,
  hayMuestra: false,
  hallazgos: [],
};

export const HALLAZGOS_SIN_DIFERENCIA: AnaliticasHallazgosDto = {
  ...HALLAZGOS_SIN_MUESTRA,
  hayMuestra: true,
};

// ---------------------------------------------------------------------------
// El detalle de una publicación (PR 7b)

const CHAT_DEMO = "00000000-0000-4000-8000-00000000c4a7";

function detalle(
  base: AnaliticasPublicacionDto,
  campos: Partial<AnaliticasPublicacionDetalleDto> = {},
): AnaliticasPublicacionDetalleDto {
  return {
    ...base,
    texto: `${base.titulo}\n\nTe cuento cuáles uso y por qué. Guárdalo para después y compártelo con quien siempre anda pagando suscripciones.`,
    metricas: { reach: 5400, impressions: 8120, likes: 184, comments: 22, shares: 8 },
    medidoEn: hace(3 * HORA),
    muestraDeRed: "suficiente",
    carpeta: { nombre: "Productividad", icono: "🧠" },
    chatId: CHAT_DEMO,
    postUrl: "https://example.com/post",
    enOtrasRedes: [],
    ...campos,
  };
}

/** 2c del diseño: un TikTok medido, parte de un concepto en tres redes. */
export const DETALLE_CONCEPTO = detalle(fila(1), {
  metricas: { reach: null, impressions: 18_400, likes: 1043, comments: 96, shares: 112 },
  enOtrasRedes: [
    // Las hermanas apuntan a detalles que sí tienen fixture: en la historia
    // se puede saltar a ellas.
    { cardId: fila(3).cardId, network: "instagram", estado: "medida", lift: 8 },
    { cardId: fila(4).cardId, network: "facebook", estado: "medida", lift: -20 },
    { cardId: fila(8).cardId, network: "linkedin", estado: "no_reporta", lift: null },
  ],
});

/** Un carrusel con foto, sin carpeta ni chat de origen (el chat se borró). */
export const DETALLE_SIN_CHAT = detalle(fila(3), {
  miniatura: { assetId: IMAGEN_DEMO, imagenes: 5 },
  metricas: { reach: 6000, impressions: 9100, likes: 284, comments: 31, shares: null },
  carpeta: null,
  chatId: null,
});

export const DETALLE_EN_CAMINO = detalle(fila(7), {
  metricas: { reach: null, impressions: null, likes: null, comments: null, shares: null },
  medidoEn: null,
});

export const DETALLE_NO_REPORTA = detalle(fila(8), {
  metricas: { reach: null, impressions: null, likes: null, comments: null, shares: null },
  muestraDeRed: "no_reporta",
  medidoEn: hace(5 * HORA),
  postUrl: null,
});

/** Publicada por un proveedor que no devuelve el id del post: nadie la mide. */
export const DETALLE_SIN_MEDICION = detalle(fila(9), {
  metricas: { reach: null, impressions: null, likes: null, comments: null, shares: null },
  muestraDeRed: "no_reporta",
  medidoEn: null,
  postUrl: null,
});

/** Medida, pero su red todavía no junta 10 publicaciones para comparar. */
export const DETALLE_SIN_COMPARAR = detalle(fila(6), { muestraDeRed: "poca" });

/** La ruta exacta del detalle: el mock empata por pathname, sin query. */
export function rutaDeDetalle(dto: AnaliticasPublicacionDetalleDto) {
  return `/api/analiticas/publicaciones/${dto.cardId}`;
}

/** Las cuatro llamadas de la pantalla, con un resumen a elegir. */
export function rutasDeAnaliticas(
  resumen: AnaliticasResumenDto,
  redes = REDES_COMPLETO,
  publicaciones = PUBLICACIONES_DTO,
  hallazgos = HALLAZGOS_COMPLETO,
) {
  return {
    "/api/analiticas/resumen": { body: resumen },
    "/api/analiticas/redes": { body: redes },
    "/api/analiticas/publicaciones": { body: publicaciones },
    "/api/analiticas/hallazgos": { body: hallazgos },
  };
}
