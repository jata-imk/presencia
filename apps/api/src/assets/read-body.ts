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
 * antes de leer nada; si miente o no viene, rechaza en cuanto se pasa — sin
 * eso, un body sin tope se juntaría entero en memoria.
 *
 * Al pasarse NO destruye el request: eso cierra el socket antes de que Nest
 * alcance a mandar el 413, y el navegador vería un error de red en vez de
 * "tu archivo pesa 14 MB". El resto del body se sigue leyendo y se tira.
 */
export function readRawBody(req: Request, max: number): Promise<Uint8Array> {
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > max) {
    return Promise.reject(fileTooLarge(declared, max));
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let over = false;
    req.on("data", (chunk: Buffer) => {
      if (over) return;
      size += chunk.length;
      if (size > max) {
        over = true;
        chunks.length = 0;
        reject(fileTooLarge(size, max));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!over) resolve(new Uint8Array(Buffer.concat(chunks)));
    });
    req.on("error", reject);
  });
}
