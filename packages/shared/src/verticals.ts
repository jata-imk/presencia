import { z } from "zod";
import { normalizeExpression } from "./text.js";

// El catálogo cerrado de verticales y macro-regiones.
//
// Existe por una razón de costo, no de taxonomía. Las tendencias de Ritmo se
// buscan y se cachean por la tupla `(vertical, país, región)` y NO por
// `user_id`: diez creators de "fitness en CDMX" comparten exactamente la misma
// búsqueda, así que cien usuarios repartidos en quince nichos pagan quince
// refrescos, no cien. Esa palanca solo funciona si el conjunto de llaves es
// cerrado y chico.
//
// `brand_voices.niche` es texto libre y lo seguirá siendo — es lo que hace que
// la voz suene a la persona. Pero ese texto NO entra a la llave ni al prompt de
// búsqueda: si entrara, cada usuario generaría su propia consulta, la caché
// dejaría de compartirse y nadie se enteraría, porque todo seguiría
// funcionando. Solo se encarecería, en silencio y para siempre.
//
// El nicho libre sirve para MAPEAR a una vertical; la vertical es lo que viaja.

export const VERTICAL_IDS = [
  "fitness",
  "food",
  "beauty",
  "fashion",
  "travel",
  "tech",
  "design",
  "marketing",
  "business",
  "finance",
  "education",
  "health",
  "real_estate",
  "arts",
  "entertainment",
  "parenting",
  "general",
] as const;

export type VerticalId = (typeof VERTICAL_IDS)[number];

export const verticalIdSchema = z.enum(VERTICAL_IDS);

/**
 * Lee una vertical guardada en la DB, donde la columna es `text` y no un enum.
 *
 * Un id que el catálogo ya no tiene —porque una vertical se fusionó o se
 * renombró— vuelve como `null`, que es "no la ha elegido": el usuario cae a la
 * derivación por nicho en vez de arrastrar una llave de caché que ya no existe.
 */
