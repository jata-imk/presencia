import { eq, inArray, sql } from "drizzle-orm";
import type { CardContent } from "@presencia/shared";
import type { AssetStorage } from "../src/assets/asset-storage.js";
import type { DbService } from "../src/db/db.service.js";
import { assets, chats, imageGenerations, publicationCards } from "../src/db/schema.js";
import { solidPng } from "../src/images/fake-image.provider.js";

// F12 Biblioteca: imágenes con la variedad que la pantalla tiene que mostrar.
// Un borrador de Instagram con su imagen elegida y dos variantes que no se
// eligieron (una es la original y otra una edición: el linaje de versiones),
// una publicación de LinkedIn ya publicada, una imagen generada hace semanas
// y dos subidas directo a Biblioteca, sin card ni chat. Tres proporciones.
//
// Se recrea en cada corrida, también con la cuenta ya existente: así lo que
// se borre probando Biblioteca vuelve. Las imágenes sembradas llevan
// `metadata.seed` para encontrarlas sin tocar las que el dev generó a mano.
//
// Sin card programada a propósito: una `scheduled` sembrada necesita
// provider_ref para que el reconciliador no la marque fallida (ver
// seedCalendar). Para probar que eliminar una imagen programada se bloquea
// (F12 PR 4) sirven las de seedCalendar: sus cards visuales programadas
// llevan imagen de verdad, y también aparecen en Biblioteca.

type Tx = Parameters<Parameters<DbService["runWithTenant"]>[1]>[0];

const TITULO = "Biblioteca: imágenes de ejemplo";
const SEED = "biblioteca";
const DIA = 86_400_000;

const visual = (caption: string, assetIds: string[]): CardContent => ({
  archetype: "visual_first",
  caption,
  hashtags: [],
  assetIds,
});

const texto = (body: string, assetIds: string[]): CardContent => ({
  archetype: "text_first",
  body,
  hashtags: [],
  assetIds,
});

interface Imagen {
  ancho: number;
  alto: number;
  color: [number, number, number];
  /** Hace cuántos días se creó. */
  haceDias: number;
  alt?: string;
  /** Subida por el creator, con este nombre de archivo. Sin él, generada. */
  subida?: string;
  /** Lo que pidió al generarla. */
  descripcion?: string;
  /** Si es una edición: qué se pidió y sobre cuál (su llave en IMAGENES). */
  edicion?: { instruccion: string; de: string };
}

const IMAGENES: Record<string, Imagen> = {
  cafeOriginal: {
    ancho: 216,
    alto: 270,
    color: [205, 180, 219],
    haceDias: 0.2,
    alt: "Taza de café sobre una mesa de madera, con dos personas al fondo.",
    descripcion: "Una taza de café de especialidad sobre una mesa de madera, luz de la mañana",
  },
  cafeCalida: {
    ancho: 216,
    alto: 270,
    color: [255, 200, 221],
    haceDias: 0.15,
    alt: "Taza de café sobre una mesa de madera, con luz cálida.",
    edicion: { instruccion: "Más cálida", de: "cafeOriginal" },
  },
  cafeSinGente: {
    ancho: 216,
    alto: 270,
    color: [255, 175, 204],
    haceDias: 0.1,
    alt: "Taza de café humeante sobre una mesa de madera, sin personas.",
    edicion: { instruccion: "Quita a las personas del fondo", de: "cafeCalida" },
  },
  escritorio: {
    ancho: 320,
    alto: 180,
    color: [189, 224, 254],
    haceDias: 3,
    alt: "Escritorio minimalista con una laptop, una taza y una planta.",
    descripcion: "Un escritorio minimalista con laptop, taza y una planta, vista desde arriba",
  },
  acuarela: {
    ancho: 240,
    alto: 240,
    color: [162, 210, 255],
    haceDias: 20,
    alt: "Fondo de acuarela en lila y azul cielo.",
    descripcion: "Fondo de acuarela lila y azul cielo para una cita, estilo acuarela",
  },
  fotoTaller: {
    ancho: 240,
    alto: 240,
    color: [232, 221, 238],
    haceDias: 2,
    subida: "IMG_4821.jpg",
  },
  logo: {
    ancho: 240,
    alto: 240,
    color: [61, 38, 69],
    haceDias: 12,
    subida: "logo-taller.png",
  },
};

export interface BibliotecaSembrada {
  imagenes: number;
  cards: number;
}

