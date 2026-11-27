import { z } from "zod";
import {
  socialNetworkSchema,
  type PublicationArchetype,
  type SocialNetwork,
} from "./publication.js";
import type { BaseDeCalculoDto } from "./ritmo.js";

// El contrato del módulo Analíticas (F12).
//
// Igual que Ritmo: viajan NÚMEROS Y ESTADOS, nunca copy. "No disponible",
// "Métricas en camino" o "LinkedIn no comparte estadísticas de perfiles
// personales" los escribe la pantalla a partir del estado y la red. El motivo
// crudo que guarda la ingesta (`raw`) no viaja: viene del proveedor, a veces en
// inglés, y no es algo que el creator deba leer.
//
// Las reglas de cómo sale cada número están en el addendum F12 de ADR-022.

/** Los periodos del selector. Sin "Personalizado" en V1. */
export const PERIODOS_ANALITICAS = [7, 30, 90] as const;
export type PeriodoAnaliticas = (typeof PERIODOS_ANALITICAS)[number];

const periodoSchema = z
  .enum(["7", "30", "90"])
  .default("30")
  .transform((valor) => Number(valor) as PeriodoAnaliticas);

export const analiticasQuerySchema = z.object({
  periodo: periodoSchema,
  red: socialNetworkSchema.optional(),
});
export type AnaliticasQuery = z.infer<typeof analiticasQuerySchema>;

export const analiticasDetalleQuerySchema = z.object({ periodo: periodoSchema });

/**
 * Los cuatro estados de una publicación (lore doc §4). Son estados distintos
 * del mundo, no grados del mismo vacío:
 *
 * - `medida`: la red dio al menos un número.
 * - `en_camino`: salió hace menos de 24 h y la red todavía no contesta.
 * - `no_reporta`: la red contestó sin números (LinkedIn personal, X).
 * - `sin_medicion`: Presencia no pudo seguirla (sin id del post en la red).
 */
export const ESTADOS_PUBLICACION = ["medida", "en_camino", "no_reporta", "sin_medicion"] as const;
export type EstadoPublicacion = (typeof ESTADOS_PUBLICACION)[number];

/**
 * Cuánta evidencia hay en una red, dentro de la ventana de referencia.
 *
 * - `sin_datos`: ninguna publicación con 24 h cumplidas.
 * - `no_reporta`: publicó, y ninguna trajo un número.
 * - `poca`: hay números, pero menos de 10 publicaciones (o nadie interactuó).
 * - `suficiente`: hay promedio, y por eso hay "sobre tu promedio".
 */
export const MUESTRAS_DE_RED = ["sin_datos", "no_reporta", "poca", "suficiente"] as const;
export type MuestraDeRed = (typeof MUESTRAS_DE_RED)[number];

/**
 * El engagement de una red.
 *
 * `valor` está en la unidad de su `base`: con `tasa`, una fracción (0.052 =
 * 5.2%); con `interacciones`, interacciones por publicación. `cambio` es la
 * diferencia absoluta contra el periodo anterior en esa misma unidad (con
 * `tasa`, 0.004 = "+0.4 pts"), medida a las 24 h de cada publicación.
 */
export interface AnaliticasEngagementDto {
  network: SocialNetwork;
  base: BaseDeCalculoDto;
  muestra: MuestraDeRed;
  valor: number | null;
  cambio: number | null;
}

