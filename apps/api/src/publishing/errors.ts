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

/**
 * 5xx, error de red, o una respuesta 2xx que no pudimos interpretar (el
 * proveedor procesó la solicitud pero su forma no fue la esperada) — en
 * cualquiera de los tres casos, NO sabemos con certeza si el proveedor
 * llegó a crear el efecto del otro lado. A diferencia de
 * PublishingRejectedError (rechazo explícito, nunca se creó nada), el
 * caller debe tratar esto como ambiguo, no como "no pasó nada" (ver
 * CardsService.schedule(), incidente 2026-08-18: un post real se creó en
 * PostFast pero la card local volvió a draft sin dejar rastro).
 */
export class PublishingUnavailableError extends Error {
  constructor(
    message = "El proveedor de publicación no está disponible en este momento.",
    readonly detail?: unknown,
  ) {
    super(message, { cause: detail });
    this.name = "PublishingUnavailableError";
  }
}