export async function seedBiblioteca(
  tx: Tx,
  userId: string,
  storage: AssetStorage,
): Promise<BibliotecaSembrada> {
  // Lo de la corrida anterior. Las cards primero: borrar el chat las dejaría
  // huérfanas en el calendario.
  const previos = await tx.select({ id: chats.id }).from(chats).where(eq(chats.title, TITULO));
  const chatIds = previos.map((chat) => chat.id);
  if (chatIds.length > 0) {
    await tx.delete(publicationCards).where(inArray(publicationCards.chatId, chatIds));
    await tx.delete(chats).where(inArray(chats.id, chatIds));
  }
  // Las generaciones antes que sus imágenes: su FK es SET NULL, así que
  // borrar solo los assets dejaría cinco filas huérfanas más en cada corrida.
  await tx.delete(imageGenerations).where(
    sql`${imageGenerations.assetId} in (
      select ${assets.id} from ${assets} where ${assets.metadata} ->> 'seed' = ${SEED}
    )`,
  );
  // Las que dejaron las corridas anteriores a este arreglo.
  await tx
    .delete(imageGenerations)
    .where(sql`${imageGenerations.model} = 'seed' and ${imageGenerations.assetId} is null`);
  const viejas = await tx
    .delete(assets)
    .where(sql`${assets.metadata} ->> 'seed' = ${SEED}`)
    .returning({ storageKey: assets.storageKey });
  await Promise.allSettled(viejas.map((row) => storage.delete(row.storageKey)));

  const [chat] = await tx
    .insert(chats)
    .values({ userId, title: TITULO, lastMessageAt: new Date(Date.now() - 2 * 3_600_000) })
    .returning({ id: chats.id });
  if (!chat) throw new Error("No se pudo crear el chat de Biblioteca");

  const [borrador, publicada] = await tx
    .insert(publicationCards)
    .values([
      {
        userId,
        chatId: chat.id,
        archetype: "visual_first",
        network: "instagram",
        status: "draft",
        content: visual("El café de la mañana sabe mejor sin prisa.", []),
      },
      {
        userId,
        chatId: chat.id,
        archetype: "text_first",
        network: "linkedin",
        status: "published",
        content: texto("Mi escritorio cambió cómo trabajo: menos cosas, más foco.", []),
        scheduledAt: new Date(Date.now() - 3 * DIA),
        publishedAt: new Date(Date.now() - 3 * DIA),
      },
    ])
    .returning({ id: publicationCards.id });
  if (!borrador || !publicada) throw new Error("No se pudieron crear las cards de Biblioteca");

  // Dónde nació cada una. Las que no están aquí no nacieron en ninguna card.
  const cardDe: Record<string, string> = {
    cafeOriginal: borrador.id,
    cafeCalida: borrador.id,
    cafeSinGente: borrador.id,
    escritorio: publicada.id,
  };

  const ids: Record<string, string> = {};
  for (const [llave, imagen] of Object.entries(IMAGENES)) {
    const id = crypto.randomUUID();
    ids[llave] = id;
    const data = solidPng(imagen.ancho, imagen.alto, imagen.color);
    const storageKey = `${userId}/${id}.png`;
    await storage.put(storageKey, data, "image/png");
    const creada = new Date(Date.now() - imagen.haceDias * DIA);
    const cardId = cardDe[llave] ?? null;
    await tx.insert(assets).values({
      id,
      userId,
      cardId,
      // La acuarela se generó suelta hace semanas: sin card, pero con su chat.
      chatId: cardId || llave === "acuarela" ? chat.id : null,
      storageKey,
      mimeType: "image/png",
      sizeBytes: data.byteLength,
      source: imagen.subida ? "uploaded" : "generated",
      metadata: {
        width: imagen.ancho,
        height: imagen.alto,
        seed: SEED,
        ...(imagen.alt ? { alt: imagen.alt } : {}),
        ...(imagen.subida ? { originalName: imagen.subida } : {}),
      },
      createdAt: creada,
    });
    if (imagen.subida) continue;
    const padre = imagen.edicion ? ids[imagen.edicion.de] : undefined;
    await tx.insert(imageGenerations).values({
      userId,
      cardId,
      batchId: crypto.randomUUID(),
      kind: imagen.edicion ? "edit" : "generate",
      providerSlot: "1",
      provider: "fake",
      model: "seed",
      prompt: imagen.edicion?.instruccion ?? `Qué se ve: ${imagen.descripcion ?? ""}`,
      description: imagen.descripcion ?? null,
      instruction: imagen.edicion?.instruccion ?? null,
      parentAssetId: padre ?? null,
      aspectRatio:
        imagen.ancho === imagen.alto ? "1:1" : imagen.ancho > imagen.alto ? "16:9" : "4:5",
      status: "succeeded",
      assetId: id,
      createdAt: creada,
      settledAt: creada,
    });
  }

  // La elegida del borrador es la última edición; las otras dos quedan como
  // variantes descartadas.
  await tx
    .update(publicationCards)
    .set({ content: visual("El café de la mañana sabe mejor sin prisa.", [ids.cafeSinGente!]) })
    .where(eq(publicationCards.id, borrador.id));
  await tx
    .update(publicationCards)
    .set({
      content: texto("Mi escritorio cambió cómo trabajo: menos cosas, más foco.", [
        ids.escritorio!,
      ]),
    })
    .where(eq(publicationCards.id, publicada.id));

  return { imagenes: Object.keys(IMAGENES).length, cards: 2 };
}