/** El resumen del periodo: los cuatro números de arriba. */
export interface AnaliticasResumenDto {
  periodoDias: PeriodoAnaliticas;
  red: SocialNetwork | null;
  /** El periodo o 30 días, lo que sea más largo: de ahí sale "tu promedio". */
  ventanaReferenciaDias: number;
  /** `false` = nunca ha publicado nada (estado "Cero absoluto"). */
  hayPublicaciones: boolean;
  publicaciones: {
    total: number;
    /** Diferencia absoluta. `null` si el periodo anterior no tuvo ninguna. */
    cambio: number | null;
  };
  alcance: {
    /** Suma de alcance de las redes que lo reportan. `null` si ninguna. */
    total: number | null;
    /** Porcentaje entero, a 24 h. `null` = "Sin periodo anterior para comparar". */
    cambioPct: number | null;
    /** Qué redes entraron a la suma: el KPI dice cuáles. */
    redes: SocialNetwork[];
  };
  interacciones: {
    total: number | null;
    cambioPct: number | null;
  };
  /**
   * Una entrada por red; con `red` elegida, solo esa. Nunca un número global.
   * En el orden de `AnaliticasRedesDto.redes`: más publicaciones primero, y al
   * final las que no reportan.
   */
  engagement: AnaliticasEngagementDto[];
  /** La medición más reciente de lo que la ingesta sigue midiendo (≤ 30 días). */
  ultimaMedicion: string | null;
}

/** La cuenta conectada de una red, para la fila de "Por red". */
export interface AnaliticasCuentaDto {
  nombre: string | null;
  /** La conexión se cayó: "Necesitamos permiso…" + "Reconectar". */
  reconectar: boolean;
}

/** Una fila de la lente "Por red". */
export interface AnaliticasRedDto {
  network: SocialNetwork;
  cuenta: AnaliticasCuentaDto | null;
  engagement: AnaliticasEngagementDto;
  /** Publicaciones con 24 h cumplidas que entraron al promedio (Ritmo: `nTotal`). */
  nReferencia: number;
  publicaciones: number;
  /** `null` = la red no reporta alcance (no es un cero). */
  alcance: number | null;
  interacciones: number | null;
  /**
   * El engagement por tramos iguales del periodo, del más viejo al más nuevo
   * (7 tramos de 1 día, 5 de 6 días o 9 de 10 días). `null` = tramo sin
   * publicaciones medidas.
   */
  tendencia: (number | null)[];
}

export interface AnaliticasRedesDto {
  periodoDias: PeriodoAnaliticas;
  ventanaReferenciaDias: number;
  /** Las redes con publicaciones en el periodo: más publicaciones primero, las que no reportan al final. */
  redes: AnaliticasRedDto[];
}

/** La miniatura de una publicación: la imagen de portada, o el ícono del formato. */
export interface AnaliticasMiniaturaDto {
  assetId: string | null;
  /** Cuántas imágenes tiene si es carrusel (0 si no). */
  imagenes: number;
}

/** Una fila de la lente "Por publicación". */
export interface AnaliticasPublicacionDto {
  cardId: string;
  network: SocialNetwork;
  archetype: PublicationArchetype;
  /** La primera línea con texto de lo que se publicó. */
  titulo: string;
  miniatura: AnaliticasMiniaturaDto;
  publishedAt: string;
  estado: EstadoPublicacion;
  alcance: number | null;
  interacciones: number | null;
  /** Porcentaje entero sobre tu promedio en esa red, a 24 h. */
  lift: number | null;
  /** Concepto multi-red al que pertenece (lente "Por concepto"). */
  groupId: string | null;
}

export interface AnaliticasPublicacionesDto {
  periodoDias: PeriodoAnaliticas;
  red: SocialNetwork | null;
  /** Ordenadas por `lift` descendente; las que no tienen, al final por fecha. */
  publicaciones: AnaliticasPublicacionDto[];
  /**
   * "Tus mejores publicaciones": hasta 5 `cardId` de `publicaciones`, en orden.
   * Solo las que rindieron sobre tu promedio (lift > 0). Vacío no dice por qué:
   * si alguna fila tiene lift, ninguna superó tu promedio; si ninguna lo tiene,
   * falta muestra.
   */
  mejores: string[];
  /**
   * La lente "Por concepto": ideas publicadas en dos o más redes dentro del
   * periodo. Con una red elegida, solo los conceptos que la incluyen, pero con
   * TODAS sus hermanas: comparar entre redes es el punto de la lente.
   */
  conceptos: AnaliticasConceptoDto[];
}

