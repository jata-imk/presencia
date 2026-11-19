import { Injectable } from "@nestjs/common";
import { and, asc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { FIRST_SLIDE_ID } from "@presencia/shared";
import { assets, cardAssetPicks, imageGenerations } from "../db/schema.js";
import type { Tx } from "../db/db.service.js";

// Todo acceso a `assets` vive aquí. Sin filtro por user_id: el RLS de la
// transacción es el filtro (ADR-003), y por eso un id ajeno simplemente no
// existe para quien lo pide.

export type AssetRow = typeof assets.$inferSelect;
export type InsertAssetInput = typeof assets.$inferInsert;

/** Lo que se guarda en `assets.metadata` (jsonb, sin schema en la base). */
export interface AssetMetadata {
  width: number;
  height: number;
  /** El nombre del archivo que subió el usuario, si lo subió él. */
  originalName?: string;
  /**
   * Texto alternativo. Las generadas nacen con la descripción que se pidió;
   * las subidas, sin él (no sabemos qué muestran) hasta que el usuario lo
   * escriba.
   */
  alt?: string;
  /**
   * F10.6: esta imagen es un recorte de `croppedFrom` (el recorte del
   * carrusel). Recortar otra vez parte de la original, no del recorte: pasar
   * 4:5 → 1:1 → 4:5 regresa a la original en vez de cortar dos veces.
   */
  croppedFrom?: string;
  /** F10.9: copiada de una imagen que el creator adjuntó en el chat. */
  fromAttachmentId?: string;
}

/** Un asset con lo que se sabe de cómo nació (si lo dibujó un generador). */
export interface AssetWithOrigin {
  asset: AssetRow;
  kind: "generate" | "edit" | null;
  instruction: string | null;
  parentAssetId: string | null;
}

@Injectable()
export class AssetsRepository {
  async insert(tx: Tx, input: InsertAssetInput): Promise<AssetRow> {
    const [row] = await tx.insert(assets).values(input).returning();
    if (!row) throw new Error("No se pudo registrar el asset");
    return row;
  }

  async findById(tx: Tx, id: string): Promise<AssetRow | undefined> {
    const [row] = await tx.select().from(assets).where(eq(assets.id, id));
    return row;
  }

  /**
   * Un asset que se va a PONER en una card (F12): lo lee con `for key share`,
   * el lock más débil que choca con eliminarlo. Si Biblioteca lo está
   * eliminando, espera y no lo encuentra; si lo encuentra, el borrado espera
   * a que la card ya lo tenga puesto y lo ve como uso. Sin esto, la card se
   * podía quedar apuntando a un asset recién borrado.
   */
  async findForUse(tx: Tx, id: string): Promise<AssetRow | undefined> {
    const [row] = await tx.select().from(assets).where(eq(assets.id, id)).for("key share");
    return row;
  }

  /**
   * Para eliminar (F12): la imagen y sus recortes de carrusel, bloqueados
   * con `for update` ANTES de leer dónde se usan. Quien llama revisa que la
   * pedida venga y no sea un recorte: un recorte se va con su original.
   */
  async lockForDelete(tx: Tx, id: string): Promise<AssetRow[]> {
    return tx
      .select()
      .from(assets)
      .where(or(eq(assets.id, id), sql`${assets.metadata} ->> 'croppedFrom' = ${id}`))
      .orderBy(asc(assets.id))
      .for("update");
  }

  async deleteByIds(tx: Tx, ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await tx.delete(assets).where(inArray(assets.id, [...ids]));
  }

  /**
   * Si hay una edición en curso que parte de alguna de estas imágenes. Una
   * `pending` más vieja que `staleBefore` es de un trabajo que murió sin
   * liquidarse: no bloquea para siempre.
   */
  async isBeingEdited(tx: Tx, ids: readonly string[], staleBefore: Date): Promise<boolean> {
    if (ids.length === 0) return false;
    const [row] = await tx
      .select({ id: imageGenerations.id })
      .from(imageGenerations)
      .where(
        and(
          inArray(imageGenerations.parentAssetId, [...ids]),
          eq(imageGenerations.status, "pending"),
          gte(imageGenerations.createdAt, staleBefore),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  /**
   * El historial de versiones de una card, de la más vieja a la más nueva,
   * con su origen: las imágenes que nacieron en ella y las que trajo de
   * Biblioteca (F12 PR5). El join a la generación es a la izquierda porque
   * las subidas no tienen fila de generación.
   *
   * Una traída vale por su pick: su `slideId` es el slide de ESTA card al que
   * entró (el de su asset es el de la card donde nació) y su fecha, la de
   * cuando entró, para que la tira la ponga donde el creator la trajo y no al
   * principio. Una que nació aquí y se trajo a OTRO slide de esta card sale
   * dos veces, una en cada slide (la tira de cada slide filtra por el suyo);
   * en el mismo slide, una sola, como nacida.
   */
  async listByCard(tx: Tx, cardId: string): Promise<AssetWithOrigin[]> {
    const origin = {
      asset: assets,
      kind: imageGenerations.kind,
      instruction: imageGenerations.instruction,
      parentAssetId: imageGenerations.parentAssetId,
    };
    const born = await tx
      .select(origin)
      .from(assets)
      .leftJoin(imageGenerations, eq(imageGenerations.assetId, assets.id))
      .where(eq(assets.cardId, cardId));
    const picked = await tx
      .select({
        ...origin,
        pickSlideId: cardAssetPicks.slideId,
        pickedAt: cardAssetPicks.createdAt,
      })
      .from(cardAssetPicks)
      .innerJoin(assets, eq(assets.id, cardAssetPicks.assetId))
      .leftJoin(imageGenerations, eq(imageGenerations.assetId, assets.id))
      .where(eq(cardAssetPicks.cardId, cardId));
    const slideOf = (id: string | null) => id ?? FIRST_SLIDE_ID;
    const bornSlide = new Map(born.map((r) => [r.asset.id, slideOf(r.asset.slideId)]));
    const rows: AssetWithOrigin[] = [
      ...born,
      ...picked
        .filter((r) => bornSlide.get(r.asset.id) !== slideOf(r.pickSlideId))
        .map(({ pickSlideId, pickedAt, ...r }) => ({
          ...r,
          asset: { ...r.asset, slideId: pickSlideId, createdAt: pickedAt },
        })),
    ];
    return rows.sort(
      (a, b) =>
        a.asset.createdAt.getTime() - b.asset.createdAt.getTime() ||
        a.asset.id.localeCompare(b.asset.id),
    );
  }

  /**
   * Si la imagen está en el historial de la card (nació en ella o la trajo
   * de Biblioteca): lo que se puede elegir desde su tira de versiones.
   */
  async inCardHistory(tx: Tx, cardId: string, asset: AssetRow): Promise<boolean> {
    if (asset.cardId === cardId) return true;
    const [row] = await tx
      .select({ assetId: cardAssetPicks.assetId })
      .from(cardAssetPicks)
      .where(and(eq(cardAssetPicks.cardId, cardId), eq(cardAssetPicks.assetId, asset.id)));
    return Boolean(row);
  }

  /**
   * F12 PR5: anota que la card trajo esta imagen de Biblioteca, para que siga
   * en su historial aunque la reemplace. Traerla otra vez solo cambia el slide
   * y la fecha.
   */
  async notePick(
    tx: Tx,
    pick: { userId: string; cardId: string; assetId: string; slideId: string | null },
  ): Promise<void> {
    await tx
      .insert(cardAssetPicks)
      .values(pick)
      .onConflictDoUpdate({
        target: [cardAssetPicks.cardId, cardAssetPicks.assetId],
        set: { slideId: pick.slideId, createdAt: sql`now()` },
      });
  }

  /**
   * Los recortes de carrusel de una imagen (`metadata.croppedFrom`), de
   * cualquier card: "Usar de Biblioteca" reutiliza uno en la proporción que
   * pide el carrusel en vez de recortar otra vez.
   */
  async findCrops(tx: Tx, rootId: string): Promise<AssetRow[]> {
    return tx
      .select()
      .from(assets)
      .where(sql`${assets.metadata} ->> 'croppedFrom' = ${rootId}`)
      .orderBy(asc(assets.createdAt));
  }

  /** Cambia el texto alternativo sin tocar el resto de la metadata. */
  async updateAlt(tx: Tx, id: string, alt: string): Promise<AssetRow | undefined> {
    const [row] = await tx
      .update(assets)
      .set({ metadata: sql`jsonb_set(${assets.metadata}, '{alt}', to_jsonb(${alt}::text))` })
      .where(eq(assets.id, id))
      .returning();
    return row;
  }
}
