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

/**
 * Cuerpo de error de "sin saldo / sin cuota" que algunos proveedores mandan
 * como 400 o 403. Exportado para las alertas de operación (F12.8), que buscan
 * lo mismo en los intentos guardados.
 */
export const QUOTA_BODY = /insufficient_quota|billing|credit balance|quota exceeded/i;
/** Tipos de error de stream que son caída, cuando el proveedor no dice si se reintenta. */
const STREAM_OUTAGE = /server_error|internal|overloaded|unavailable|rate_limit|timeout/i;
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
  // Error de un stream (ProviderStreamError): objeto plano. Manda su
  // isRetryable si lo trae; si no, su status o su tipo: un proveedor que
  // responde 200 y manda "server_error" adentro está caído igual.
  if (typeof error === "object" && error !== null && !(error instanceof Error)) {
    const streamError = error as { isRetryable?: unknown; type?: unknown; code?: unknown };
    if (typeof streamError.isRetryable === "boolean") return streamError.isRetryable;
    if (status !== null) return status === 408 || status === 409 || status === 429 || status >= 500;
    const text = (value: unknown) => (typeof value === "string" ? value : "");
    return STREAM_OUTAGE.test(`${text(streamError.type)} ${text(streamError.code)}`);
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

/** Un eslabón de una cadena de una sola llamada (imagen, transcripción): quién es. */
export interface ChainLink {
  provider: string;
  modelName: string;
}

/** Quién respondió en una cadena de una sola llamada, para `ai_usage_events`. */
export interface ChainRan {
  provider: string;
  modelName: string;
  /** El principal que se pidió si respondió un respaldo; `null` = el principal. */
  fallbackFrom: string | null;
  attempts: FallbackAttempt[];
}

export interface ChainRunOptions {
  /** Proveedores que se fingen caídos (503). Solo dev: lo rechaza `env.ts` en producción. */
  simulateDown?: readonly string[];
  /** Lo más que se le espera a un intento. */
  attemptTimeoutMs: number;
  /** Lo más que se le espera a la cadena entera; cada intento recibe lo que quede. */
  budgetMs: number;
  /** Con menos de esto no se empieza otro intento: no alcanzaría. */
  minAttemptMs: number;
  retryDelayMs: number;
  /** El detener del usuario: corta el intento en curso y nunca pasa al siguiente. */
  signal?: AbortSignal;
}

/**
 * La cadena de respaldo de una llamada SIN stream: dibujar una imagen
 * (F10.7, ADR-025) o transcribir una nota de voz (F11, ADR-030). Misma regla
 * que la de texto (`createFallbackChain`): solo cae al siguiente si el
 * proveedor se CAE (`isFallbackError`), con un reintento por modelo y nunca
 * tras un timeout. Una sola copia para las dos: antes cada una tenía su loop
 * (revisión del F11 PR6).
 */
export async function runFallbackChain<L extends ChainLink, R>(
  links: readonly L[],
  call: (link: L, signal: AbortSignal) => Promise<R>,
  options: ChainRunOptions,
): Promise<{ result: R; ran: ChainRan }> {
  const [first] = links;
  if (!first) throw new Error("Una cadena necesita al menos un modelo.");
  const { signal } = options;
  const simulateDown = new Set(options.simulateDown ?? []);
  const deadline = Date.now() + options.budgetMs;
  const principal = `${first.provider}:${first.modelName}`;
  const attempts: FallbackAttempt[] = [];
  let lastError: unknown;

  chain: for (const link of links) {
    const id = `${link.provider}:${link.modelName}`;
    for (let attempt = 0; attempt <= RETRIES_PER_MODEL; attempt++) {
      // Tras un timeout no se reintenta el mismo: ya se esperó el plazo entero.
      if (attempt > 0 && lastError instanceof AttemptTimeoutError) break;
      if (attempt > 0) await pause(options.retryDelayMs, signal);
      signal?.throwIfAborted();
      const remaining = deadline - Date.now();
      if (remaining < options.minAttemptMs) break chain;
      const timeoutMs = Math.min(options.attemptTimeoutMs, remaining);
      const controller = new AbortController();
      const timeout = new AttemptTimeoutError(timeoutMs);
      const timer = setTimeout(() => controller.abort(timeout), timeoutMs);
      const attemptSignal = signal
        ? AbortSignal.any([controller.signal, signal])
        : controller.signal;
      try {
        if (simulateDown.has(link.provider)) throw simulatedOutage(link.provider);
        const result = await call(link, attemptSignal);
        return {
          result,
          ran: {
            provider: link.provider,
            modelName: link.modelName,
            fallbackFrom: id === principal ? null : principal,
            attempts,
          },
        };
      } catch (error) {
        // El usuario detuvo: no es una caída, y no hay para quién seguir.
        if (signal?.aborted) throw signal.reason ?? error;
        const timedOut = controller.signal.aborted && controller.signal.reason === timeout;
        const cause = timedOutWith(timedOut, error) ? timeout : error;
        if (!isFallbackError(cause)) {
          // Un error que no es caída (400, key mala) se lanza tal cual. Si
          // falló un RESPALDO, con lo que pasó antes: sin eso, el log diría que
          // falló el principal. Si fue el reintento del principal, no: decir
          // "tras caer el principal" mandaría a buscar en el respaldo.
          if (id === principal) throw cause;
          throw new Error(
            `${id} falló tras caer el principal (${attempts.map((a) => `${a.id}: ${String(a.status ?? "sin status")}`).join(", ")}): ${describeError(error)}`,
            // Aquí `cause` es `error`: un timeout siempre es caída y no llega.
            { cause: error },
          );
        }
        attempts.push({ id, status: statusOf(cause), error: describeError(cause) });
        lastError = cause;
      } finally {
        clearTimeout(timer);
      }
    }
  }
  throw new FallbackExhaustedError(attempts, { cause: lastError });
}

/** La pausa antes de un reintento, que el detener del usuario corta. */
function pause(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason as Error);
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal!.reason as Error);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
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
          if (!isFallbackError(cause)) {
            // Con lo que pasó antes: sin eso, el log diría que falló el
            // principal cuando el que falló fue el respaldo (igual que la
            // cadena de imagen).
            if (attempts.length === 0) throw cause;
            throw new Error(
              `${link.entry.id} falló tras caer el principal (${attempts.map((a) => `${a.id}: ${String(a.status ?? "sin status")}`).join(", ")}): ${describeError(error)}`,
              { cause: error },
            );
          }
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
    // Con respaldos, ninguna URL viaja cruda: el SDK las descarga y manda los
    // bytes. Si no, decidiría por lo que acepta el principal, y un respaldo
    // que no acepta esa URL respondería 400 justo durante la caída.
    supportedUrls: links.length === 1 ? principal.model.supportedUrls : {},
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
