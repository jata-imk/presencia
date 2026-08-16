// Traducción de errores del proveedor a vocabulario propio (mismo criterio
// que credits/errors.ts): el caller decide su propio manejo — 4xx del
// creator es HTTP 400/409, no un fallo del sistema.

/** El proveedor rechazó la solicitud (validación, cuenta desconectada, etc). */
export class PublishingRejectedError extends Error {
  constructor(
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "PublishingRejectedError";
  }
}

/** 429 del proveedor — reintentar más tarde, no es culpa del usuario. */
export class PublishingRateLimitError extends Error {
  constructor(message = "El proveedor de publicación está saturado por ahora.") {
    super(message);
    this.name = "PublishingRateLimitError";
  }
}

/** 5xx o error de red — el proveedor no está disponible ahora mismo. */
export class PublishingUnavailableError extends Error {
  constructor(
    message = "El proveedor de publicación no está disponible en este momento.",
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "PublishingUnavailableError";
  }
}
