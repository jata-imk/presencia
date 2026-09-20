import { trendItemSchema, type TrendItem } from "@presencia/shared";

// Cómo una tendencia gana su fuente.
//
// La regla del producto es "fuente citada siempre" (presencia-ritmo.md §4), y
// el punto de este archivo es que deje de ser una instrucción de prompt.
//
// Un modelo al que se le pide "cita la fuente" cita una fuente. A veces la que
// leyó, a veces una plausible que no existe, y las dos se ven igual en la
// pantalla. Peor: el caso en que inventa es justamente cuando no encontró
// nada, que es cuando el usuario más necesita saberlo — el doc lo llama "el
// momento de tentación de meter humo".
//
// Acá el modelo NO escribe la URL. Escribe un ÍNDICE a la lista de páginas que
// la búsqueda de verdad visitó (`groundingChunks` del metadata del proveedor),
// y la URL y el título se copian de esa lista. Un índice que no apunta a nada
// no produce un item sin fuente: produce un item menos.
//
// El costo de esta decisión es real y se acepta: si el modelo resume bien pero
// se equivoca de índice, se pierde una tendencia buena. Perder señal es
// recuperable; publicar una fuente inventada, no.

/**
 * Una página que la búsqueda visitó de verdad.
 *
 * Dos cosas que hay que saber de lo que Google devuelve acá, verificadas
 * contra la API real el 2026-09-20:
 *
 * - **`uri` no es la URL de la página**, es un redirect de
 *   `vertexaisearch.cloud.google.com` que apunta a ella. Google pide que se
 *   usen sus ligas de grounding, así que se guarda tal cual.
 * - **Ese redirect caduca** (del orden de semanas). No es un problema mientras
 *   las tandas se refresquen cada 24 h, pero sí fija un piso: una fila que
 *   sobreviviera meses sin refrescarse tendría ligas muertas. Si algún día se
 *   guarda historial de tendencias, esto hay que resolverlo antes.
 * - **`title` sí es legible**: viene el dominio real ("mexicofollowers.mx"),
 *   que es lo que el usuario lee en "Visto en …". La cita que ve es cierta
 *   aunque la liga pase por Google.
 */
export interface FuenteCitada {
  uri: string;
  title: string;
}

/**
 * Un item tal como lo emite el modelo: sin URL, con un índice a las fuentes.
 *
 * `sourceIndex` es la única forma que tiene de señalar procedencia. No hay un
 * campo de URL que pueda llenar, ni siquiera por accidente.
 */
export interface TendenciaCruda {
  topic: string;
  signal: string;
  network: string;
  format: string;
  blurb: string;
  sourceIndex: number;
}

/**
 * Saca las páginas citadas del metadata del proveedor.
 *
 * Va defensivo a propósito: es la forma de un proveedor externo, no un
 * contrato nuestro, y cambia sin avisar. Lo que no se entienda se descarta —
 * quedarse sin fuentes hace que el refresco no escriba nada, que es el
 * resultado correcto. Un `as` optimista acá terminaría en URLs `undefined`
 * renderizadas como enlaces.
 */
export function extraerFuentes(providerMetadata: unknown): FuenteCitada[] {
  const google = leerObjeto(leerObjeto(providerMetadata)?.google);
  const grounding = leerObjeto(google?.groundingMetadata);
  const chunks = grounding?.groundingChunks;
  if (!Array.isArray(chunks)) return [];

  const fuentes: FuenteCitada[] = [];
  for (const chunk of chunks) {
    const web = leerObjeto(leerObjeto(chunk)?.web);
    const uri = typeof web?.uri === "string" ? web.uri : null;
    if (!web || !uri) continue;
    const title = typeof web.title === "string" && web.title.trim().length > 0 ? web.title : uri;
    fuentes.push({ uri, title });
  }
  return fuentes;
}

/**
 * Cruza lo que el modelo escribió con lo que la búsqueda leyó.
 *
 * Un item sobrevive solo si su índice apunta a una página real y si lo demás
 * pasa el schema. La URL y el título salen SIEMPRE de la fuente, nunca del
 * texto del modelo, aunque el modelo hubiera escrito una.
 *
 * También se descartan los temas repetidos: dos páginas distintas sobre lo
 * mismo son una sola tendencia, y verla dos veces en la pantalla se lee como
 * un bug.
 */
export function ensamblarTendencias(
  crudas: readonly TendenciaCruda[],
  fuentes: readonly FuenteCitada[],
): TrendItem[] {
  const vistos = new Set<string>();
  const items: TrendItem[] = [];

  for (const cruda of crudas) {
    const fuente = fuentes[cruda.sourceIndex];
    if (!fuente) continue;

    const clave = cruda.topic.trim().toLowerCase();
    if (clave.length === 0 || vistos.has(clave)) continue;

    const parsed = trendItemSchema.safeParse({
      topic: cruda.topic,
      signal: cruda.signal,
      network: cruda.network,
      format: cruda.format,
      blurb: cruda.blurb,
      sourceTitle: fuente.title,
      sourceUrl: fuente.uri,
    });
    // Una señal fuera del enum, una red que no manejamos o un blurb vacío
    // tiran el item entero. Se prefiere una tendencia menos a una tendencia a
    // medias: el estado vacío del módulo ya sabe decir que no encontramos nada.
    if (!parsed.success) continue;

    vistos.add(clave);
    items.push(parsed.data);
  }

  return items;
}

function leerObjeto(valor: unknown): Record<string, unknown> | null {
  return typeof valor === "object" && valor !== null ? (valor as Record<string, unknown>) : null;
}