export function asVerticalId(value: string | null): VerticalId | null {
  const parsed = verticalIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Vertical de reserva.
 *
 * `general` existe para que nadie se quede sin tendencias por haber escrito su
 * nicho de una forma que el catálogo no reconoce. Devolver "ninguna" dejaría
 * una pantalla vacía cuyo motivo real sería un fallo de nuestro mapeo, y el
 * usuario leería "no hay tendencias en tu nicho" — una afirmación falsa sobre
 * su mercado en vez de una limitación nuestra.
 */
export const VERTICAL_FALLBACK: VerticalId = "general";

/**
 * Las palabras con las que se reconoce cada vertical en el nicho libre.
 *
 * Se comparan normalizadas (sin acentos, en minúsculas) y **por palabra
 * completa**, así que "repostería" encuentra a "reposteria" y "marketing
 * digital para pymes" encuentra a "marketing".
 *
 * Por palabra completa y no por subcadena, que es como nació: `ia` aparecía
 * dentro de "familia" y `ui` dentro de "cuidado", así que un nicho de
 * maternidad caía en tecnología y uno de skincare en diseño. Esos falsos
 * positivos no rompen nada visible — mandan al usuario a una caché de
 * tendencias que no es la suya y nadie se entera.
 *
 * Las claves de varias palabras sí se buscan como frase: "bienes raices" tiene
 * que aparecer junto.
 *
 * La lista es deliberadamente corta: son anclas para adivinar un default que
 * el usuario corrige con un click, no un clasificador.
 */
export const VERTICALS: ReadonlyArray<{
  id: VerticalId;
  label: string;
  keywords: readonly string[];
}> = [
  {
    id: "fitness",
    label: "Fitness y deporte",
    keywords: ["fitness", "gym", "gimnasio", "deporte", "entrenamiento", "crossfit", "yoga"],
  },
  {
    id: "food",
    label: "Comida y gastronomía",
    keywords: ["comida", "gastronomia", "cocina", "reposteria", "chef", "restaurante", "recetas"],
  },
  {
    id: "beauty",
    label: "Belleza y cuidado personal",
    keywords: ["belleza", "maquillaje", "skincare", "cosmetica", "manicure", "peinado", "barberia"],
  },
  {
    id: "fashion",
    label: "Moda y estilo",
    keywords: ["moda", "estilo", "ropa", "outfit", "fashion", "joyeria", "accesorios"],
  },
  {
    id: "travel",
    label: "Viajes y turismo",
    keywords: ["viaje", "turismo", "travel", "hotel", "destino", "aventura", "ecoturismo"],
  },
  {
    id: "tech",
    label: "Tecnología e IA",
    keywords: ["tecnologia", "tech", "software", "programacion", "ia", "inteligencia artificial"],
  },
  {
    id: "design",
    label: "Diseño y creatividad",
    keywords: ["diseno", "design", "ux", "ui", "grafico", "ilustracion", "branding"],
  },
  {
    id: "marketing",
    label: "Marketing y redes",
    keywords: ["marketing", "publicidad", "redes sociales", "community", "seo", "copywriting"],
  },
  {
    id: "business",
    label: "Negocios y emprendimiento",
    keywords: ["negocio", "emprendimiento", "startup", "ventas", "pyme", "consultoria"],
  },
  {
    id: "finance",
    label: "Finanzas e inversión",
    keywords: ["finanzas", "inversion", "dinero", "ahorro", "bolsa", "cripto", "contabilidad"],
  },
  {
    id: "education",
    label: "Educación y cursos",
    keywords: ["educacion", "cursos", "maestro", "docente", "idiomas", "tutoria", "escuela"],
  },
  {
    id: "health",
    label: "Salud y bienestar",
    keywords: [
      "salud",
      "bienestar",
      "nutricion",
      "psicologia",
      "medicina",
      "terapia",
      "mindfulness",
    ],
  },
  {
    id: "real_estate",
    label: "Bienes raíces",
    keywords: ["bienes raices", "inmobiliaria", "inmuebles", "casas", "departamentos", "renta"],
  },
  {
    id: "arts",
    label: "Arte y artesanía",
    keywords: ["arte", "artesania", "pintura", "fotografia", "musica", "escultura", "bordado"],
  },
  {
    id: "entertainment",
    label: "Entretenimiento",
    keywords: ["entretenimiento", "humor", "comedia", "gaming", "streaming", "cine", "podcast"],
  },
  {
    id: "parenting",
    label: "Maternidad y familia",
    keywords: ["maternidad", "paternidad", "familia", "bebes", "crianza", "hijos"],
  },
  {
    id: "general",
    label: "General",
    keywords: [],
  },
];

export const MACRO_REGION_IDS = [
  "noroeste",
  "norte",
  "occidente",
  "bajio",
  "centro",
  "cdmx",
  "sur",
  "sureste",
  "nacional",
] as const;

export type MacroRegionId = (typeof MACRO_REGION_IDS)[number];

export const macroRegionIdSchema = z.enum(MACRO_REGION_IDS);

/**
 * Las macro-regiones de México, con los estados que las reconocen.
 *
 * La granularidad se detiene acá a propósito: el doc de producto manda las
 * tendencias a nivel ciudad a V2, y bajar a ciudad multiplicaría las llaves de
 * caché por un factor que se come entera la palanca de sublinealidad. Al mismo
 * tiempo, la región tiene que existir: el diferenciador del producto es la
 * profundidad cultural, y lo que se mueve en Mérida no es lo que se mueve en
 * Monterrey.
 */
export const MACRO_REGIONS: ReadonlyArray<{
  id: MacroRegionId;
  label: string;
  keywords: readonly string[];
}> = [
  {
    id: "sureste",
    label: "Sureste",
    keywords: [
      "sureste",
      "yucatan",
      "merida",
      "quintana roo",
      "cancun",
      "playa del carmen",
      "tulum",
      "campeche",
      "tabasco",
      "villahermosa",
      "veracruz",
      "xalapa",
    ],
  },
  {
    id: "sur",
    label: "Sur",
    keywords: ["sur", "oaxaca", "chiapas", "guerrero", "acapulco", "tuxtla"],
  },
  {
    id: "cdmx",
    label: "Ciudad de México",
    keywords: ["cdmx", "ciudad de mexico", "df", "distrito federal"],
  },
  {
    id: "centro",
    label: "Centro",
    keywords: [
      "centro",
      "puebla",
      "morelos",
      "cuernavaca",
      "tlaxcala",
      "hidalgo",
      "pachuca",
      "estado de mexico",
      "edomex",
      "toluca",
    ],
  },
  {
    id: "bajio",
    label: "Bajío",
    keywords: [
      "bajio",
      "guanajuato",
      "leon",
      "queretaro",
      "aguascalientes",
      "san luis potosi",
      "zacatecas",
    ],
  },
  {
    id: "occidente",
    label: "Occidente",
    keywords: ["occidente", "jalisco", "guadalajara", "michoacan", "morelia", "colima", "nayarit"],
  },
  {
    id: "norte",
    label: "Norte",
    keywords: ["norte", "nuevo leon", "monterrey", "coahuila", "saltillo", "tamaulipas", "tampico"],
  },
  {
    id: "noroeste",
    label: "Noroeste",
    keywords: [
      "noroeste",
      "sonora",
      "hermosillo",
      "sinaloa",
      "culiacan",
      "baja california",
      "tijuana",
      "mexicali",
      "la paz",
      "chihuahua",
      "ciudad juarez",
      "durango",
    ],
  },
  {
    id: "nacional",
    label: "Nacional",
    keywords: [],
  },
];

/**
 * La vertical que mejor explica el nicho libre, o `null` si ninguna aplica.
 *
 * Gana la que más términos reconoce; los empates los rompe el orden del
 * catálogo, que es arbitrario pero **estable** — el mismo nicho tiene que dar
 * siempre la misma vertical, porque de ella cuelga una fila de caché
 * compartida. Un desempate que variara entre llamadas partiría la caché en dos
 * sin que nada fallara.
 */
export function verticalDeNicho(niche: readonly string[]): VerticalId | null {
  const terminos = niche.map(normalizeExpression).filter((termino) => termino.length > 0);
  if (terminos.length === 0) return null;

  let mejor: { id: VerticalId; aciertos: number } | null = null;
  for (const vertical of VERTICALS) {
    if (vertical.keywords.length === 0) continue;
    const aciertos = vertical.keywords.filter((palabra) =>
      terminos.some((termino) => reconoce(termino, palabra)),
    ).length;
    if (aciertos > 0 && (!mejor || aciertos > mejor.aciertos)) {
      mejor = { id: vertical.id, aciertos };
    }
  }
  return mejor?.id ?? null;
}

/** Separa por todo lo que no sea letra o dígito: guiones, comas, emojis. */
const SEPARADORES = /[^\p{L}\p{N}]+/u;

function reconoce(termino: string, palabra: string): boolean {
  if (palabra.includes(" ")) return termino.includes(palabra);
  return termino.split(SEPARADORES).includes(palabra);
}

/**
 * La vertical con la que se va a buscar: la que el usuario eligió, si eligió;
 * si no, la adivinada desde su nicho; si tampoco, `general`.
 *
 * Es UNA función y la usan los dos lados —el servidor para armar la llave y la
 * UI para decirle al usuario qué está pasando— porque si cada uno resolviera
 * por su cuenta, la pantalla podría mostrar una vertical y la caché usar otra.
 */
export function resolveVertical(elegida: VerticalId | null, niche: readonly string[]): VerticalId {
  return elegida ?? verticalDeNicho(niche) ?? VERTICAL_FALLBACK;
}

/**
 * Las formas en que alguien escribe "México" en un campo de texto libre.
 *
 * El país es un input abierto, así que "México", "Mexico" y "MX" son todas
 * respuestas correctas de un usuario. Comparar contra el literal `"mx"` dejaba
 * a quien escribiera el nombre del país —lo natural en una app en español— con
 * `nacional` para siempre: perdía la mitad regional de la llave sin un solo
 * error en pantalla.
 */
const NOMBRES_DE_MEXICO = new Set(["mx", "mex", "mexico", "estados unidos mexicanos"]);

function esMexico(marketCountry: string): boolean {
  return NOMBRES_DE_MEXICO.has(normalizeExpression(marketCountry));
}

/**
 * La macro-región de un texto libre de región.
 *
 * Fuera de México siempre es `nacional`: las macro-regiones de abajo son
 * mexicanas, y aplicarlas a otro país produciría una llave con cara de válida
 * y sin ningún significado.
 */
export function resolveMacroRegion(
  marketCountry: string,
  marketRegion: string | null,
): MacroRegionId {
  if (!esMexico(marketCountry)) return "nacional";
  if (!marketRegion) return "nacional";
  const texto = normalizeExpression(marketRegion);
  if (texto.length === 0) return "nacional";

  // Gana la clave MÁS LARGA que aplique, no la primera de la lista. Con el
  // orden de la lista mandando, "Nuevo León" caía en Bajío —porque `leon` se
  // probaba antes que `nuevo leon`— y "Baja California Sur" caía en Sur. Dos
  // de los mercados más grandes del país en la caché equivocada, y sin forma
  // de notarlo: la región no da error, solo trae las tendencias de otra parte.
  let mejor: { id: MacroRegionId; largo: number } | null = null;
  for (const region of MACRO_REGIONS) {
    for (const palabra of region.keywords) {
      if (!reconoce(texto, palabra)) continue;
      if (!mejor || palabra.length > mejor.largo) mejor = { id: region.id, largo: palabra.length };
    }
  }
  return mejor?.id ?? "nacional";
}

export function verticalLabel(id: VerticalId): string {
  return VERTICALS.find((vertical) => vertical.id === id)?.label ?? id;
}

export function macroRegionLabel(id: MacroRegionId): string {
  return MACRO_REGIONS.find((region) => region.id === id)?.label ?? id;
}
