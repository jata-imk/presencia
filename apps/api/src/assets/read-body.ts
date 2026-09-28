import { HttpException, HttpStatus } from "@nestjs/common";
import type { Request } from "express";
import { formatBytes } from "@presencia/shared";

// El cuerpo crudo de una subida (F10). Sin multer ni multipart: el navegador
// manda el archivo tal cual como body, con su tipo en Content-Type, y esto lo
// junta con un tope. `express.json()` no lo toca porque no es JSON.

export function fileTooLarge(size: number, max: number): HttpException {
  return new HttpException(
    {
      code: "file_too_large",
      message: `El límite es ${formatBytes(max)}. Tu archivo pesa ${formatBytes(size)}. Prueba comprimirlo o sube uno más pequeño.`,
    },
    HttpStatus.PAYLOAD_TOO_LARGE,
  );
}

/**
 * Lee el body hasta `max` bytes. Si el Content-Length ya anuncia más, corta
 * antes de leer nada; si miente o no viene, corta en cuanto se pasa — sin eso,
 * un body sin tope se juntaría entero en memoria.
 */
export async function readRawBody(req: Request, max: number): Promise<Uint8Array> {
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > max) throw fileTooLarge(declared, max);

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > max) {
      req.destroy();
      throw fileTooLarge(size, max);
    }
    chunks.push(chunk);
  }
  return new Uint8Array(Buffer.concat(chunks));
}
