import {
  PublishingRateLimitError,
  PublishingRejectedError,
  PublishingUnavailableError,
} from "./errors.js";

/**
 * Cliente HTTP compartido por los adapters de publicación.
 *
 * Existe porque la traducción de códigos del proveedor a nuestros errores de
 * dominio ES un concepto del puerto, no un detalle de cada adapter (regla
 * dura #5: una sola fuente de verdad por concepto). Que "5xx y error de red
 * son ambiguos, 4xx es rechazo explícito" viva en dos archivos casi
 * idénticos es justo la clase de duplicación que se desincroniza el día que
 * uno de los dos gane un caso nuevo — y esa distinción es la que decide si
 * una card vuelve a `draft` o se queda en `failed` (ver ADR-009, addendum
 * del 2026-08-19 y el incidente que lo motivó).
 *
 * Lo que NO abstrae, a propósito: la forma de autenticarse (PostFast usa un
 * header propio `pf-api-key`, Upload-Post usa `Authorization: Apikey`) ni
 * los shapes de request/response, que son 100% de cada proveedor.
 */

/**
 * Corte duro por request. Tiene que ser MENOR que el `RECONCILE_GRACE_MS` de
 * CardsService (2 min), y ese no es un número cómodo sino la condición que
 * evita un daño concreto (code review F8 PR2):
 *
 * `schedule()` deja la card `scheduled` con `provider_ref` en null mientras la
 * llamada está en vuelo. Si esa llamada tarda más que el margen de gracia, el
 * barrido de reconciliación —que desde F8 corre cada minuto, sin depender de
 * que nadie mire— la ve como huérfana y la marca `failed`. Cuando el proveedor
 * por fin contesta, `persistProviderRef` encuentra que la card ya no está
 * `scheduled` y **cancela un post que sí se había creado bien**.
 *
 * Con el timeout, la llamada se rinde antes de esa ventana y el fallo entra por
 * la puerta correcta: `PublishingUnavailableError` (ambiguo) manda la card a
 * `failed` conservando el rastro y avisándole al usuario que revise en el
 * proveedor, en vez de borrarle un post real por la espalda.
 */
const REQUEST_TIMEOUT_MS = 30_000;
export class ProviderHttpClient {
  constructor(
    private readonly providerName: string,
    private readonly baseUrl: string,
    private readonly authHeaders: Readonly<Record<string, string>>,
  ) {}

  /**
   * `body` puede ser un objeto (se manda como JSON) o un `FormData` (se
   * manda como multipart — Upload-Post no acepta JSON en sus endpoints de
   * upload). Con FormData el Content-Type NO se fija a mano: tiene que
   * ponerlo fetch para que incluya el boundary.
   */
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const isForm = body instanceof FormData;
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          ...this.authHeaders,
          ...(body !== undefined && !isForm ? { "Content-Type": "application/json" } : {}),
        },
        body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // Un timeout entra por acá igual que un error de red, y es lo correcto:
      // los dos son ambiguos — no sabemos si el proveedor alcanzó a hacer algo.
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      throw new PublishingUnavailableError(
        timedOut
          ? `${this.providerName} no respondió en ${REQUEST_TIMEOUT_MS / 1000}s.`
          : `No se pudo contactar a ${this.providerName} (error de red).`,
        error,
      );
    }

    if (res.status === 429) throw new PublishingRateLimitError();
    if (res.status >= 500) {
      throw new PublishingUnavailableError(
        `${this.providerName} respondió ${res.status}.`,
        await safeJson(res),
      );
    }
    if (!res.ok) {
      const detail = await safeJson(res);
      throw new PublishingRejectedError(
        errorMessageFromBody(detail) ??
          `${this.providerName} rechazó la solicitud (${res.status}).`,
        { status: res.status, body: detail },
      );
    }
    // Un cuerpo vacío no es solo el 204: `DELETE`/`PATCH` de Upload-Post
    // pueden responder 200 sin nada. Sin esto, `res.json()` lanzaba un
    // SyntaxError crudo — ni Rejected ni Unavailable —, así que se escapaba
    // de classifyScheduleFailure y de la idempotencia del cancel, y salía
    // como un 500 sin clasificar.
    const raw = await res.text();
    if (raw.trim() === "") return undefined as T;
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new PublishingUnavailableError(
        `${this.providerName} respondió ${res.status} con un cuerpo que no es JSON.`,
        { status: res.status, body: raw.slice(0, 500) },
      );
    }
  }
}

/** Lee el código HTTP del `.detail` que arma `request` para un rechazo. */
export function isStatus(detail: unknown, status: number): boolean {
  return (
    typeof detail === "object" &&
    detail !== null &&
    (detail as { status?: number }).status === status
  );
}

function errorMessageFromBody(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  // PostFast manda `message`; el ErrorResponse de Upload-Post trae los dos y
  // algunos de sus endpoints solo mandan `error`.
  const { message, error } = body as { message?: unknown; error?: unknown };
  if (typeof message === "string" && message) return message;
  if (typeof error === "string" && error) return error;
  return undefined;
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
