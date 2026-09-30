import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import type { Request } from "express";
import { eq, inArray } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  FIRST_SLIDE_ID,
  type CardContent,
  type CardImageJob,
  type SocialNetwork,
} from "@presencia/shared";
import { assets, chats, publicationCards, users } from "../db/schema.js";
import { solidPng } from "../images/fake-image.provider.js";
import { LocalAssetStorage } from "../assets/asset-storage.js";
import { readRawBody } from "../assets/read-body.js";
import type { DbService as DbServiceType } from "../db/db.service.js";
import type { AssetsService as AssetsServiceType } from "../assets/assets.service.js";
import type { CardMediaService as CardMediaServiceType } from "./card-media.service.js";

// "Subir propia" (F10 PR2) contra Postgres real: lo que se prueba es que la
// fila del asset y la imagen de la card cambian juntas, que el RLS no deja
// ver ni tocar lo ajeno, y que la card avisa al stream. El storage es el de
// disco, en una carpeta temporal.

let dbService: DbServiceType;
let assetsService: AssetsServiceType;
let media: CardMediaServiceType;
let storageDir: string;
let userA: string;
let userB: string;
let chatA: string;

const PNG = solidPng(40, 50, [200, 80, 120]);

const VISUAL: CardContent = { archetype: "visual_first", caption: "c", hashtags: [], assetIds: [] };
const TEXT: CardContent = { archetype: "text_first", body: "b", hashtags: [], assetIds: [] };
const VIDEO: CardContent = {
  archetype: "video_script",
  hook: "h",
  script: "s",
  caption: "c",
  hashtags: [],
  assetIds: [],
};

async function createCard(
  content: CardContent,
  status: "draft" | "scheduled" = "draft",
  network?: SocialNetwork,
): Promise<string> {
  return dbService.runWithTenant(userA, async (tx) => {
    const [row] = await tx
      .insert(publicationCards)
      .values({
        userId: userA,
        chatId: chatA,
        network: network ?? (content.archetype === "text_first" ? "linkedin" : "instagram"),
        archetype: content.archetype,
        content,
        status,
        scheduledAt: status === "scheduled" ? new Date(Date.now() + 3_600_000) : null,
      })
      .returning({ id: publicationCards.id });
    if (!row) throw new Error("No se pudo crear la card de prueba");
    return row.id;
  });
}

