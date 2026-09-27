import { createHash } from "node:crypto";
import { crc32, deflateSync } from "node:zlib";
import type {
  ImageAspectRatio,
  ImageProvider,
  ImageRequest,
  ImageResult,
} from "./image-provider.js";

// Generador de mentira para tests y dev (`IMAGE_PROVIDER=fake`): un PNG de un
// solo color, sin red y sin costo. El color sale del prompt y de un contador,
// así dos variantes del mismo prompt se distinguen a simple vista en la card.
//
// Un prompt con "[bloquear]" simula la negativa del proveedor, para poder
// probar ese estado de la card sin tener que provocarla de verdad.

const DIMENSIONS: Record<ImageAspectRatio, [number, number]> = {
  "1:1": [64, 64],
  "4:5": [64, 80],
  "16:9": [96, 54],
};

export const FAKE_BLOCK_MARKER = "[bloquear]";

export class FakeImageProvider implements ImageProvider {
  readonly provider = "fake";
  readonly modelName = "solid-png";
  readonly requests: ImageRequest[] = [];

  generate(request: ImageRequest): Promise<ImageResult> {
    this.requests.push(request);
    if (request.prompt.includes(FAKE_BLOCK_MARKER)) {
      return Promise.resolve({ kind: "blocked", providerRaw: { fake: true, blocked: true } });
    }
    const seed = createHash("sha256").update(`${request.prompt}#${this.requests.length}`).digest();
    const [width, height] = DIMENSIONS[request.aspectRatio];
    return Promise.resolve({
      kind: "image",
      data: solidPng(width, height, [seed[0]!, seed[1]!, seed[2]!]),
      mediaType: "image/png",
      usage: { inputTokens: undefined, outputTokens: undefined, totalTokens: undefined },
      providerRaw: { fake: true, edit: request.reference !== undefined },
    });
  }
}

/** PNG RGB de un color, armado a mano para no sumar una dependencia por un test. */
export function solidPng(width: number, height: number, [r, g, b]: [number, number, number]) {
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set([r, g, b], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));

  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8 bits, RGB, sin entrelazado

  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}
