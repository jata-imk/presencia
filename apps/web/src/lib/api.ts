// Reemplaza el fetch + res.ok a mano repetido en cada ruta (ver
// routes/chats.tsx) por un solo lugar: serializa el body a JSON, y si la
// respuesta no es 2xx, lanza con el `message` que ya devuelve Nest
// (BadRequestException("...") → { statusCode, message, error }).

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const DEFAULT_ERROR = "Algo salió mal. Inténtalo de nuevo.";

interface ApiFetchInit extends Omit<RequestInit, "body"> {
  body?: unknown;
}

export async function apiFetch<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const { body, headers, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    headers: { "Content-Type": "application/json", ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const parsed = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(parsed?.message ?? DEFAULT_ERROR, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