describe("CardMediaService.attachUpload", { timeout: 30_000 }, () => {
  beforeAll(async () => {
    try {
      process.loadEnvFile("../../.env");
    } catch {
      // sin .env: se usa el process.env tal cual (CI)
    }
    const { DbService } = await import("../db/db.service.js");
    const { CardsRepository } = await import("./cards.repository.js");
    const { AssetsRepository } = await import("../assets/assets.repository.js");
    const { AssetsService } = await import("../assets/assets.service.js");
    const { CardMediaService } = await import("./card-media.service.js");

    storageDir = await mkdtemp(path.join(tmpdir(), "presencia-assets-"));
    dbService = new DbService();
    assetsService = new AssetsService(
      dbService,
      new AssetsRepository(),
      new LocalAssetStorage(storageDir),
    );
    media = new CardMediaService(dbService, new CardsRepository(), assetsService);

    const [a, b] = await dbService.db
      .insert(users)
      .values([
        { name: "Media A", email: `media-a-${randomUUID()}@test.local` },
        { name: "Media B", email: `media-b-${randomUUID()}@test.local` },
      ])
      .returning({ id: users.id });
    if (!a || !b) throw new Error("No se pudieron crear los usuarios de prueba");
    userA = a.id;
    userB = b.id;
    chatA = await dbService.runWithTenant(userA, async (tx) => {
      const [chat] = await tx.insert(chats).values({ userId: userA }).returning({ id: chats.id });
      if (!chat) throw new Error("No se pudo crear el chat de prueba");
      return chat.id;
    });
  });

  afterAll(async () => {
    await dbService.db.delete(users).where(inArray(users.id, [userA, userB]));
    await dbService.onModuleDestroy();
    await rm(storageDir, { recursive: true, force: true });
  });

  it("guarda la imagen, la deja elegida en la card y avisa al stream", async () => {
    const cardId = await createCard(VISUAL);
    const listener = new pg.Client({ connectionString: process.env.APP_DATABASE_URL });
    const avisos: string[] = [];
    await listener.connect();
    listener.on("notification", (n) => avisos.push(n.payload ?? ""));
    await listener.query("LISTEN card_changed");

    try {
      const dto = await media.attachUpload(userA, cardId, PNG, "mi foto.png");

      expect(dto.content.assetIds).toHaveLength(1);
      const assetId = dto.content.assetIds[0]!;
      const row = await dbService.runWithTenant(userA, async (tx) => {
        const [found] = await tx.select().from(assets).where(eq(assets.id, assetId));
        return found;
      });
      expect(row).toMatchObject({
        cardId,
        chatId: chatA,
        source: "uploaded",
        mimeType: "image/png",
        sizeBytes: PNG.byteLength,
        metadata: { width: 40, height: 50, originalName: "mi foto.png" },
      });
      expect(row?.storageKey).toBe(`${userA}/${assetId}.png`);
      expect(existsSync(path.join(storageDir, row!.storageKey))).toBe(true);

      await expect.poll(() => avisos.some((a) => a.includes(cardId))).toBe(true);
    } finally {
      await listener.end();
    }
  });

  it("una card de texto también acepta imagen (la acompañante de LinkedIn/X/Threads)", async () => {
    const cardId = await createCard(TEXT);
    const dto = await media.attachUpload(userA, cardId, PNG);
    expect(dto.content.archetype).toBe("text_first");
    expect(dto.content.assetIds).toHaveLength(1);
  });

  it("subir otra reemplaza la elegida", async () => {
    const cardId = await createCard(VISUAL);
    const first = await media.attachUpload(userA, cardId, PNG);
    const second = await media.attachUpload(userA, cardId, solidPng(10, 10, [1, 2, 3]));
    expect(second.content.assetIds).toHaveLength(1);
    expect(second.content.assetIds[0]).not.toBe(first.content.assetIds[0]);
  });

  it("subir la propia limpia el aviso de un intento fallido", async () => {
    const cardId = await createCard(VISUAL);
    await dbService.runWithTenant(userA, (tx) =>
      tx
        .update(publicationCards)
        .set({
          imageJob: {
            id: randomUUID(),
            status: "failed",
            provider: "primary",
            kind: "generate",
            aspectRatio: "4:5",
            assetIds: [],
            startedAt: new Date().toISOString(),
          },
        })
        .where(eq(publicationCards.id, cardId)),
    );
    const dto = await media.attachUpload(userA, cardId, PNG);
    expect(dto.imageJob).toBeNull();
  });

  it("el historial trae todas las imágenes de la card, de la más vieja a la más nueva", async () => {
    const cardId = await createCard(VISUAL);
    const a = await media.attachUpload(userA, cardId, PNG, "uno.png");
    const b = await media.attachUpload(userA, cardId, solidPng(10, 10, [9, 9, 9]));
    const versions = await media.versions(userA, cardId);
    expect(versions.map((v) => v.assetId)).toEqual([a.content.assetIds[0], b.content.assetIds[0]]);
    expect(versions[0]).toMatchObject({ source: "uploaded", kind: null, alt: null });
    await expect(media.versions(userB, cardId)).rejects.toThrow(/No encontramos/);
  });

  it("el texto alternativo se guarda y no se puede tocar el ajeno", async () => {
    const cardId = await createCard(VISUAL);
    const dto = await media.attachUpload(userA, cardId, PNG);
    const assetId = dto.content.assetIds[0]!;
    expect(await assetsService.updateAlt(userB, assetId, "intruso")).toBeNull();
    expect(
      await assetsService.updateAlt(userA, assetId, "Taza de café en la barra"),
    ).not.toBeNull();
    const [version] = await media.versions(userA, cardId);
    expect(version!.alt).toBe("Taza de café en la barra");
  });

  it("subir o elegir otra borra un 'generando' que ya pasó el corte", async () => {
    const cardId = await createCard(VISUAL);
    const stale = {
      id: randomUUID(),
      status: "generating",
      provider: "primary",
      kind: "generate",
      aspectRatio: "4:5",
      assetIds: [],
      startedAt: new Date(Date.now() - 6 * 60_000).toISOString(),
    };
    const setJob = () =>
      dbService.runWithTenant(userA, (tx) =>
        tx.update(publicationCards).set({ imageJob: stale }).where(eq(publicationCards.id, cardId)),
      );

    await setJob();
    const uploaded = await media.attachUpload(userA, cardId, PNG);
    expect(uploaded.imageJob).toBeNull();

    await setJob();
    const selected = await media.selectImage(userA, cardId, uploaded.content.assetIds[0]!);
    expect(selected.imageJob).toBeNull();
  });

  it("un guion de video no lleva imagen", async () => {
    const cardId = await createCard(VIDEO);
    await expect(media.attachUpload(userA, cardId, PNG)).rejects.toThrow(/guion de video/);
  });

  it("una card programada no cambia de imagen, y no deja fila huérfana", async () => {
    const cardId = await createCard(VISUAL, "scheduled");
    await expect(media.attachUpload(userA, cardId, PNG)).rejects.toThrow(/ya está programada/);
    const filas = await dbService.runWithTenant(userA, (tx) =>
      tx.select().from(assets).where(eq(assets.cardId, cardId)),
    );
    expect(filas).toHaveLength(0);
  });

  it("un archivo que no es imagen se rechaza aunque diga serlo", async () => {
    const cardId = await createCard(VISUAL);
    const falso = new TextEncoder().encode("<svg onload=alert(1)>no soy un png</svg>");
    await expect(media.attachUpload(userA, cardId, falso)).rejects.toThrow(/JPG, PNG o WebP/);
  });

  it("la card y la imagen de otro usuario no existen para él", async () => {
    const cardId = await createCard(VISUAL);
    await expect(media.attachUpload(userB, cardId, PNG)).rejects.toThrow(/No encontramos/);

    const dto = await media.attachUpload(userA, cardId, PNG);
    const assetId = dto.content.assetIds[0]!;
    await expect(assetsService.deliver(userB, assetId)).resolves.toBeNull();
    const propio = await assetsService.deliver(userA, assetId);
    expect(propio?.mimeType).toBe("image/png");
    expect(propio?.delivery).toMatchObject({ kind: "bytes" });
    if (propio?.delivery.kind === "bytes") {
      expect(Buffer.from(propio.delivery.data).equals(Buffer.from(PNG))).toBe(true);
    }
  });

  // ── selectImage ──

  it("elige otra imagen de la misma card", async () => {
    const cardId = await createCard(VISUAL);
    const first = await media.attachUpload(userA, cardId, PNG);
    await media.attachUpload(userA, cardId, solidPng(10, 10, [1, 2, 3]));
    const back = await media.selectImage(userA, cardId, first.content.assetIds[0]!);
    expect(back.content.assetIds).toEqual(first.content.assetIds);
  });

  it("no acepta una imagen de otra card", async () => {
    const cardA = await createCard(VISUAL);
    const cardB = await createCard(VISUAL);
    const other = await media.attachUpload(userA, cardB, PNG);
    await expect(media.selectImage(userA, cardA, other.content.assetIds[0]!)).rejects.toThrow(
      /no es de esta publicación/,
    );
  });

  // ── F10.6: slides del carrusel ──

  /** Los slides de la card tal como quedaron en la DB. */
  async function slidesOfCard(cardId: string) {
    const content = await dbService.runWithTenant(userA, async (tx) => {
      const [row] = await tx.select().from(publicationCards).where(eq(publicationCards.id, cardId));
      return row!.content as CardContent;
    });
    return {
      assetIds: content.assetIds,
      slides: content.archetype === "video_script" ? undefined : content.slides,
      imagePrompt: "imagePrompt" in content ? content.imagePrompt : undefined,
    };
  }

  it("agregar un slide vuelve carrusel la imagen suelta, con lo que tenía de portada", async () => {
    const cardId = await createCard({ ...VISUAL, imagePrompt: "Tacos en la mesa" });
    const cover = (await media.attachUpload(userA, cardId, PNG)).content.assetIds[0]!;

    const dto = await media.addSlide(userA, cardId, { imagePrompt: "El trompo" });
    const slides = dto.content.archetype === "visual_first" ? dto.content.slides : undefined;
    expect(slides).toHaveLength(2);
    expect(slides![0]).toEqual({
      id: FIRST_SLIDE_ID,
      imagePrompt: "Tacos en la mesa",
      assetId: cover,
    });
    expect(slides![1]).toMatchObject({ imagePrompt: "El trompo" });
    expect(slides![1]!.assetId).toBeUndefined();
    // Un slide sin imagen no cuenta: assetIds sigue siendo solo la portada.
    expect(dto.content.assetIds).toEqual([cover]);
  });

  it("subir y elegir a un slide lo pone en ESE slide y rederiva assetIds en orden", async () => {
    const cardId = await createCard(VISUAL);
    await media.addSlide(userA, cardId, {});
    const second = (await media.addSlide(userA, cardId, {})).content;
    const slides = second.archetype === "visual_first" ? second.slides! : [];
    const [, s2, s3] = slides;

    const up3 = await media.attachUpload(userA, cardId, PNG, undefined, s3!.id);
    const a3 = up3.content.assetIds[0]!;
    const up2 = await media.attachUpload(
      userA,
      cardId,
      solidPng(10, 10, [9, 9, 9]),
      undefined,
      s2!.id,
    );
    const a2 = up2.content.assetIds.find((id) => id !== a3)!;
    expect(up2.content.assetIds).toEqual([a2, a3]);

    // Elegir la imagen del slide 3 para el slide 2: cada slide tiene la suya.
    const moved = await media.selectImage(userA, cardId, a3, s2!.id);
    expect(moved.content.assetIds).toEqual([a3, a3]);
    const after = await slidesOfCard(cardId);
    expect(after.slides![0]!.assetId).toBeUndefined();
  });

  it("reordenar cambia la portada y el orden de assetIds; un orden incompleto es 409", async () => {
    const cardId = await createCard(VISUAL);
    await media.addSlide(userA, cardId, {});
    const dto = await media.addSlide(userA, cardId, {});
    const slides = dto.content.archetype === "visual_first" ? dto.content.slides! : [];
    const [s1, s2, s3] = slides.map((s) => s.id) as [string, string, string];
    const a1 = (await media.attachUpload(userA, cardId, PNG, undefined, s1)).content.assetIds[0]!;
    const a3 = (await media.attachUpload(userA, cardId, PNG, undefined, s3)).content.assetIds.at(
      -1,
    )!;

    const reordered = await media.reorderSlides(userA, cardId, [s3, s1, s2]);
    expect(reordered.content.assetIds).toEqual([a3, a1]);

    await expect(media.reorderSlides(userA, cardId, [s1, s2])).rejects.toThrow(/cambió/);
    await expect(media.reorderSlides(userA, cardId, [s1, s1, s2])).rejects.toThrow(/cambió/);
  });

  it("respeta el tope de imágenes de la red", async () => {
    const cardId = await createCard(TEXT, "draft", "x");
    for (let i = 0; i < 3; i++) await media.addSlide(userA, cardId, {});
    await expect(media.addSlide(userA, cardId, {})).rejects.toThrow(/hasta 4 imágenes/);
  });

  it("cambia el prompt de un slide", async () => {
    const cardId = await createCard(VISUAL);
    const dto = await media.addSlide(userA, cardId, {});
    const id = dto.content.archetype === "visual_first" ? dto.content.slides![1]!.id : "";
    await media.updateSlide(userA, cardId, id, "Nuevo prompt");
    expect((await slidesOfCard(cardId)).slides![1]!.imagePrompt).toBe("Nuevo prompt");
    await expect(media.updateSlide(userA, cardId, randomUUID(), "x")).rejects.toThrow(/ya no está/);
  });

  it("quitar hasta dejar uno regresa a imagen suelta, con el prompt y la imagen del que quedó", async () => {
    const cardId = await createCard({ ...VISUAL, imagePrompt: "Portada" });
    const dto = await media.addSlide(userA, cardId, { imagePrompt: "Segundo" });
    const second = dto.content.archetype === "visual_first" ? dto.content.slides![1]! : null;
    const a2 = (await media.attachUpload(userA, cardId, PNG, undefined, second!.id)).content
      .assetIds[0]!;

    await media.deleteSlide(userA, cardId, FIRST_SLIDE_ID);
    const after = await slidesOfCard(cardId);
    expect(after.slides).toBeUndefined();
    expect(after.imagePrompt).toBe("Segundo");
    expect(after.assetIds).toEqual([a2]);
    // Una imagen suelta no es carrusel: no hay slide que quitar.
    await expect(media.deleteSlide(userA, cardId, FIRST_SLIDE_ID)).rejects.toThrow(
      /no es un carrusel/,
    );
  });

  it("no deja quitar un slide que se está generando", async () => {
    const cardId = await createCard(VISUAL);
    const dto = await media.addSlide(userA, cardId, {});
    const id = dto.content.archetype === "visual_first" ? dto.content.slides![1]!.id : "";
    const job: CardImageJob = {
      id: randomUUID(),
      status: "generating",
      provider: "primary",
      kind: "generate",
      aspectRatio: "4:5",
      slideIds: [id],
      assetIds: [],
      startedAt: new Date().toISOString(),
    };
    await dbService.runWithTenant(userA, (tx) =>
      tx.update(publicationCards).set({ imageJob: job }).where(eq(publicationCards.id, cardId)),
    );
    await expect(media.deleteSlide(userA, cardId, id)).rejects.toThrow(/generándose/);
    // Tampoco otro: quitar la portada devolvería la card a imagen suelta y el
    // slide que genera perdería su lugar.
    await expect(media.deleteSlide(userA, cardId, FIRST_SLIDE_ID)).rejects.toThrow(/generándose/);
    // Agregar sí: no cambia el id de ningún slide.
    await expect(media.addSlide(userA, cardId, {})).resolves.toBeDefined();
  });

  it("subir o elegir a un slide que no existe es 404, no un 200 vacío", async () => {
    const cardId = await createCard(VISUAL);
    await expect(media.attachUpload(userA, cardId, PNG, undefined, randomUUID())).rejects.toThrow(
      /ya no está/,
    );
    const up = await media.attachUpload(userA, cardId, PNG);
    await expect(
      media.selectImage(userA, cardId, up.content.assetIds[0]!, randomUUID()),
    ).rejects.toThrow(/ya no está/);
    // La imagen suelta sí tiene su slide implícito.
    await expect(
      media.selectImage(userA, cardId, up.content.assetIds[0]!, FIRST_SLIDE_ID),
    ).resolves.toBeDefined();
  });

  it("los slides de otro usuario no existen para él, y una card programada no cambia", async () => {
    const cardId = await createCard(VISUAL);
    await expect(media.addSlide(userB, cardId, {})).rejects.toThrow(/No encontramos/);
    const scheduled = await createCard(VISUAL, "scheduled");
    await expect(media.addSlide(userA, scheduled, {})).rejects.toThrow(/programada/);
  });
});

