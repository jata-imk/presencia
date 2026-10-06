import {
  APICallError,
  type LanguageModelV4,
  type LanguageModelV4CallOptions,
  type LanguageModelV4StreamPart,
  type LanguageModelV4StreamResult,
} from "@ai-sdk/provider";
import type { ModelEntry } from "./provider-registry.js";

// La cadena de respaldo de un modelo de texto (F10.7, ADR-004): principal y
// respaldos en el orden del `.env`. Es un `LanguageModelV4` más, así que
// `streamText`/`generateText` no saben que existe y ningún call site cambia.
//
// Solo cae al siguiente ante una CAÍDA del proveedor (isFallbackError): 5xx,
// 408/409, 429, sin saldo, red o nuestro timeout. Nunca ante un 400 —un
// bloqueo de contenido, un request mal armado—, un 401/403 —una key mal
// puesta, que hay que ver y arreglar— ni un aborto del usuario. Y solo antes
// de la primera salida: una vez que el creator vio texto, cambiar de modelo a
// la mitad le pegaría dos voces en una respuesta.

/** Hasta la primera salida de un stream (texto, razonamiento, tool). El peor caso medido es ~15 s. */
export const FIRST_OUTPUT_TIMEOUT_MS = 60_000;
/** Una llamada completa sin stream. La más lenta medida es ~31 s (post_adapt). */
export const GENERATE_TIMEOUT_MS = 120_000;
/** Un reintento en el mismo modelo antes de pasar al siguiente: un 503 suelto no merece cambiar de voz. */
export const RETRIES_PER_MODEL = 1;
const RETRY_DELAY_MS = 1_000;

/** Un intento que no sirvió, para `provider_raw.attempts`. */
export interface FallbackAttempt {
  id: string;
  status: number | null;
  error: string;
}

export interface FallbackLink {
  entry: ModelEntry;
  model: LanguageModelV4;
}

export interface FallbackOptions {
  /** Proveedores que se fingen caídos (503). Solo dev: lo rechaza `env.ts` en producción. */
  simulateDown?: readonly string[];
  firstOutputTimeoutMs?: number;
  generateTimeoutMs?: number;
  retryDelayMs?: number;
}

export interface FallbackChain {
  model: LanguageModelV4;
  /** El modelo que respondió; antes de la llamada, el principal. */
  readonly ran: ModelEntry;
  /** Los intentos que fallaron, en orden. Vacío si el principal respondió a la primera. */
  readonly attempts: readonly FallbackAttempt[];
}

/** Se acabó la cadena: todos cayeron. No es reintentable, para que el SDK no la repita entera. */
export class FallbackExhaustedError extends Error {
  constructor(
    readonly attempts: readonly FallbackAttempt[],
    options: { cause: unknown },
  ) {
    super(
      `Todos los modelos de la cadena fallaron: ${attempts.map((a) => `${a.id} (${a.status ?? "sin status"}: ${a.error})`).join("; ")}`,
      options,
    );
    this.name = "FallbackExhaustedError";
  }
}

/** Nuestro timeout por intento, para distinguirlo del aborto del usuario. La cadena de imagen usa el mismo. */
export class AttemptTimeoutError extends Error {
  constructor(ms: number) {
    super(`Sin respuesta del proveedor en ${String(Math.round(ms / 1000))} s`);
    this.name = "AttemptTimeoutError";
  }
}

/**
 * ¿El intento cayó por NUESTRO plazo? Solo si venció y lo que se recibió no
 * es una respuesta del proveedor. Un `APICallError` que llega justo cuando
 * vence el plazo es lo que el proveedor contestó de verdad —un 400 de
 * moderación, por ejemplo— y manda él: tomarlo por timeout lo haría caer al
 * siguiente, que es esquivar la moderación.
 */
export function timedOutWith(timedOut: boolean, error: unknown): boolean {
  return timedOut && !APICallError.isInstance(error);
}

/** Los proveedores que AI_FALLBACK_SIMULATE finge caídos (solo dev). Un solo parser para texto e imagen. */
export function parseSimulateDown(value: string | undefined): string[] {
  return (
    value
      ?.split(",")
      .map((provider) => provider.trim())
      .filter(Boolean) ?? []
  );
}