/** Una hermana del mismo concepto, en otra red. */
export interface AnaliticasHermanaDto {
  cardId: string;
  network: SocialNetwork;
  estado: EstadoPublicacion;
  lift: number | null;
}

/** Una idea publicada en varias redes (cards con el mismo `groupId`). */
export interface AnaliticasConceptoDto {
  groupId: string;
  /** El título de la primera que se publicó. */
  titulo: string;
  /** Cuándo salió la primera. */
  publishedAt: string;
  /** Por lift descendente; las que no tienen, al final. */
  hermanas: AnaliticasHermanaDto[];
  /**
   * Dónde rindió más **sobre tu promedio de esa red** (nunca el número crudo).
   * `null` si menos de dos hermanas tienen lift (no hay con qué comparar) o si
   * las dos de arriba empatan.
   */
  mejorEn: SocialNetwork | null;
}

/**
 * El formato de lo que se publicó, que no es el arquetipo: el arquetipo va
 * atado a la red, así que dentro de una red solo cambia esto.
 *
 * - `carrusel`: dos o más imágenes en slides.
 * - `imagen`: una imagen suelta.
 * - `video`: guion de video (TikTok, YouTube).
 * - `texto`: sin imagen.
 */
export const FORMATOS_PUBLICADOS = ["carrusel", "imagen", "video", "texto"] as const;
export type FormatoPublicado = (typeof FORMATOS_PUBLICADOS)[number];

/** 0 = lunes, 6 = domingo (igual que Ritmo). */
export type DiaDeLaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** El grupo que ganó en un hallazgo de día: un día, o un lado de la semana. */
export type CorteDeDia = { dia: DiaDeLaSemana } | "fin_de_semana" | "entre_semana";

interface HallazgoBaseDto {
  /** Siempre dentro de una red: nunca se comparan redes entre sí. */
  network: SocialNetwork;
  /** Cuánto más rindió el grupo ganador, en porcentaje entero (≥ 25). */
  diferenciaPct: number;
  nGanador: number;
  nPerdedor: number;
}

export interface HallazgoFormatoDto extends HallazgoBaseDto {
  tipo: "formato";
  ganador: FormatoPublicado;
  perdedor: FormatoPublicado;
}

/** El perdedor es "el resto": el resto de la semana, o el otro lado de ella. */
export interface HallazgoDiaDto extends HallazgoBaseDto {
  tipo: "dia";
  ganador: CorteDeDia;
}

/** Un hallazgo de Analíticas (lore doc §5). El PR 9 suma el de voz. */
export type AnaliticasHallazgoDto = HallazgoFormatoDto | HallazgoDiaDto;

export const VENTANA_HALLAZGOS_DIAS = 90;

export const analiticasHallazgosQuerySchema = z.object({ red: socialNetworkSchema.optional() });

export interface AnaliticasHallazgosDto {
  /** Siempre 90: los hallazgos no siguen al selector de periodo. */
  ventanaDias: typeof VENTANA_HALLAZGOS_DIAS;
  red: SocialNetwork | null;
  /**
   * Si alguna red (o la elegida) tiene muestra para buscar: separa "con unas
   * publicaciones más…" de "no hubo una diferencia que se sostenga".
   */
  hayMuestra: boolean;
  /** Hasta 3, de mayor a menor diferencia. */
  hallazgos: AnaliticasHallazgoDto[];
}

/** El panel de detalle de una publicación. */
export interface AnaliticasPublicacionDetalleDto extends AnaliticasPublicacionDto {
  texto: string;
  /** El último número que la red dio de cada métrica. `null` = "No disponible". */
  metricas: {
    reach: number | null;
    impressions: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
  };
  /** "Medido hace 3 horas". */
  medidoEn: string | null;
  /** Por qué no hay `lift`, si no lo hay. */
  muestraDeRed: MuestraDeRed;
  carpeta: { nombre: string; icono: string | null } | null;
  chatId: string | null;
  postUrl: string | null;
  enOtrasRedes: AnaliticasHermanaDto[];
}
