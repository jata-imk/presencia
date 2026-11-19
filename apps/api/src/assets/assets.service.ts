import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { DbService, type Tx } from "../db/db.service.js";
import { ASSET_STORAGE, type AssetDelivery, type AssetStorage } from "./asset-storage.js";
import {
  AssetsRepository,
  type AssetMetadata,
  type AssetRow,
  type AssetWithOrigin,
  type InsertAssetInput,
} from "./assets.repository.js";
import { downloadNameFor } from "./download-name.js";
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
    /** Dónde nació. Null: se subió directo a Biblioteca (F12), sin card. */
    cardId: string | null;
    chatId: string | null;
    data: Uint8Array;
    source: AssetRow["source"];
    metadata?: Partial<AssetMetadata>;
    /** F10.6.1: el slide donde nace (sus versiones son las de ese slide). */
    slideId?: string | null;
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
      slideId: input.slideId ?? null,
      storageKey,
      mimeType: image.mimeType,
      sizeBytes: input.data.byteLength,
      source: input.source,
      metadata,
    };
  }

  /**
   * Los bytes de un asset, para editarlo (la imagen de referencia) o, en F10
   * PR5, subirlo al proveedor de publicación.
   */
  readBytes(row: AssetRow): Promise<Uint8Array> {
    return this.storage.get(row.storageKey);
  }

  /**
   * El historial de imágenes de una card (las que nacieron en ella y las que
   * trajo de Biblioteca), en la transacción del llamador.
   */
  listByCard(tx: Tx, cardId: string): Promise<AssetWithOrigin[]> {
    return this.repo.listByCard(tx, cardId);
  }

  /** Si la imagen está en el historial de la card (ver el repositorio). */
  inCardHistory(tx: Tx, cardId: string, asset: AssetRow): Promise<boolean> {
    return this.repo.inCardHistory(tx, cardId, asset);
  }

  /** Anota que la card trajo esta imagen de Biblioteca (ver el repositorio). */
  notePick(
    tx: Tx,
    pick: { userId: string; cardId: string; assetId: string; slideId: string | null },
  ): Promise<void> {
    return this.repo.notePick(tx, pick);
  }

  /** Los recortes de carrusel de una imagen, de cualquier card. */
  findCrops(tx: Tx, rootId: string): Promise<AssetRow[]> {
    return this.repo.findCrops(tx, rootId);
  }

  /** Texto alternativo: `null` si el asset no existe o no es suyo (RLS). */
  async updateAlt(userId: string, assetId: string, alt: string): Promise<AssetRow | null> {
    const row = await this.dbService.runWithTenant(userId, (tx) =>
      this.repo.updateAlt(tx, assetId, alt),
    );
    return row ?? null;
  }

  /** Un asset por id, en la transacción del llamador (RLS: uno ajeno no existe). */
  find(tx: Tx, id: string): Promise<AssetRow | undefined> {
    return this.repo.findById(tx, id);
  }

  /** Un asset que se va a poner en una card, bloqueado contra un borrado a la vez. */
  findForUse(tx: Tx, id: string): Promise<AssetRow | undefined> {
    return this.repo.findForUse(tx, id);
  }

  /** La imagen y sus recortes, bloqueados para eliminarlos (ver el repositorio). */
  lockForDelete(tx: Tx, id: string): Promise<AssetRow[]> {
    return this.repo.lockForDelete(tx, id);
  }

  /** Borra las filas. Los bytes se borran después del commit con `deleteObjects`. */
  deleteRows(tx: Tx, ids: readonly string[]): Promise<void> {
    return this.repo.deleteByIds(tx, ids);
  }

  isBeingEdited(tx: Tx, ids: readonly string[], staleBefore: Date): Promise<boolean> {
    return this.repo.isBeingEdited(tx, ids, staleBefore);
  }

  /**
   * Borra los bytes de assets cuyas filas ya no existen. Nunca lanza: se
   * llama después del commit, cuando la imagen ya se fue de Biblioteca. Un
   * archivo que no se pudo borrar queda como bytes sin fila, invisibles (la
   * basura barata de arriba). Mismo trato que los adjuntos (F10.9).
   */
  async deleteObjects(storageKeys: readonly string[]): Promise<void> {
    const results = await Promise.allSettled(storageKeys.map((key) => this.storage.delete(key)));
    const reasons = results.flatMap((r) => (r.status === "rejected" ? [r.reason as unknown] : []));
    if (reasons.length > 0) {
      console.error(
        `[biblioteca] No se pudieron borrar ${reasons.length} de ${storageKeys.length} archivos:`,
        reasons,
      );
    }
  }

  /** El segundo paso: la fila, en la transacción del llamador. */
  record(tx: Tx, stored: StoredAsset): Promise<AssetRow> {
    return this.repo.insert(tx, stored);
  }

  /**
   * Cómo entregarle el archivo al navegador, o `null` si no existe o no es
   * suyo. Con `download` (F12, "Descargar" de Biblioteca) va para guardarse,
   * con un nombre de archivo: el que traía al subirse o, si la dibujó un
   * generador, uno armado con su id.
   */
  async deliver(
    userId: string,
    assetId: string,
    options: { download?: boolean } = {},
  ): Promise<{ delivery: AssetDelivery; mimeType: string; downloadName: string | null } | null> {
    const row = await this.dbService.runWithTenant(userId, (tx) => this.repo.findById(tx, assetId));
    if (!row) return null;
    const downloadName = options.download ? downloadNameFor(row) : null;
    return {
      delivery: await this.storage.deliver(row.storageKey, row.mimeType, downloadName ?? undefined),
      mimeType: row.mimeType,
      downloadName,
    };
  }
}
