import {
  APICallError,
  embed,
  generateImage,
  generateText,
  NoImageGeneratedError,
  NoTranscriptGeneratedError,
  RetryError,
  transcribe,
} from "ai";
import { statusOf } from "../ai/fallback.js";
import { costOf } from "../ai/model-prices.js";
import {
  createEmbeddingModelResolver,
  createImageModelResolver,
  createModelResolver,
  createTranscriptionModelResolver,
  DEFAULT_EMBEDDING_MODEL_ID,
  DEFAULT_MODEL_ID,
  DEFAULT_TRANSCRIPTION_CHAIN,
  DEFAULT_TRENDS_MODEL_ID,
  MODEL_TIER_ENV_VARS,
  formatModelEntry,
  parseModelChain,
  parseModelId,
  type EnvSource,
} from "../ai/provider-registry.js";
import { embeddingOptions } from "../chat/memory.js";
import { braveRequest } from "../web/search-provider.js";
import { imageCallOptions, imageGeneratorIds } from "../images/image-models.js";
import type { Observacion } from "./alert-state.js";
import { esErrorDeSaldo } from "./chequeos.js";

// La prueba activa diaria (F12.8 PR4, ADR-031): una llamada mínima a cada
// eslabón de cada cadena, directo y SIN pasar por el respaldo. Es la única
// forma de saber que el último eslabón (Sonnet en el chat) tiene saldo sin
// esperar a que se caigan los de arriba.
//
// No entra al ledger ni a `ai_usage_events` (decisión de Jose, 2026-11-06): no
// es de ningún usuario. El costo estimado queda en el log del job.

/** Debajo de esto, la cuota mensual de Brave se avisa antes de acabarse. */
export const BRAVE_MIN_RESTANTE = 100;

const TIMEOUT_MS = { texto: 60_000, imagen: 120_000, otro: 30_000 } as const;

export type TipoDeSonda = "texto" | "embeddings" | "transcripción" | "búsqueda" | "imagen";

export interface Sonda {
  key: string;
  id: string;
  tipo: TipoDeSonda;
  correr: (signal: AbortSignal) => Promise<Medicion>;
}

/** Lo que salió bien: una nota para el log y, si se pudo calcular, el costo. */
export interface Medicion {
  nota?: string;
  costo?: number | null;
  /** Salió, pero hay algo que avisar (la cuota de Brave por acabarse). */
  aviso?: string;
}

export interface ResultadoSonda {
  key: string;
  id: string;
  tipo: TipoDeSonda;
  ms: number;
  medicion?: Medicion;
  error?: unknown;
}

/**
 * Las sondas que tocan con el entorno de este proceso. Cada `proveedor:modelo`
 * una sola vez aunque esté en varias cadenas: lo que se prueba es la cuenta y
 * el modelo, no la cadena. Lo que esté en `fake` no se prueba.
 */