/** La caída fingida de un proveedor: un 503 reintentable, sin llamarlo. */
export function simulatedOutage(provider: string): APICallError {
  return new APICallError({
    message: `Caída simulada de ${provider} (AI_FALLBACK_SIMULATE)`,
    url: "simulado",
    requestBodyValues: {},
    statusCode: 503,
    isRetryable: true,
  });
}

const QUOTA_BODY = /insufficient_quota|billing|credit balance|quota exceeded/i;
const NETWORK_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
]);

export function statusOf(error: unknown): number | null {
  if (APICallError.isInstance(error)) return error.statusCode ?? null;
  if (typeof error === "object" && error !== null && "statusCode" in error) {
    const status = (error as { statusCode?: unknown }).statusCode;
    return typeof status === "number" ? status : null;
  }
  return null;
}

/**
 * ¿Es una caída del proveedor? Solo esas pasan al siguiente modelo.
 *
 * `isRetryable` del SDK ya marca 408, 409, 429, 5xx y los errores de conexión;
 * se suman el 402 y la cuota agotada, que algunos proveedores mandan como 400
 * o 403: sin saldo es la caída más probable de un proyecto chico.
 */
export function isFallbackError(error: unknown): boolean {
  if (error instanceof AttemptTimeoutError) return true;
  const status = statusOf(error);
  if (status === 402) return true;
  if (APICallError.isInstance(error)) {
    if (error.isRetryable) return true;
    return QUOTA_BODY.test(error.responseBody ?? error.message);
  }
  // Error de un stream (ProviderStreamError): objeto plano con su propio isRetryable.
  if (typeof error === "object" && error !== null && "isRetryable" in error) {
    return (error as { isRetryable?: unknown }).isRetryable === true;
  }
  const code = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  return typeof code === "string" && NETWORK_CODES.has(code);
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 300);
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message).slice(0, 300);
  }
  return String(error).slice(0, 300);
}

/** Lo que el stream manda antes de producir algo: no cuenta como salida. */
const PREAMBLE = new Set<LanguageModelV4StreamPart["type"]>([
  "stream-start",
  "response-metadata",
  "raw",
]);

/**
 * Una señal que aborta si el usuario aborta o si vence el plazo. El plazo se
 * puede soltar (`settle`) cuando ya hubo salida: de ahí en adelante solo
 * manda el usuario.
 */
function attemptSignal(userSignal: AbortSignal | undefined, ms: number) {
  const controller = new AbortController();
  const onUserAbort = () => controller.abort(userSignal?.reason);
  if (userSignal?.aborted) controller.abort(userSignal.reason);
  else userSignal?.addEventListener("abort", onUserAbort, { once: true });
  const timeout = new AttemptTimeoutError(ms);
  const timer = setTimeout(() => controller.abort(timeout), ms);
  return {
    signal: controller.signal,
    timedOut: () => controller.signal.aborted && controller.signal.reason === timeout,
    timeout,
    settle: () => clearTimeout(timer),
    release: () => {
      clearTimeout(timer);
      userSignal?.removeEventListener("abort", onUserAbort);
    },
  };
}

/**
 * Lee el stream hasta la primera salida. Si antes de ella llega un error, lo
 * lanza como si `doStream` hubiera fallado (algunos proveedores responden 200
 * y mandan el 5xx dentro del stream). Si hay salida, devuelve un stream que
 * repite lo leído y sigue con el resto.
 */
