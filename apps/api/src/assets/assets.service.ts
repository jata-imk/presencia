import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { DbService, type Tx } from "../db/db.service.js";
import { ASSET_STORAGE, type AssetDelivery, type AssetStorage } from "./asset-storage.js";
import {
  AssetsRepository,
  type AssetMetadata,
  type AssetRow,
  type InsertAssetInput,
} from "./assets.repository.js";
import { extensionFor, inspectImage } from "./image-inspect.js";

/** Un archivo ya guardado en el storage cuya fila todavía no se escribió. */
export type StoredAsset = InsertAssetInput & { id: string };

// Biblioteca, del lado del almacenamiento (F10). Guardar es de dos pasos a
// propósito: primero los bytes (red, lento, fuera de cualquier transacción),
// después la fila, DENTRO de la transacción de quien la usa — la que además
// pone la imagen en la card. Así una imagen nunca aparece en una card sin su
// fila, ni una fila sin sus bytes.
//
// Lo que sí puede pasar es lo inverso: bytes sin fila, si la transacción de
// después falla. Es basura barata en un bucket (centavos por GB al mes) y no
// se ve en ningún lado; el día que pese, se limpia con un barrido.
@Injectable()
export class AssetsService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(AssetsRepository) private readonly repo: AssetsRepository,
    @Inject(ASSET_STORAGE) private readonly storage: AssetStorage,
  ) {}

  /**
   * Valida que sea una imagen de verdad y la guarda en el storage. Lanza
   * `InvalidImageError` si no lo es.
   *
   * La llave es `userId/assetId.ext`: el "prefijo por usuario" de ADR-011,
   * que deja borrar o exportar todo lo de una cuenta con un solo prefijo. NO
   * lleva la card: un asset sobrevive a su card (`card_id` pasa a null) y en
   * Biblioteca (F12) se sube sin card, y una llave no se puede renombrar.
   */
  async storeImage(input: {
    userId: string;
    cardId: string;
    chatId: string | null;
    data: Uint8Array;
    source: AssetRow["source"];
    metadata?: Partial<AssetMetadata>;
  }): Promise<StoredAsset> {
    const image = await inspectImage(input.data);
    const id = randomUUID();
    const storageKey = `${input.userId}/${id}.${extensionFor(image.mimeType)}`;
    await this.storage.put(storageKey, input.data, image.mimeType);
    const metadata: AssetMetadata = {
      ...input.metadata,
      width: image.width,
      height: image.height,
    };
    return {
      id,
      userId: input.userId,
      chatId: input.chatId,
      cardId: input.cardId,
      storageKey,
      mimeType: image.mimeType,
      sizeBytes: input.data.byteLength,
      source: input.source,
      metadata,
    };
  }

  /** El segundo paso: la fila, en la transacción del llamador. */
  record(tx: Tx, stored: StoredAsset): Promise<AssetRow> {
    return this.repo.insert(tx, stored);
  }

  /** Cómo entregarle el archivo al navegador, o `null` si no existe o no es suyo. */
  async deliver(
    userId: string,
    assetId: string,
  ): Promise<{ delivery: AssetDelivery; mimeType: string } | null> {
    const row = await this.dbService.runWithTenant(userId, (tx) => this.repo.findById(tx, assetId));
    if (!row) return null;
    return {
      delivery: await this.storage.deliver(row.storageKey, row.mimeType),
      mimeType: row.mimeType,
    };
  }
}
