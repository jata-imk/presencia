import type { BrandVoiceRegister, SocialNetwork } from "@presencia/shared";
import { NETWORK_LABELS } from "./network-labels.js";

// Lo puro del onboarding (F12.5, Claude Design "Onboarding v2"): catálogos,
// cómo se arma lo que se guarda y el texto con el que arranca el chat. Sin
// React, para probarlo sin montar los pasos.

export const PAISES = [
  "México",
  "Colombia",
  "Argentina",
  "Chile",
  "Perú",
  "España",
  "Estados Unidos",
  "Otro",
] as const;

/** Las zonas que el diseño ofrece como chips. Cada una es keyword de `resolveMacroRegion`. */
export const ZONAS = ["Norte", "Bajío", "Occidente", "Centro", "Sureste"] as const;
export const TODA_LA_REPUBLICA = "Toda la república";

export const NICHOS = [
  "Emprendimiento",
  "Fitness",
  "Comida",
  "Belleza",
  "Gaming",
  "Educación",
  "Lifestyle",
  "Negocio local",
] as const;

export const REGISTROS: ReadonlyArray<{
  id: BrandVoiceRegister;
  label: string;
  ejemplo: string;
}> = [
  {
    id: "de_barrio",
    label: "De barrio",
    ejemplo: "«¿Qué onda, banda? Hoy les traigo algo bien chido.»",
  },
  { id: "informal", label: "Casual", ejemplo: "«Oigan, esto me cambió la semana.»" },
  {
    id: "neutro_profesional",
    label: "Neutro-profesional",
    ejemplo: "«Te comparto tres ideas para empezar hoy.»",
  },
  {
    id: "profesional",
    label: "Profesional",
    ejemplo: "«Estas son las claves para fortalecer tu estrategia.»",
  },
  {
    id: "tecnico",
    label: "Técnico",
    ejemplo: "«El problema no es el alcance, es la retención en los primeros segundos.»",
  },
];

/**
 * Las metas, en las palabras que se guardan en `extras.goals`: de ahí se
 * deriva el Modo (`modoDeGoals`), así que "Crecer audiencia" y "Monetizar"
 * cuentan como crecer.
 */
export const METAS = [
  { id: "crecer", label: "Crecer audiencia", descripcion: "Más seguidores y alcance" },
  { id: "monetizar", label: "Monetizar", descripcion: "Generar ingresos con tu contenido" },
  { id: "consistencia", label: "Mantener consistencia", descripcion: "Publica sin quemarte" },
  { id: "tiempo", label: "Ahorrar tiempo", descripcion: "Haz más en menos horas" },
] as const;
export type MetaId = (typeof METAS)[number]["id"];

/** Lo que el creator va contestando. Vive en la ruta; los pasos lo leen y lo cambian. */
export interface DatosOnboarding {
  pais: string;
  /** Solo en México; `null` = no eligió zona. */
  zona: string | null;
  ciudad: string;
  nichos: string[];
  conOtroNicho: boolean;
  otroNicho: string;
  registro: BrandVoiceRegister;
  muestras: string[];
  nunca: string;
  metas: MetaId[];
}

export const DATOS_INICIALES: DatosOnboarding = {
  pais: "México",
  zona: null,
  ciudad: "",
  nichos: [],
  conOtroNicho: false,
  otroNicho: "",
  registro: "neutro_profesional",
  muestras: [""],
  nunca: "",
  metas: [],
};

/** El nicho que se guarda: los chips más el "Otro" escrito, sin repetidos. */
export function nichosAGuardar(datos: DatosOnboarding): string[] {
  const otro = datos.conOtroNicho ? datos.otroNicho.trim() : "";
  return [...new Set([...datos.nichos, ...(otro ? [otro.slice(0, 40)] : [])])];
}

/** "México" se guarda como "MX", como siempre; los demás países, con su nombre. */
export function paisAGuardar(pais: string): string {
  return pais === "México" ? "MX" : pais;
}

/**
 * La región en texto libre que se guarda en `market_region`: la ciudad o el
 * estado, y la zona si eligió una. Las dos juntas para que `resolveMacroRegion`
 * encuentre la macro-región aunque la ciudad sea un pueblo que no reconoce
 * ("Tekax, Sureste"). `undefined` si no dijo nada.
 *
 * Si la ciudad está en el catálogo, ella decide y la zona no la pisa
 * ("CDMX, Centro" es CDMX): lo resuelve `resolveMacroRegion`, que da
 * prioridad a un lugar sobre un nombre de zona.
 */
export function regionAGuardar(ciudad: string, zona: string | null): string | undefined {
  const partes = [ciudad.trim(), zona && zona !== TODA_LA_REPUBLICA ? zona : ""].filter(Boolean);
  return partes.length > 0 ? partes.join(", ") : undefined;
}

/** Lo mismo que pide la API (`destilarVozBodySchema`): de una publicación así, no sale ningún rasgo. */
export const MINIMO_POR_MUESTRA = 20;

/** Las publicaciones que sí se mandan a destilar: sin vacías. */
export function muestrasUtiles(muestras: readonly string[]): string[] {
  return muestras.map((m) => m.trim()).filter((m) => m.length > 0);
}

/** La primera publicación que se quedó corta, para avisarle cuál, o `null`. */
export function muestraCorta(muestras: readonly string[]): number | null {
  const indice = muestras.findIndex((m) => {
    const largo = m.trim().length;
    return largo > 0 && largo < MINIMO_POR_MUESTRA;
  });
  return indice === -1 ? null : indice;
}

/**
 * Lo que el creator dijo que nunca diría, como rasgo de «Así escribes». Solo se
 * usa sin muestras: con muestras, la destilación ya lo convierte en su rasgo
 * «Nunca: …» y en modismos prohibidos.
 */
export function rasgoNunca(nunca: string): string | null {
  const texto = nunca.trim();
  if (!texto) return null;
  const rasgo = `Nunca: ${texto}`;
  return rasgo.length <= 140 ? rasgo : `${rasgo.slice(0, 139)}…`;
}

/**
 * El texto con el que arranca su primer chat: el borrador que aprobó, para
 * dejarlo listo. Va al composer SIN mandarse (`state.propuesta`), igual que
 * las propuestas de Ritmo: generar es decisión del creator.
 */
export function propuestaDePrimerPost(post: string | null, red: SocialNetwork | null): string {
  const donde = red ? NETWORK_LABELS[red] : "Instagram";
  if (post?.trim()) {
    return `Quiero publicar esto en ${donde}. Déjalo listo como borrador:\n\n${post.trim()}`;
  }
  return `Quiero crear mi primera publicación para ${donde}. ¿Qué me recomiendas?`;
}
