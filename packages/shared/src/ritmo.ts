import { z } from "zod";
import { socialNetworkSchema, type SocialNetwork } from "./publication.js";

// El contrato del módulo Ritmo.
//
// Lo que se transmite son NÚMEROS Y UN MODO, nunca copy. El servidor dice
// "este usuario está en `poca`"; qué se le escribe en esa situación lo decide
// la pantalla. Mezclarlos obligaría a redeployar la API para cambiar una
// frase, y peor, pondría el registro cultural —la parte que de verdad importa
// del producto— en un lugar donde nadie lo revisa.

/**
 * Las franjas horarias, de tres horas, cubriendo el día completo.
 *
 * Vive en shared y no en el motor porque las usan los dos lados: el servidor
 * para agrupar publicaciones y la UI para etiquetar las filas del heatmap. Con
 * dos definiciones, un cambio de corte movería las barras sin mover los datos.
 *
 * Son ocho y no las seis que dibuja el diseño (6:00 a 24:00) porque el motor
 * no puede tener un hueco: un post de las 3 de la mañana existe, y si no
 * cayera en ninguna franja desaparecería del heatmap mientras seguiría
 * contando en el promedio general — las celdas visibles se compararían contra
 * un denominador que incluye algo que no se ve.
 */
export const FRANJAS = [
  { id: "madrugada", desde: 0, hasta: 3, etiqueta: "0–3", nombre: "Madrugada" },
  { id: "amanecer", desde: 3, hasta: 6, etiqueta: "3–6", nombre: "Antes del amanecer" },
  { id: "temprano", desde: 6, hasta: 9, etiqueta: "6–9", nombre: "Mañana temprano" },
  { id: "manana", desde: 9, hasta: 12, etiqueta: "9–12", nombre: "Mañana" },
  { id: "mediodia", desde: 12, hasta: 15, etiqueta: "12–15", nombre: "Mediodía" },
  { id: "tarde", desde: 15, hasta: 18, etiqueta: "15–18", nombre: "Tarde" },
  { id: "noche", desde: 18, hasta: 21, etiqueta: "18–21", nombre: "Noche" },
  { id: "trasnoche", desde: 21, hasta: 24, etiqueta: "21–24", nombre: "Tarde-noche" },
] as const;

/** Índice de la franja de una hora local (0–23). */
export function franjaDe(horaLocal: number): number {
  return Math.floor(horaLocal / 3);
}

/** Los días de la semana del heatmap, empezando en lunes. */
export const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;

/**
 * Los cuatro estados del módulo, resueltos en el servidor.
 *
 * No son grados de un mismo vacío: `no_reporta` es un hecho sobre la red
 * (LinkedIn personal, X) y `cold` es un hecho sobre el usuario. Decirle a
 * alguien "seguí publicando para desbloquear tus horarios" en el primer caso
 * sería prometerle algo que nunca va a llegar.
 */
export const MODOS_RITMO = ["cold", "poca", "full", "no_reporta"] as const;
export const modoRitmoSchema = z.enum(MODOS_RITMO);
export type ModoRitmo = z.infer<typeof modoRitmoSchema>;

/** Con qué se midió el engagement de una red. La UI lo dice en el pie. */
export const BASES_DE_CALCULO = ["tasa", "interacciones"] as const;
export type BaseDeCalculoDto = (typeof BASES_DE_CALCULO)[number];

export interface RitmoCeldaDto {
  /** 0 = lunes. */
  diaSemana: number;
  /** Índice en FRANJAS. */
  franja: number;
  n: number;
  /** 1–4 para el color; `0` es "acá no hay historia", nunca "rindió mal". */
  intensidad: number;
  /** Porcentaje entero contra el promedio del usuario en esa red. */
  lift: number | null;
  /** El número salió del promedio de la franja, no de esta celda. */
  heredado: boolean;
}

/**
 * El "+%" de una franja completa.
 *
 * Es el nivel al que casi siempre hay muestra: con 30 días de ventana, una
 * celda día×franja rara vez junta las publicaciones que el umbral pide, pero
 * la franja sí. La UI lo pinta en la etiqueta de la fila, donde pertenece —
 * repetirlo en las siete celdas se leería como si cada una tuviera su propia
 * medición.
 */
export interface RitmoFranjaDto {
  franja: number;
  n: number;
  lift: number | null;
}

export interface RitmoHorariosDto {
  network: SocialNetwork;
  modo: ModoRitmo;
  base: BaseDeCalculoDto;
  ventanaDias: number;
  nTotal: number;
  franjas: RitmoFranjaDto[];
  celdas: RitmoCeldaDto[];
}

export interface RitmoDiaDto {
  /** `YYYY-MM-DD` en la zona del usuario. */
  dia: string;
  total: number;
  porRed: Partial<Record<SocialNetwork, number>>;
}

export interface RitmoCadenciaDto {
  dias: RitmoDiaDto[];
  total: number;
  rachaActual: number;
  mejorRacha: number;
}

export interface RitmoObjetivoDto {
  network: SocialNetwork;
  /** Publicaciones por semana. */
  meta: number;
  /** Cuántas van esta semana. */
  hechas: number;
  /**
   * `true` mientras el usuario no haya puesto su propia meta.
   *
   * La UI lo marca porque un número que el producto propuso y uno que el
   * usuario eligió no son la misma promesa, y confundirlos hace que se sienta
   * evaluado contra algo que nunca aceptó.
   */
  sugerido: boolean;
}

export interface RitmoResumenDto {
  cadencia: RitmoCadenciaDto;
  objetivos: RitmoObjetivoDto[];
  /** Las redes con cuenta conectada; de ahí salen las pestañas de horarios. */
  redesConectadas: SocialNetwork[];
  /** Zona con la que se agruparon los días, para que la UI no la adivine. */
  timezone: string;
}

export const updateCadenceTargetBodySchema = z.object({
  network: socialNetworkSchema,
  // Tope alto pero existente: sin él, un `target` de 10.000 rompería el
  // render de los puntitos (uno por publicación) sin que nada más se queje.
  meta: z.number().int().min(0).max(50),
});
export type UpdateCadenceTargetBody = z.infer<typeof updateCadenceTargetBodySchema>;

export const ritmoHorariosQuerySchema = z.object({ network: socialNetworkSchema });

/**
 * Metas semanales por red mientras el usuario no ponga las suyas.
 *
 * Un solo número por red y NO uno por vertical. Diferenciar por nicho pediría
 * inventar ~120 números sin un dato que los respalde, que es precisamente la
 * precisión falsa que el módulo existe para evitar: el usuario leería "5 para
 * tu nicho" y no habría ningún "tu nicho" detrás.
 *
 * Por eso la UI los marca como "Sugerido" a secas. Cuando haya historial
 * suficiente para derivar metas por vertical, este es el lugar que cambia.
 */
export const META_SEMANAL_SUGERIDA: Record<SocialNetwork, number> = {
  instagram: 5,
  facebook: 3,
  tiktok: 4,
  linkedin: 2,
  x: 5,
  youtube: 1,
  threads: 3,
};
