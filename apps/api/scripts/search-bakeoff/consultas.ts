// Las consultas del bake-off de búsqueda (F10.10). Escritas como las haría
// el chat por un creator del sureste: lo que el modelo no sabe de memoria
// (precios y horarios de hoy, noticias de esta semana, negocios locales) y lo
// que un creator de marketing pregunta en México. Cuatro grupos de cuatro,
// más un post de nicho (el blog de Jose) para ver si llega a los sitios chicos.
//
// `mirar` es lo que distingue un buen resultado al calificar: no es la
// respuesta correcta (cambia), es de dónde debería salir.

export type Grupo = "precios" | "lugares" | "noticias" | "marketing" | "nicho";

export interface Consulta {
  id: string;
  grupo: Grupo;
  consulta: string;
  mirar: string;
}

export const CONSULTAS: Consulta[] = [
  {
    id: "precio-tortilla",
    grupo: "precios",
    consulta: "precio del kilo de tortilla en Mérida hoy",
    mirar:
      "Una nota local reciente (Diario de Yucatán, Por Esto, La Jornada Maya, Profeco) con el precio y la fecha.",
  },
  {
    id: "entrada-chichen",
    grupo: "precios",
    consulta: "cuánto cuesta la entrada a Chichén Itzá 2026",
    mirar: "El precio vigente con el cobro del INAH y el del estado separados; no un blog de 2023.",
  },
  {
    id: "gasolina-merida",
    grupo: "precios",
    consulta: "precio de la gasolina magna en Mérida esta semana",
    mirar: "Una fuente con fecha de esta semana (CRE, Profeco, medio local).",
  },
  {
    id: "tren-maya-cancun",
    grupo: "precios",
    consulta: "costo del boleto del Tren Maya de Mérida a Cancún",
    mirar: "El sitio oficial del Tren Maya o una nota con la tarifa actual por clase.",
  },
  {
    id: "horario-museo-maya",
    grupo: "lugares",
    consulta: "horario del Gran Museo del Mundo Maya de Mérida",
    mirar: "El sitio del museo o Google/Maps con horario y día de descanso.",
  },
  {
    id: "cafe-especialidad",
    grupo: "lugares",
    consulta: "cafeterías de especialidad en el centro de Mérida",
    mirar: "Listas locales o guías recientes con nombres reales de cafés del centro; no cadenas.",
  },
  {
    id: "marquesitas",
    grupo: "lugares",
    consulta: "dónde comer las mejores marquesitas en Mérida",
    mirar: "Lugares concretos (Santa Lucía, Paseo de Montejo, Itzimná); fuentes locales o guías.",
  },
  {
    id: "henequen-artesanal",
    grupo: "lugares",
    consulta: "dónde comprar artesanías de henequén en Yucatán",
    mirar: "Cooperativas, mercados o tiendas con nombre y lugar; no tiendas en línea genéricas.",
  },
  {
    id: "noticias-merida",
    grupo: "noticias",
    consulta: "noticias de Mérida Yucatán hoy",
    mirar: "Notas de hoy o ayer de medios yucatecos; la fecha importa más que el medio.",
  },
  {
    id: "noche-blanca",
    grupo: "noticias",
    consulta: "Noche Blanca Mérida 2026 fecha y actividades",
    mirar: "El anuncio del Ayuntamiento o una nota con la fecha de la edición 2026.",
  },
  {
    id: "hanal-pixan",
    grupo: "noticias",
    consulta: "actividades de Hanal Pixán 2026 en Mérida",
    mirar: "Programa de este año (Ayuntamiento, Sedeculta, medios locales), no el de años pasados.",
  },
  {
    id: "ficmaya",
    grupo: "noticias",
    consulta: "Festival Internacional de la Cultura Maya 2026 programa",
    mirar: "El sitio del FIC Maya o notas con la edición 2026.",
  },
  {
    id: "tendencias-instagram",
    grupo: "marketing",
    consulta: "tendencias de Instagram para negocios en México 2026",
    mirar: "Fuentes en español con datos de México (no traducciones de blogs de EE. UU.).",
  },
  {
    id: "tarifa-community",
    grupo: "marketing",
    consulta: "cuánto cobra un community manager en México 2026",
    mirar: "Rangos en pesos con fuente (bolsas de trabajo, encuestas, agencias mexicanas).",
  },
  {
    id: "tiktok-shop",
    grupo: "marketing",
    consulta: "TikTok Shop en México cómo vender",
    mirar: "El centro de vendedores de TikTok o notas mexicanas recientes sobre el lanzamiento.",
  },
  {
    id: "linkedin-mexico",
    grupo: "marketing",
    consulta: "cuántos usuarios tiene LinkedIn en México 2026",
    mirar: "Una cifra con fuente y fecha (DataReportal, IAB México, LinkedIn).",
  },
  {
    // Pedido de Jose (2026-10-27): un post de nicho, en español y reciente, de
    // un blog chico. Mide si el buscador llega más allá de los sitios grandes.
    id: "blog-openclaw-video",
    grupo: "nicho",
    consulta: "generar video con IA desde OpenClaw",
    mirar:
      "El post de josetejero.com (/blog/generar-video-con-ia-desde-openclaw) arriba; si no, la documentación de OpenClaw sobre video.",
  },
];