async function untilFirstOutput(
  result: LanguageModelV4StreamResult,
): Promise<LanguageModelV4StreamResult> {
  const reader = result.stream.getReader();
  const buffered: LanguageModelV4StreamPart[] = [];
  for (;;) {
    // Si vence el plazo, la señal aborta el fetch y esta lectura truena; quien
    // llama distingue nuestro timeout del aborto del usuario.
    const next = await reader.read();
    if (next.done) break;
    const part = next.value;
    if (part.type === "error") {
      await reader.cancel().catch(() => undefined);
      throw part.error;
    }
    buffered.push(part);
    if (!PREAMBLE.has(part.type)) break;
  }
  const stream = new ReadableStream<LanguageModelV4StreamPart>({
    start(controller) {
      for (const part of buffered) controller.enqueue(part);
    },
    async pull(controller) {
      const next = await reader.read();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  return { ...result, stream };
}

export function createFallbackChain(
  links: readonly FallbackLink[],
  options: FallbackOptions = {},
): FallbackChain {
  const [principal] = links;
  if (!principal) throw new Error("Una cadena de modelos necesita al menos uno.");
  const simulateDown = new Set(options.simulateDown ?? []);
  const firstOutputMs = options.firstOutputTimeoutMs ?? FIRST_OUTPUT_TIMEOUT_MS;
  const generateMs = options.generateTimeoutMs ?? GENERATE_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? RETRY_DELAY_MS;

  let ran: ModelEntry = principal.entry;
  // Un turno con tool calls son varios pasos, y cada paso es otra llamada a
  // este modelo. Una vez que un eslabón respondió, la llamada queda fija en
  // él: los pasos siguientes no vuelven a esperar al principal caído, y si el
  // fijo se cae a mitad del turno el error sube en vez de saltar al
  // siguiente. Un turno nunca mezcla la voz de dos modelos (ni sus partes de
  // razonamiento, que cada proveedor guarda a su manera), y su usage entero es
  // de un solo modelo.
  let pinned: number | null = null;
  const attempts: FallbackAttempt[] = [];

  async function run<T>(
    call: (link: FallbackLink, signal: AbortSignal) => Promise<T>,
    callOptions: LanguageModelV4CallOptions,
    timeoutMs: number,
    settleOn: (result: T) => Promise<T>,
  ): Promise<T> {
    let lastError: unknown;
    for (const [index, link] of links.entries()) {
      if (pinned !== null && index !== pinned) continue;
      for (let attempt = 0; attempt <= RETRIES_PER_MODEL; attempt++) {
        if (callOptions.abortSignal?.aborted) throw callOptions.abortSignal.reason;
        // Tras un timeout no se reintenta el mismo: ya esperó el plazo entero.
        if (attempt > 0 && lastError instanceof AttemptTimeoutError) break;
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        const guard = attemptSignal(callOptions.abortSignal, timeoutMs);
        try {
          if (simulateDown.has(link.entry.provider)) {
            throw simulatedOutage(link.entry.provider);
          }
          const result = await settleOn(await call(link, guard.signal));
          guard.settle();
          ran = link.entry;
          pinned = index;
          return result;
        } catch (error) {
          guard.release();
          // El usuario se fue: no hay a quién responderle, no se gasta otro modelo.
          if (callOptions.abortSignal?.aborted) throw error;
          const cause = timedOutWith(guard.timedOut(), error) ? guard.timeout : error;
          // Si ya está fijo, el loop no pasa a otro eslabón: tiene su reintento
          // y luego la cadena se rinde, sin mezclar dos voces en un turno.
          if (!isFallbackError(cause)) throw cause;
          attempts.push({
            id: link.entry.id,
            status: statusOf(cause),
            error: describeError(cause),
          });
          lastError = cause;
        }
      }
    }
    throw new FallbackExhaustedError(attempts, { cause: lastError });
  }

  const model: LanguageModelV4 = {
    specificationVersion: "v4",
    // El que corrió, no el principal: el SDK firma con esto sus avisos del
    // log, y "openai / gpt-6-luna" sobre un turno que respondió Gemini engaña
    // justo cuando se está investigando una caída.
    get provider() {
      return (links.find((link) => link.entry === ran) ?? principal).model.provider;
    },
    get modelId() {
      return (links.find((link) => link.entry === ran) ?? principal).model.modelId;
    },
    supportedUrls: principal.model.supportedUrls,
    doGenerate: (callOptions) =>
      run(
        (link, signal) =>
          Promise.resolve(link.model.doGenerate({ ...callOptions, abortSignal: signal })),
        callOptions,
        generateMs,
        (result) => Promise.resolve(result),
      ),
    doStream: (callOptions) =>
      run(
        (link, signal) =>
          Promise.resolve(link.model.doStream({ ...callOptions, abortSignal: signal })),
        callOptions,
        firstOutputMs,
        untilFirstOutput,
      ),
  };

  return {
    model,
    get ran() {
      return ran;
    },
    get attempts() {
      return attempts;
    },
  };
}