describe("readRawBody", () => {
  const req = (chunks: Buffer[], headers: Record<string, string> = {}) =>
    Object.assign(Readable.from(chunks), { headers }) as unknown as Request;

  it("junta el body completo", async () => {
    const body = await readRawBody(req([Buffer.from("ab"), Buffer.from("cd")]), 10);
    expect(Buffer.from(body).toString()).toBe("abcd");
  });

  it("corta antes de leer si el Content-Length ya se pasa, con el mensaje para el usuario", async () => {
    await expect(
      readRawBody(req([], { "content-length": String(14 * 1024 * 1024) }), 10 * 1024 * 1024),
    ).rejects.toMatchObject({
      response: {
        code: "file_too_large",
        message:
          "El límite es 10 MB. Tu archivo pesa 14 MB. Prueba comprimirlo o sube uno más pequeño.",
      },
    });
  });

  it("corta en cuanto se pasa aunque el Content-Length mienta", async () => {
    await expect(
      readRawBody(req([Buffer.alloc(6), Buffer.alloc(6)], { "content-length": "3" }), 10),
    ).rejects.toMatchObject({ status: 413 });
  });
});

describe("LocalAssetStorage", () => {
  it("no escribe fuera de su carpeta", async () => {
    const storage = new LocalAssetStorage(path.join(tmpdir(), "presencia-no-escape"));
    await expect(storage.put("../fuera.png", PNG)).rejects.toThrow(/Llave de asset inválida/);
  });
});
