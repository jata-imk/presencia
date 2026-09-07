import { BadRequestException, HttpException, HttpStatus } from "@nestjs/common";
import {
  PublishingRateLimitError,
  PublishingRejectedError,
  PublishingUnavailableError,
} from "./errors.js";

/**
 * Traduce un error del proveedor de publicación a una excepción HTTP.
 *
 * Vive acá y no dentro de un servicio porque **todo el que llame al puerto
 * la necesita**, no solo `CardsService`. Faltaba en `ChannelsService`, y eso
 * tenía una consecuencia concreta: `ensureWorkspace` puede rechazar con un
 * mensaje escrito para que el usuario lo entienda ("tu cuenta llegó al
 * límite de perfiles de su plan"), pero sin traducir salía como un 500
 * genérico de Nest. El usuario le daba a "Conectar red" y veía un error de
 * servidor sin explicación — el mensaje existía y no llegaba a nadie.
 *
 * `PublishingRejectedError` es 400 porque es un rechazo explícito y
 * accionable; los otros dos son 503 porque son del sistema, no del usuario.
 */
export function toHttpException(error: unknown): Error {
  if (error instanceof PublishingRejectedError) return new BadRequestException(error.message);
  if (error instanceof PublishingRateLimitError || error instanceof PublishingUnavailableError) {
    return new HttpException(error.message, HttpStatus.SERVICE_UNAVAILABLE);
  }
  return error instanceof Error ? error : new Error(String(error));
}