export function sondasDelEntorno(source: EnvSource, opciones: { imagenes: boolean }): Sonda[] {
  const sondas: Sonda[] = [];
  const vistos = new Set<string>();
  const agregar = (sonda: Sonda) => {
    if (vistos.has(sonda.key)) return;
    vistos.add(sonda.key);
    sondas.push(sonda);
  };

  // Texto: los tres tiers (con la red de AI_MODEL) y tendencias.
  const resolverTexto = createModelResolver(source, DEFAULT_MODEL_ID);
  const cadenasDeTexto = [
    ...MODEL_TIER_ENV_VARS.map((v) => source[v] ?? source.AI_MODEL ?? DEFAULT_MODEL_ID),
    source.AI_MODEL_TRENDS ?? DEFAULT_TRENDS_MODEL_ID,
  ];
  for (const cadena of cadenasDeTexto) {
    for (const entrada of parseModelChain(cadena)) {
      const { id, provider, model } = entrada;
      agregar({
        key: `probe:${id}`,
        id,
        tipo: "texto",
        // Con el esfuerzo con que lo usa la cadena (la primera que lo nombra):
        // forzar otro probaría una combinación que producción no usa, y un
        // proveedor que la rechaza daría una falsa alarma diaria. El techo es
        // holgado para que el razonamiento no lo agote; la respuesta es "ok".
        correr: async (signal) => {
          const r = await generateText({
            model: resolverTexto(formatModelEntry(entrada)),
            prompt: "Contesta solo con la palabra: ok",
            maxOutputTokens: 2048,
            maxRetries: 1,
            abortSignal: signal,
          });
          return {
            nota: `${String(r.usage.inputTokens ?? 0)} in / ${String(r.usage.outputTokens ?? 0)} out`,
            costo: costOf({
              provider,
              model,
              inputTokens: r.usage.inputTokens ?? 0,
              outputTokens: r.usage.outputTokens ?? 0,
            }),
          };
        },
      });
    }
  }

  // Embeddings: un solo modelo, sin cadena.
  const embeddingId = source.AI_MODEL_EMBEDDING ?? DEFAULT_EMBEDDING_MODEL_ID;
  const resolverEmbedding = createEmbeddingModelResolver(source);
  agregar({
    key: `probe:${embeddingId}`,
    id: embeddingId,
    tipo: "embeddings",
    correr: async (signal) => {
      const { provider } = parseModelId(embeddingId);
      await embed({
        model: resolverEmbedding(embeddingId),
        value: "hola",
        providerOptions: embeddingOptions(provider, "query"),
        maxRetries: 1,
        abortSignal: signal,
      });
      return {};
    },
  });

  // Transcripción: solo con el bot prendido (sin Telegram nadie transcribe).
  if (source.TELEGRAM_BOT_TOKEN) {
    const resolverTranscripcion = createTranscriptionModelResolver(source);
    for (const { id } of parseModelChain(
      source.AI_MODEL_TRANSCRIBE ?? DEFAULT_TRANSCRIPTION_CHAIN,
    )) {
      agregar({
        key: `probe:${id}`,
        id,
        tipo: "transcripción",
        correr: async (signal) => {
          try {
            await transcribe({
              model: resolverTranscripcion(id),
              audio: silencioWav(1),
              maxRetries: 1,
              abortSignal: signal,
            });
          } catch (error) {
            // Silencio = transcripción vacía, y el SDK la convierte en este
            // error. Pero llegar aquí quiere decir que el proveedor contestó
            // 200: la cuenta y el modelo están bien, que es lo que se prueba.
            if (!NoTranscriptGeneratedError.isInstance(error)) throw error;
            return { nota: "contestó (silencio, sin texto)" };
          }
          return {};
        },
      });
    }
  }

  // Búsqueda: una consulta, y lo que queda del mes en el header.
  if (source.WEB_SEARCH_PROVIDER === "brave" && source.BRAVE_SEARCH_API_KEY) {
    const llave = source.BRAVE_SEARCH_API_KEY;
    agregar({
      key: "probe:brave",
      id: "brave:web-search",
      tipo: "búsqueda",
      correr: (signal) => sondaBrave(llave, signal),
    });
  }

  // Imágenes: solo cuando toca (lunes), porque son lo caro. El saldo de esas
  // cuentas ya lo prueba el texto del mismo proveedor a diario; lo semanal
  // atrapa un modelo de imagen retirado.
  if (opciones.imagenes && source.IMAGE_PROVIDER !== "fake") {
    const resolverImagen = createImageModelResolver(source);
    for (const id of imageGeneratorIds(source.AI_MODEL_IMAGE, source.AI_MODEL_IMAGE_ALT)) {
      const { provider, model } = parseModelId(id);
      agregar({
        key: `probe-imagen:${id}`,
        id,
        tipo: "imagen",
        correr: async (signal) => {
          const opciones = imageCallOptions(provider, model, "1:1");
          // La calidad más baja: se prueba que dibuje, no cómo dibuja.
          const providerOptions =
            provider === "openai" ? { openai: { quality: "low" } } : opciones.providerOptions;
          try {
            await generateImage({
              model: resolverImagen(id),
              prompt: "Dibuja un círculo azul sobre fondo blanco. Imagen plana, sin texto.",
              n: 1,
              ...opciones,
              ...(providerOptions ? { providerOptions } : {}),
              maxRetries: 1,
              abortSignal: signal,
            });
          } catch (error) {
            // Gemini a veces contesta 200 con texto y sin imagen (visto en la
            // primera corrida, 2026-11-07). La cuenta y el modelo están bien,
            // que es lo que se prueba; un modelo retirado da 404, no esto.
            if (!NoImageGeneratedError.isInstance(error)) throw error;
            return { nota: "contestó sin imagen" };
          }
          return {};
        },
      });
    }
  }

  return sondas;
}

/** Todas a la vez, cada una con su techo: el pase dura lo que la más lenta. */
export async function correrSondas(sondas: readonly Sonda[]): Promise<ResultadoSonda[]> {
  return Promise.all(
    sondas.map(async (sonda) => {
      const inicio = Date.now();
      const techo =
        sonda.tipo === "imagen"
          ? TIMEOUT_MS.imagen
          : sonda.tipo === "texto"
            ? TIMEOUT_MS.texto
            : TIMEOUT_MS.otro;
      try {
        const medicion = await sonda.correr(AbortSignal.timeout(techo));
        return {
          key: sonda.key,
          id: sonda.id,
          tipo: sonda.tipo,
          ms: Date.now() - inicio,
          medicion,
        };
      } catch (error) {
        return { key: sonda.key, id: sonda.id, tipo: sonda.tipo, ms: Date.now() - inicio, error };
      }
    }),
  );
}

