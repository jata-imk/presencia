import { z } from "zod";

// F10.6: el estilo visual con que Presencia genera imágenes. Una sola fuente
// para las tres partes que lo usan: la galería de Configuración (nombre,
// descripción, "funciona bien para"), el chip del panel y la API, que manda
// `prompt` al generador en lugar del estilo por defecto.
//
// El chat NO elige estilo: describe qué dibujar (sujeto, escena, composición)
// y el estilo sale de aquí — el de la Voz de marca, o el que el usuario eligió
// para esa imagen. Si en la conversación pide uno explícito ("estilo
// acuarela"), su descripción manda sobre este (ver image-prompt.ts).
//
// Los ejemplos de la galería son imágenes fijas, generadas una vez con estos
// mismos textos (scripts/image-bakeoff, `--estilos`): si un texto cambia, se
// regeneran, o la galería mostraría algo que el generador ya no hace.

export const IMAGE_STYLE_IDS = [
  "foto",
  "ilus",
  "mini",
  "neo",
  "bento",
  "glass",
  "material",
  // "3d" estuvo en el diseño y se sacó de V1 (2026-09-30): con Gemini Flash
  // las escenas de comida o de lugar salían como foto en 3 intentos de texto,
  // y hasta con texto dentro. Vuelve cuando un generador lo entregue: la
  // galería no puede prometer lo que no sale. Un "3d" guardado se lee como null.
] as const;
export const imageStyleSchema = z.enum(IMAGE_STYLE_IDS);
export type ImageStyle = z.infer<typeof imageStyleSchema>;

/** El estilo de quien nunca eligió uno. */
export const DEFAULT_IMAGE_STYLE_ID: ImageStyle = "foto";

export interface ImageStyleDef {
  id: ImageStyle;
  name: string;
  /** Una línea: cómo se ve. */
  desc: string;
  /** Completa "Funciona bien para…". */
  goodFor: string;
  /** Lo que se le pide al generador. Sin "sin texto ni logos": eso va aparte. */
  prompt: string;
}

export const IMAGE_STYLES: readonly ImageStyleDef[] = [
  {
    id: "foto",
    name: "Fotográfico natural",
    desc: "Luz real y texturas reales. Parece tomada con tu cámara.",
    goodFor: "comida, lifestyle y detrás de cámaras.",
    prompt:
      "Fotografía natural y realista, con luz cálida y texturas reales, ambientada en México. Que parezca tomada con cámara, no generada.",
  },
  {
    id: "ilus",
    name: "Ilustración",
    desc: "Trazo dibujado, color plano y mucha personalidad.",
    goodFor: "tips, explicaciones y contenido educativo.",
    prompt:
      "Ilustración digital de trazo dibujado a mano, colores planos y cálidos, formas simples con mucha personalidad. Nada fotográfico.",
  },
  {
    id: "mini",
    name: "Minimalista",
    desc: "Pocos elementos, mucho aire y una sola idea al centro.",
    goodFor: "frases, anuncios y marcas premium.",
    prompt:
      "Composición minimalista: un solo elemento protagonista al centro, fondo liso de un color suave, mucho espacio vacío y una paleta de dos o tres tonos. Si la escena menciona un lugar, sugiérelo con uno o dos detalles, sin llenar el cuadro.",
  },
  {
    id: "neo",
    name: "Neobrutalismo",
    desc: "Bordes gruesos, colores planos y sombras duras.",
    goodFor: "promos y lanzamientos que deben frenar el scroll.",
    prompt:
      "Estilo neobrutalista: formas con contorno negro grueso, colores planos saturados (amarillo, rosa, azul), sombras duras desplazadas sin difuminar y fondo liso.",
  },
  {
    id: "bento",
    name: "Bento grid",
    desc: "Bloques en cuadrícula, cada uno con una idea o un dato.",
    goodFor: "resúmenes, comparativas y carruseles con datos.",
    prompt:
      "Composición tipo bento grid: la escena dividida en bloques rectangulares de distintos tamaños con esquinas redondeadas, cada bloque con un elemento distinto, colores pastel y separaciones limpias.",
  },
  {
    id: "glass",
    name: "Glassmorfismo",
    desc: "Capas translúcidas y desenfocadas sobre fondos de color.",
    goodFor: "tecnología, apps y producto digital.",
    prompt:
      "Estilo glassmorfismo: paneles translúcidos de vidrio esmerilado con desenfoque, bordes con brillo sutil, sobre un fondo de degradados de color vivos.",
  },
  {
    id: "material",
    name: "Material",
    desc: "Superficies limpias, sombras suaves y jerarquía clara.",
    goodFor: "tutoriales, interfaces y contenido de servicio.",
    prompt:
      "Ilustración vectorial plana estilo Material Design: superficies limpias en capas, sombras suaves de elevación, esquinas redondeadas y colores sólidos con jerarquía clara. Nada fotográfico.",
  },
];

export function imageStyleDef(id: ImageStyle | null | undefined): ImageStyleDef {
  return IMAGE_STYLES.find((s) => s.id === id) ?? IMAGE_STYLES[0]!;
}
