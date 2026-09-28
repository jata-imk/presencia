import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Dónde viven los bytes de Biblioteca (F10, ADR-011). La fila de `assets`
// dice de quién es el archivo y de dónde salió; esto solo guarda y entrega.
// Mismo patrón de puerto que PublishingProvider: la app no sabe si del otro
// lado hay un bucket o una carpeta.

/** Cómo entregarle un asset al navegador. */
export type AssetDelivery =
  /** URL firmada y efímera del bucket: el navegador la pide directo. */
  | { kind: "redirect"; url: string }
  /** Los bytes, para que la API los sirva ella misma (solo `local`). */
  | { kind: "bytes"; data: Uint8Array };

export interface AssetStorage {
  put(key: string, data: Uint8Array, mimeType: string): Promise<void>;
  /** Los bytes tal cual: para editar una imagen o subirla a un proveedor. */
  get(key: string): Promise<Uint8Array>;
  deliver(key: string, mimeType: string): Promise<AssetDelivery>;
}

export const ASSET_STORAGE = Symbol("ASSET_STORAGE");

/**
 * Cuánto dura la URL firmada. Corta a propósito: el bucket es privado y una
 * URL que se filtra (un screenshot del inspector, un historial compartido)
 * deja de servir en minutos. La card la vuelve a pedir cada vez que se pinta,
 * así que no hace falta que viva más.
 */
const SIGNED_URL_SECONDS = 10 * 60;

export class R2AssetStorage implements AssetStorage {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    config: { endpoint: string; region: string; accessKeyId: string; secretAccessKey: string },
  ) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async put(key: string, data: Uint8Array, mimeType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: mimeType }),
    );
  }

  async get(key: string): Promise<Uint8Array> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!result.Body) throw new Error(`El bucket devolvió ${key} sin contenido`);
    return result.Body.transformToByteArray();
  }

  async deliver(key: string): Promise<AssetDelivery> {
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: SIGNED_URL_SECONDS },
    );
    return { kind: "redirect", url };
  }
}

/**
 * Disco local: dev y tests, nunca producción (env.ts lo impide). La llave se
 * usa como ruta relativa, y por eso se valida: una llave con ".." escribiría
 * fuera de la carpeta. Hoy todas las llaves las arma la API, pero el día que
 * una no lo haga, esto es lo que separa un bug de un path traversal.
 */
export class LocalAssetStorage implements AssetStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private pathFor(key: string): string {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) {
      throw new Error(`Llave de asset inválida: ${key}`);
    }
    return full;
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    const full = this.pathFor(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
  }

  async get(key: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.pathFor(key)));
  }

  async deliver(key: string): Promise<AssetDelivery> {
    return { kind: "bytes", data: await this.get(key) };
  }
}