/** Por qué falló una sonda, en palabras del founder. */
export function clasificar(errorOriginal: unknown): { motivo: string; detalle: string } {
  // Con `maxRetries: 1`, un 429 o 5xx que se repite llega envuelto en un
  // RetryError sin status ni cuerpo: hay que leer el último intento.
  const error = RetryError.isInstance(errorOriginal) ? errorOriginal.lastError : errorOriginal;
  const status = statusOf(error);
  const cuerpo = APICallError.isInstance(error) ? (error.responseBody ?? error.message) : "";
  const mensaje = error instanceof Error ? error.message : String(error);
  const detalle = `${status === null ? "" : `${String(status)}: `}${(cuerpo || mensaje).slice(0, 300)}`;
  if (esErrorDeSaldo(status, cuerpo || mensaje)) return { motivo: "sin saldo", detalle };
  if (status === 401 || status === 403) return { motivo: "la key no sirve", detalle };
  if (status === 404) return { motivo: "el modelo no existe (¿lo retiraron?)", detalle };
  if (status === 429) return { motivo: "límite de tasa", detalle };
  return { motivo: "no contestó", detalle };
}

/** Las imágenes tienen prefijo propio: solo se evalúan el día que se prueban. */
export const PREFIJO_PRUEBA = "probe:";
export const PREFIJO_PRUEBA_IMAGEN = "probe-imagen:";

/**
 * Lo que la prueba prende, de las sondas con un prefijo. Cada prefijo es
 * entero de la prueba: un modelo que se quitó del `.env` ya no se prueba, y
 * su alerta se apaga en vez de quedarse prendida para siempre. Por eso las
 * imágenes van en su propio prefijo: un martes no se corren, ese prefijo no
 * se evalúa, y sus alertas se quedan como estaban.
 */
export function observacionesDeSondas(
  resultados: readonly ResultadoSonda[],
  prefijo: string,
): Observacion[] {
  const firing: Observacion[] = [];
  for (const r of resultados) {
    if (!r.key.startsWith(prefijo)) continue;
    if (r.error !== undefined) {
      const { motivo, detalle } = clasificar(r.error);
      firing.push({
        key: r.key,
        title: `Prueba diaria: ${r.id} · ${motivo}`,
        detail: `${r.tipo}, sin respaldo de por medio\n${detalle}`,
      });
    } else if (r.medicion?.aviso) {
      firing.push({ key: r.key, title: `Prueba diaria: ${r.id}`, detail: r.medicion.aviso });
    }
  }
  return firing;
}

/** Una línea por sonda para el log, y el costo estimado de la corrida. */
export function resumenParaLog(resultados: readonly ResultadoSonda[]): string {
  let total = 0;
  const lineas = resultados.map((r) => {
    if (r.medicion?.costo) total += r.medicion.costo;
    const estado = r.error === undefined ? "ok" : `FALLÓ (${clasificar(r.error).motivo})`;
    const extra = [r.medicion?.nota, r.medicion?.aviso].filter(Boolean).join(" · ");
    return `  ${r.id} [${r.tipo}] ${estado} en ${String(r.ms)} ms${extra ? ` · ${extra}` : ""}`;
  });
  return `${lineas.join("\n")}\n  costo estimado del texto: US$${total.toFixed(4)}`;
}

async function sondaBrave(llave: string, signal: AbortSignal): Promise<Medicion> {
  const res = await braveRequest(llave, "clima en Mérida", 1, signal);
  if (!res.ok) {
    // Como APICallError, para que `clasificar` lea el status y el cuerpo.
    throw new APICallError({
      message: `Brave contestó ${String(res.status)}`,
      url: res.url,
      requestBodyValues: {},
      statusCode: res.status,
      responseBody: (await res.text()).slice(0, 300),
    });
  }
  const restante = restanteDelMes(
    res.headers.get("x-ratelimit-limit"),
    res.headers.get("x-ratelimit-remaining"),
  );
  return {
    nota: restante === null ? "sin tope mensual" : `quedan ${String(restante)} consultas del mes`,
    ...(restante !== null && restante < BRAVE_MIN_RESTANTE
      ? {
          aviso: `Quedan ${String(restante)} consultas de Brave este mes (aviso bajo ${String(BRAVE_MIN_RESTANTE)})`,
        }
      : {}),
  };
}

/**
 * Lo que queda del mes en Brave, o null si no hay tope mensual. Los headers
 * traen un número por ventana, de la más corta a la más larga
 * (`x-ratelimit-limit: 50, 0` = 50 por segundo, 0 al mes). Un tope de 0 es
 * "sin tope": así lo manda el plan de pago por uso (visto el 2026-11-07), y
 * leerlo como "quedan 0" avisaría todos los días de algo que no pasa.
 */
export function restanteDelMes(limite: string | null, restante: string | null): number | null {
  const ultimo = (header: string | null) => {
    const valor = header?.split(",").at(-1)?.trim();
    const n = valor === undefined || valor === "" ? Number.NaN : Number(valor);
    return Number.isNaN(n) ? null : n;
  };
  const tope = ultimo(limite);
  if (tope === null || tope === 0) return null;
  return ultimo(restante);
}

/** Un WAV PCM de 16 kHz, mono, en silencio: lo mínimo que un transcriptor acepta. */
export function silencioWav(segundos: number): Uint8Array {
  const muestras = 16_000 * segundos;
  const datos = muestras * 2;
  const buf = Buffer.alloc(44 + datos);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + datos, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(16_000, 24);
  buf.writeUInt32LE(32_000, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(datos, 40);
  return new Uint8Array(buf);
}
