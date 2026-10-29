// F10.10: partes de mensaje de leer y buscar en la web, como las guarda la
// API, para las historias (Chat Web.html). Los dominios y textos son los del
// diseño: precios del café en Mérida.

type Estado = "ok" | "requiere_sesion" | "no_encontrada" | "no_legible" | "limite";

export interface Pagina {
  url: string;
  titulo: string;
  fecha?: string;
  fragmento?: string;
}

export const PAGINAS = {
  dy: {
    url: "https://www.diariodeyucatan.com/merida/2026/10/24/sube-precio-cafe",
    titulo: "Sube el precio del café en Mérida: así están las tazas en el Centro",
    fecha: "hace 2 días",
    fragmento:
      "Un americano en cafeterías del Centro ya ronda entre 45 y 60 pesos; los métodos de especialidad superan los 70.",
  },
  pe: {
    url: "https://www.poresto.com/yucatan/2026/10/24/cafeterias-de-especialidad-merida",
    titulo: "Cafeterías de especialidad en Mérida: la guía de 2026",
  },
  md: {
    url: "https://www.mexicodesconocido.com.mx/ruta-del-cafe-yucatan.html",
    titulo: "Ruta del café en Yucatán: 10 lugares para conocer",
    fecha: "8 sep 2026",
    fragmento: "De Santa Ana a García Ginerés, estas cafeterías tuestan su propio grano.",
  },
  lv: {
    url: "https://laverdadnoticias.com/yucatan/consumo-cafe-sureste",
    titulo: "Así cambió el consumo de café en el sureste",
    fecha: "hace 5 días",
  },
  yu: {
    url: "https://www.yucatan.com.mx/merida/cafeterias-independientes",
    titulo: "Cafeterías independientes resisten la llegada de cadenas",
    fecha: "20 oct 2026",
  },
} satisfies Record<string, Pagina>;

const dominio = (url: string) => new URL(url).hostname.replace(/^www\./, "");

/** Una búsqueda terminada, con sus resultados. */
export function busqueda(consulta: string, paginas: Pagina[]) {
  return {
    type: "tool-buscar_en_web",
    toolCallId: `buscar-${consulta}`,
    state: "output-available",
    input: { consulta },
    output: {
      searchId: `s-${consulta}`,
      consulta,
      estado: "ok",
      resultados: paginas.map((p) => ({
        titulo: p.titulo,
        url: p.url,
        dominio: dominio(p.url),
        fragmento: p.fragmento ?? "",
        fecha: p.fecha ?? null,
      })),
    },
  };
}

/** Una búsqueda que todavía corre. */
export function buscando(consulta: string) {
  return {
    type: "tool-buscar_en_web",
    toolCallId: `buscar-${consulta}`,
    state: "input-available",
    input: { consulta },
  };
}

/** Una página leída, en el estado que se pida. */
export function lectura(
  url: string,
  {
    estado = "ok",
    titulo,
    truncado = false,
    soloDescripcion = false,
  }: { estado?: Estado; titulo?: string; truncado?: boolean; soloDescripcion?: boolean } = {},
) {
  return {
    type: "tool-leer_enlace",
    toolCallId: `leer-${url}`,
    state: "output-available",
    input: { url },
    output: {
      readId: estado === "limite" ? null : `r-${url}`,
      url,
      urlFinal: estado === "ok" ? url : null,
      titulo: estado === "ok" ? (titulo ?? null) : null,
      dominio: dominio(url),
      estado,
      truncado,
      soloDescripcion,
    },
  };
}

/** Una lectura que todavía corre. */
export function leyendo(url: string) {
  return {
    type: "tool-leer_enlace",
    toolCallId: `leer-${url}`,
    state: "input-available",
    input: { url },
  };
}

/** El texto de la respuesta, con las citas en línea como las escribe el modelo. */
export function texto(text: string, state: "done" | "streaming" = "done") {
  return { type: "text", text, state };
}

export const RESPUESTA_CAFE = texto(
  `Según lo que encontré, un americano en cafeterías del Centro de Mérida anda entre 45 y 60 pesos, y un latte de especialidad entre 65 y 85 ([Diario de Yucatán](${PAGINAS.dy.url})). Las de tueste propio, en Santa Ana y García Ginerés, suelen quedar en la parte alta del rango ([Por Esto!](${PAGINAS.pe.url})).\n\n¿Te armo un carrusel comparando 4 cafeterías?`,
);
