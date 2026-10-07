import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  FIRST_SLIDE_ID,
  IMAGE_STYLE_IDS,
  imageStyleDef,
  type CardContent,
  type CardImageJob,
} from "@presencia/shared";
import { LocalAssetStorage } from "../assets/asset-storage.js";
import {
  aiUsageEvents,
  assets,
  chats,
  creditLedger,
  imageGenerations,
  publicationCards,
  users,
} from "../db/schema.js";
import type { DbService as DbServiceType } from "../db/db.service.js";
import type { BossService } from "../jobs/boss.service.js";
import { FAKE_BLOCK_MARKER, FakeImageProvider } from "./fake-image.provider.js";
import { fitToAspect, nearestAspect } from "./image-fit.js";
import {
  composeEditPrompt,
  composeImagePrompt,
  NO_TEXT_NO_LOGOS,
  STYLE_LEAD,
} from "./image-prompt.js";
import type { ImageProviders, ImageRequest, ImageResult } from "./image-provider.js";
import type {
  ImageGenerationJob,
  ImageGenerationService as ServiceType,
} from "./image-generation.service.js";

// Generar la imagen de una card (F10 PR3) contra Postgres real y el generador
// de mentira. Lo que se prueba es el contrato de dinero y de estado: se cobra
// por imagen entregada y nada más, el doble click no duplica, y la card
// termina diciendo cómo terminó.

let dbService: DbServiceType;
let storageDir: string;
let userId: string;
let chatId: string;
let enqueue: ReturnType<typeof vi.fn>;
// Los fuertes no importan para la mayoría de los tests: sin ellos, ninguno medido.
let make: (
  providers: Omit<ImageProviders, "strengths"> & Partial<Pick<ImageProviders, "strengths">>,
) => ServiceType;

const VISUAL: CardContent = {
  archetype: "visual_first",
  caption: "Café Xtabay abre sus puertas",
  hashtags: [],
  imagePrompt: "Taza de café de olla en una mesa de madera",
  assetIds: [],
};

async function createCard(content: CardContent = VISUAL): Promise<string> {
  return dbService.runWithTenant(userId, async (tx) => {
    const [row] = await tx
      .insert(publicationCards)
      .values({ userId, chatId, network: "instagram", archetype: content.archetype, content })
      .returning({ id: publicationCards.id });
    return row!.id;
  });
}

async function card(cardId: string) {
  return dbService.runWithTenant(userId, async (tx) => {
    const [row] = await tx.select().from(publicationCards).where(eq(publicationCards.id, cardId));
    return row!;
  });
}

async function ledgerFor(ids: string[]) {
  if (ids.length === 0) return [];
  return dbService.runWithTenant(userId, (tx) =>
    tx
      .select()
      .from(creditLedger)
      .where(
        and(eq(creditLedger.reason, "image_generation"), inArray(creditLedger.referenceId, ids)),
      ),
  );
}

async function batchRows(batchId: string) {
  return dbService.runWithTenant(userId, (tx) =>
    tx.select().from(imageGenerations).where(eq(imageGenerations.batchId, batchId)),
  );
}

/** Genera la primera vez y truena la segunda: un slide sale y el otro no. */
class HalfFailingProvider extends FakeImageProvider {
  private calls = 0;
  override generate(request: ImageRequest): Promise<ImageResult> {
    this.calls += 1;
    if (this.calls % 2 === 0) return Promise.reject(new Error("proveedor caído"));
    return super.generate(request);
  }
}

const fake = () => ({ generators: [new FakeImageProvider()] });

describe("ImageGenerationService", { timeout: 30_000 }, () => {
  beforeAll(async () => {
    try {
      process.loadEnvFile("../../.env");
    } catch {
      // sin .env: se usa el process.env tal cual (CI)
    }
    const { DbService } = await import("../db/db.service.js");
    const { CardsRepository } = await import("../cards/cards.repository.js");
    const { AssetsRepository } = await import("../assets/assets.repository.js");
    const { AssetsService } = await import("../assets/assets.service.js");
    const { CreditsRepository } = await import("../credits/credits.repository.js");
    const { CreditsService } = await import("../credits/credits.service.js");
    const { AiUsageRepository } = await import("../ai/ai-usage.repository.js");
    const { AiUsageService } = await import("../ai/ai-usage.service.js");
    const { BrandVoiceRepository } = await import("../brand-voice/brand-voice.repository.js");
    const { ImageGenerationsRepository } = await import("./image-generations.repository.js");
    const { ImageGenerationService } = await import("./image-generation.service.js");

    storageDir = await mkdtemp(path.join(tmpdir(), "presencia-images-"));
    dbService = new DbService();
    const assetsService = new AssetsService(
      dbService,
      new AssetsRepository(),
      new LocalAssetStorage(storageDir),
    );
    const credits = new CreditsService(dbService, new CreditsRepository());
    const aiUsage = new AiUsageService(dbService, new AiUsageRepository());
    enqueue = vi.fn(() => Promise.resolve(true));
    make = (providers) =>
      new ImageGenerationService(
        dbService,
        new CardsRepository(),
        new ImageGenerationsRepository(),
        assetsService,
        credits,
        aiUsage,
        new BrandVoiceRepository(),
        { enqueue } as unknown as BossService,
        { strengths: providers.generators.map(() => null), ...providers },
      );

    const [user] = await dbService.db
      .insert(users)
      .values({ name: "Imágenes", email: `images-${randomUUID()}@test.local` })
      .returning({ id: users.id });
    userId = user!.id;
    chatId = await dbService.runWithTenant(userId, async (tx) => {
      const [chat] = await tx.insert(chats).values({ userId }).returning({ id: chats.id });
      return chat!.id;
    });
  });

  afterAll(async () => {
    await dbService.db.delete(users).where(eq(users.id, userId));
    await dbService.onModuleDestroy();
    await rm(storageDir, { recursive: true, force: true });
  });

  it("pedir deja la card generando, una fila pendiente y un job en la cola", async () => {
    const service = make(fake());
    const cardId = await createCard();
    enqueue.mockClear();

    const dto = await service.request(userId, cardId, {
      generator: 1,
      prompt: "Taza de café de olla, más cerca",
      aspectRatio: "4:5",
    });

    expect(dto.imageJob).toMatchObject({ status: "generating", generator: 1, assetIds: [] });
    // El prompt editado queda en la card: es lo que de verdad se generó.
    expect(dto.content).toMatchObject({ imagePrompt: "Taza de café de olla, más cerca" });
    const rows = await batchRows(dto.imageJob!.id);
    // F10.7: una imagen por clic.
    expect(rows).toHaveLength(1);
    expect(rows.every((r) => r.status === "pending" && r.aspectRatio === "4:5")).toBe(true);
    expect(rows[0]!.prompt).toContain("Taza de café de olla, más cerca");
    // Sin estilo elegido ni en la voz: el Fotográfico natural, y el trabajo lo
    // recuerda para "Regenerar".
    expect(rows[0]!.prompt).toContain(imageStyleDef("foto").prompt);
    expect(rows[0]!.prompt).toContain(NO_TEXT_NO_LOGOS);
    expect(dto.imageJob).toMatchObject({ style: "foto" });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0]![1]).toEqual({ userId, cardId, batchId: dto.imageJob!.id });
  });

  it("el doble click no duplica: devuelve la card generando sin encolar otra vez", async () => {
    const service = make(fake());
    const cardId = await createCard();
    enqueue.mockClear();
    const body = {
      generator: 1,
      prompt: VISUAL.imagePrompt!,
      aspectRatio: "4:5" as const,
    };

    const [a, b] = await Promise.all([
      service.request(userId, cardId, body),
      service.request(userId, cardId, body),
    ]);

    expect(a.imageJob?.id).toBe(b.imageJob?.id);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(await batchRows(a.imageJob!.id)).toHaveLength(1);
  });

  it("anuncia el cobro de una imagen antes de encolar", async () => {
    const service = make(fake());
    const cardId = await createCard();
    const credits = (service as unknown as { credits: { assertQuotaOr402: () => Promise<void> } })
      .credits;
    const gate = vi.spyOn(credits, "assertQuotaOr402");
    await service.request(userId, cardId, {
      generator: 1,
      prompt: VISUAL.imagePrompt!,
      aspectRatio: "4:5",
    });
    expect(gate).toHaveBeenCalledWith(userId, 700);
    gate.mockRestore();
  });

  it("correr el job guarda la imagen, la cobra una vez y la elige", async () => {
    const service = make(fake());
    const cardId = await createCard();
    const dto = await service.request(userId, cardId, {
      generator: 1,
      prompt: VISUAL.imagePrompt!,
      aspectRatio: "4:5",
    });
    const job: ImageGenerationJob = { userId, cardId, batchId: dto.imageJob!.id };

    await service.run(job);

    const final = await card(cardId);
    const imageJob = final.imageJob as CardImageJob;
    expect(imageJob.status).toBe("done");
    expect(imageJob.assetIds).toHaveLength(1);
    expect((final.content as CardContent).assetIds).toEqual([imageJob.assetIds[0]]);

    const rows = await batchRows(job.batchId);
    expect(rows.every((r) => r.status === "succeeded" && r.assetId)).toBe(true);
    const ledger = await ledgerFor(rows.map((r) => r.id));
    expect(ledger).toHaveLength(1);
    expect(ledger.every((e) => e.delta === -700)).toBe(true);

    const stored = await dbService.runWithTenant(userId, (tx) =>
      tx.select().from(assets).where(inArray(assets.id, imageJob.assetIds)),
    );
    expect(stored.every((a) => a.source === "generated" && a.cardId === cardId)).toBe(true);

    const usage = await dbService.runWithTenant(userId, (tx) =>
      tx
        .select()
        .from(aiUsageEvents)
        .where(and(eq(aiUsageEvents.chatId, chatId), eq(aiUsageEvents.taskKind, "image_generate"))),
    );
    expect(usage.filter((u) => u.imagesCount === 1).length).toBeGreaterThanOrEqual(1);

    // Correrlo otra vez (pg-boss lo entregó dos veces) no vuelve a cobrar.
    await service.run(job);
    expect(await ledgerFor(rows.map((r) => r.id))).toHaveLength(1);
  });

  it("un bloqueo del proveedor no cobra y la card lo dice", async () => {
    const service = make(fake());
    const cardId = await createCard();
    const dto = await service.request(userId, cardId, {
      generator: 1,
      prompt: `El logo de una marca famosa ${FAKE_BLOCK_MARKER}`,
      aspectRatio: "4:5",
    });
    await service.run({ userId, cardId, batchId: dto.imageJob!.id });

    const final = await card(cardId);
    expect((final.imageJob as CardImageJob).status).toBe("blocked");
    expect((final.content as CardContent).assetIds).toEqual([]);
    const rows = await batchRows(dto.imageJob!.id);
    expect(rows.every((r) => r.status === "blocked")).toBe(true);
    expect(await ledgerFor(rows.map((r) => r.id))).toHaveLength(0);
  });

  it("si un slide del lote falla, el otro se entrega y solo ese se cobra", async () => {
    const service = make({ generators: [new HalfFailingProvider()] });
    const cardId = await createCard(CAROUSEL);
    const dto = await service.request(userId, cardId, {
      generator: 1,
      aspectRatio: "4:5",
      slideIds: [S1, S2],
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await service.run({ userId, cardId, batchId: dto.imageJob!.id });
    vi.mocked(console.error).mockRestore();

    const final = await card(cardId);
    expect((final.imageJob as CardImageJob).status).toBe("done");
    expect((final.imageJob as CardImageJob).assetIds).toHaveLength(1);
    const rows = await batchRows(dto.imageJob!.id);
    expect(rows.map((r) => r.status).sort()).toEqual(["failed", "succeeded"]);
    expect(await ledgerFor(rows.map((r) => r.id))).toHaveLength(1);
  });

  it("un job que la card ya reemplazó no dibuja ni cobra", async () => {
    const primary = new FakeImageProvider();
    const service = make({ generators: [primary] });
    const cardId = await createCard();
    const dto = await service.request(userId, cardId, {
      generator: 1,
      prompt: VISUAL.imagePrompt!,
      aspectRatio: "4:5",
    });
    // La cola se atrasó, la card lo dio por muerto y el usuario pidió otro.
    await dbService.runWithTenant(userId, (tx) =>
      tx
        .update(publicationCards)
        .set({ imageJob: { ...dto.imageJob!, id: randomUUID() } })
        .where(eq(publicationCards.id, cardId)),
    );

    await service.run({ userId, cardId, batchId: dto.imageJob!.id });

    expect(primary.requests).toHaveLength(0);
    const rows = await batchRows(dto.imageJob!.id);
    expect(rows.every((r) => r.status === "failed")).toBe(true);
    expect(await ledgerFor(rows.map((r) => r.id))).toHaveLength(0);
  });

  it("un job que arranca ya pasado el corte no dibuja: la card ya lo mostró fallido", async () => {
    const primary = new FakeImageProvider();
    const service = make({ generators: [primary] });
    const cardId = await createCard();
    const dto = await service.request(userId, cardId, {
      generator: 1,
      prompt: VISUAL.imagePrompt!,
      aspectRatio: "4:5",
    });
    await dbService.runWithTenant(userId, (tx) =>
      tx
        .update(publicationCards)
        .set({
          imageJob: {
            ...dto.imageJob!,
            startedAt: new Date(Date.now() - 6 * 60_000).toISOString(),
          },
        })
        .where(eq(publicationCards.id, cardId)),
    );

    await service.run({ userId, cardId, batchId: dto.imageJob!.id });

    expect(primary.requests).toHaveLength(0);
    const rows = await batchRows(dto.imageJob!.id);
    expect(rows.every((r) => r.status === "failed")).toBe(true);
    expect(await ledgerFor(rows.map((r) => r.id))).toHaveLength(0);
  });

  it("si el job se vuelve reemplazado mientras dibuja, guarda la imagen pero no la cobra", async () => {
    let cardId = "";
    // Mientras "dibuja", el usuario sube la suya: la card deja de tener
    // este trabajo como el vivo.
    class SupersededWhileDrawing extends FakeImageProvider {
      override async generate(request: ImageRequest): Promise<ImageResult> {
        await dbService.runWithTenant(userId, (tx) =>
          tx
            .update(publicationCards)
            .set({ imageJob: null })
            .where(eq(publicationCards.id, cardId)),
        );
        return super.generate(request);
      }
    }
    const service = make({ generators: [new SupersededWhileDrawing()] });
    cardId = await createCard();
    const dto = await service.request(userId, cardId, {
      generator: 1,
      prompt: VISUAL.imagePrompt!,
      aspectRatio: "4:5",
    });

    await service.run({ userId, cardId, batchId: dto.imageJob!.id });

    const rows = await batchRows(dto.imageJob!.id);
    expect(rows.every((r) => r.status === "succeeded" && r.assetId)).toBe(true);
    expect(await ledgerFor(rows.map((r) => r.id))).toHaveLength(0);
    // Y no pisa lo que la card tenga: el job ya no es el suyo.
    expect(((await card(cardId)).content as CardContent).assetIds).toEqual([]);
  });

  it("guardar el prompt editado no pisa la imagen que llegó después de leer la card", async () => {
    const { CardsRepository } = await import("../cards/cards.repository.js");
    const cardId = await createCard();
    const subida = randomUUID();
    // Otra pestaña eligió una imagen entre la lectura y la escritura.
    await dbService.runWithTenant(userId, (tx) =>
      tx
        .update(publicationCards)
        .set({ content: { ...VISUAL, assetIds: [subida] } })
        .where(eq(publicationCards.id, cardId)),
    );
    const job: CardImageJob = {
      id: randomUUID(),
      status: "generating",
      generator: 1,
      kind: "generate",
      aspectRatio: "4:5",
      assetIds: [],
      startedAt: new Date().toISOString(),
    };
    const row = await dbService.runWithTenant(userId, (tx) =>
      new CardsRepository().startImageJob(tx, cardId, job, "Prompt editado"),
    );
    expect(row?.content).toMatchObject({ imagePrompt: "Prompt editado", assetIds: [subida] });
  });

  it("'Probar con otro generador' sin uno configurado es un 400", async () => {
    const service = make(fake());
    const cardId = await createCard();
    await expect(
      service.request(userId, cardId, {
        generator: 2,
        prompt: VISUAL.imagePrompt!,
        aspectRatio: "4:5",
      }),
    ).rejects.toThrow(/Ese generador no está configurado/);
  });

  it("usa el generador que se pide por su posición en la lista (F10.7)", async () => {
    const segundo = new FakeImageProvider();
    const service = make({ generators: [new FakeImageProvider(), segundo] });
    const cardId = await createCard();
    const dto = await service.request(userId, cardId, {
      generator: 2,
      prompt: VISUAL.imagePrompt!,
      aspectRatio: "1:1",
    });
    await service.run({ userId, cardId, batchId: dto.imageJob!.id });
    expect(segundo.requests).toHaveLength(1);
    expect((await card(cardId)).imageJob).toMatchObject({ status: "done", generator: 2 });
  });

  it("acepta el campo viejo (pestaña abierta durante un deploy): 'alternate' es el 2", async () => {
    const segundo = new FakeImageProvider();
    const service = make({ generators: [new FakeImageProvider(), segundo] });
    const cardId = await createCard();
    const dto = await service.request(userId, cardId, {
      generator: 1,
      provider: "alternate",
      prompt: VISUAL.imagePrompt!,
      aspectRatio: "1:1",
    });
    await service.run({ userId, cardId, batchId: dto.imageJob!.id });
    expect(segundo.requests).toHaveLength(1);
  });

  it("una proporción que la red no usa es un 400", async () => {
    const service = make(fake());
    const cardId = await createCard();
    await expect(
      service.request(userId, cardId, {
        generator: 1,
        prompt: VISUAL.imagePrompt!,
        aspectRatio: "16:9",
      }),
    ).rejects.toThrow(/proporción/);
  });

  it("si no se puede encolar, la card no se queda generando", async () => {
    const service = make(fake());
    const cardId = await createCard();
    enqueue.mockResolvedValueOnce(false);
    await expect(
      service.request(userId, cardId, {
        generator: 1,
        prompt: VISUAL.imagePrompt!,
        aspectRatio: "4:5",
      }),
    ).rejects.toThrow(/en cola/);
    const final = await card(cardId);
    const job = final.imageJob as CardImageJob;
    expect(job.status).toBe("failed");
    expect((await batchRows(job.id)).every((r) => r.status === "failed")).toBe(true);
  });

  it("editar sin imagen elegida es un 400", async () => {
    const service = make(fake());
    const cardId = await createCard();
    await expect(
      service.requestEdit(userId, cardId, { instruction: "Hazla más cálida", generator: 1 }),
    ).rejects.toThrow(/Primero genera o sube/);
  });

  it("editar manda la elegida como referencia, cobra una y la deja como hija", async () => {
    const primary = new FakeImageProvider();
    const service = make({ generators: [primary] });
    const cardId = await createCard();
    const generated = await service.request(userId, cardId, {
      generator: 1,
      prompt: VISUAL.imagePrompt!,
      aspectRatio: "4:5",
      style: "neo",
    });
    await service.run({ userId, cardId, batchId: generated.imageJob!.id });
    const parentId = ((await card(cardId)).content as CardContent).assetIds[0]!;

    const dto = await service.requestEdit(userId, cardId, {
      instruction: "Quita a las personas",
      generator: 1,
    });
    // F10.6: hereda el estilo del trabajo anterior (el chip arranca en él).
    expect(dto.imageJob).toMatchObject({
      kind: "edit",
      aspectRatio: "4:5",
      status: "generating",
      style: "neo",
    });
    const rows = await batchRows(dto.imageJob!.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "edit",
      instruction: "Quita a las personas",
      parentAssetId: parentId,
    });
    expect(rows[0]!.prompt).toContain("Conserva todo lo que no se pidió cambiar");

    await service.run({ userId, cardId, batchId: dto.imageJob!.id });

    const last = primary.requests.at(-1)!;
    expect(last.reference?.mediaType).toBe("image/png");
    const final = await card(cardId);
    const job = final.imageJob as CardImageJob;
    expect(job).toMatchObject({ status: "done", kind: "edit", style: "neo" });
    expect((final.content as CardContent).assetIds).toEqual(job.assetIds);
    expect(await ledgerFor(rows.map((r) => r.id))).toHaveLength(1);

    const [child] = await dbService.runWithTenant(userId, (tx) =>
      tx.select().from(assets).where(eq(assets.id, job.assetIds[0]!)),
    );
    // La edición hereda el texto alternativo de su imagen de partida.
    expect(child!.metadata).toMatchObject({ alt: VISUAL.imagePrompt });

    const usage = await dbService.runWithTenant(userId, (tx) =>
      tx
        .select()
        .from(aiUsageEvents)
        .where(and(eq(aiUsageEvents.chatId, chatId), eq(aiUsageEvents.taskKind, "image_edit"))),
    );
    expect(usage.length).toBeGreaterThanOrEqual(1);
  });

  // ── F10.6: carrusel ──

  const S1 = randomUUID();
  const S2 = randomUUID();
  const S3 = randomUUID();
  const CAROUSEL: CardContent = {
    ...VISUAL,
    slides: [
      { id: S1, imagePrompt: "La portada: el local por fuera" },
      { id: S2, imagePrompt: "Un café de olla servido" },
      { id: S3 },
    ],
  };

  it("carrusel: un lote llena varios slides, una imagen cada uno (la portada también)", async () => {
    const service = make(fake());
    const cardId = await createCard(CAROUSEL);
    const dto = await service.request(userId, cardId, {
      generator: 1,
      aspectRatio: "4:5",
      slideIds: [S1, S2],
    });
    expect(dto.imageJob).toMatchObject({ status: "generating", slideIds: [S1, S2] });
    const rows = await batchRows(dto.imageJob!.id);
    expect(rows.map((r) => r.slideId).sort()).toEqual([S1, S2].sort());
    // Cada slide con SU prompt, y el estilo aparte.
    const second = rows.find((r) => r.slideId === S2)!;
    expect(second.prompt).toContain("Qué se ve: Un café de olla servido");
    expect(second.prompt).not.toContain("el local por fuera");

    await service.run({ userId, cardId, batchId: dto.imageJob!.id });
    const final = await card(cardId);
    const content = final.content as CardContent & { slides: { id: string; assetId?: string }[] };
    const [c1, c2, c3] = content.slides;
    expect(c1!.assetId).toBeDefined();
    expect(c2!.assetId).toBeDefined();
    // El slide que no se pidió no se toca.
    expect(c3!.assetId).toBeUndefined();
    expect(content.assetIds).toEqual([c1!.assetId, c2!.assetId]);
    // F10.6.1: cada imagen nace anotada con el slide de su fila (sus versiones).
    const born = await dbService.runWithTenant(userId, (tx) =>
      tx.select({ slideId: assets.slideId }).from(assets).where(eq(assets.cardId, cardId)),
    );
    expect(born.map((a) => a.slideId).sort()).toEqual([S1, S2].sort());
    // Se cobra por imagen entregada: dos.
    expect(await ledgerFor(rows.map((r) => r.id))).toHaveLength(2);
    expect(final.imageJob).toMatchObject({ status: "done", slideIds: [S1, S2] });
  });

  it("carrusel: una imagen suelta que se vuelve carrusel mientras genera llega a SU slide", async () => {
    const service = make(fake());
    const cardId = await createCard();
    const dto = await service.request(userId, cardId, {
      generator: 1,
      prompt: VISUAL.imagePrompt!,
      aspectRatio: "4:5",
    });
    expect(dto.imageJob).toMatchObject({ slideIds: [FIRST_SLIDE_ID] });
    // Mientras genera: se agrega un slide vacío y se pone de portada.
    const other = randomUUID();
    await dbService.runWithTenant(userId, (tx) =>
      tx
        .update(publicationCards)
        .set({
          content: {
            ...VISUAL,
            slides: [{ id: other }, { id: FIRST_SLIDE_ID, imagePrompt: VISUAL.imagePrompt! }],
          },
        })
        .where(eq(publicationCards.id, cardId)),
    );
    await service.run({ userId, cardId, batchId: dto.imageJob!.id });
    const content = (await card(cardId)).content as CardContent & {
      slides: { id: string; assetId?: string }[];
    };
    expect(content.slides[0]!.assetId).toBeUndefined();
    expect(content.slides[1]!.assetId).toBeDefined();
  });

  it("carrusel: generar un slide que no es la portada pide una sola imagen", async () => {
    const service = make(fake());
    const cardId = await createCard(CAROUSEL);
    const dto = await service.request(userId, cardId, {
      generator: 1,
      aspectRatio: "4:5",
      slideIds: [S2],
    });
    expect(await batchRows(dto.imageJob!.id)).toHaveLength(1);
  });

  it("carrusel: exige slides, y cada uno con su prompt", async () => {
    const service = make(fake());
    const cardId = await createCard(CAROUSEL);
    await expect(
      service.request(userId, cardId, { generator: 1, aspectRatio: "4:5", prompt: "x x x" }),
    ).rejects.toThrow(/Elige qué slides/);
    await expect(
      service.request(userId, cardId, { generator: 1, aspectRatio: "4:5", slideIds: [S3] }),
    ).rejects.toThrow(/slide 3 todavía no dice/);
    await expect(
      service.request(userId, cardId, {
        generator: 1,
        aspectRatio: "4:5",
        slideIds: [randomUUID()],
      }),
    ).rejects.toThrow(/ya no está/);

    const single = await createCard();
    await expect(
      service.request(userId, single, { generator: 1, aspectRatio: "4:5", slideIds: [S1] }),
    ).rejects.toThrow(/no es un carrusel/);
  });

  it("carrusel: si el slide se quitó mientras generaba, la imagen queda en versiones y no se coloca", async () => {
    const service = make(fake());
    const cardId = await createCard(CAROUSEL);
    const dto = await service.request(userId, cardId, {
      generator: 1,
      aspectRatio: "4:5",
      slideIds: [S2],
    });
    // Otro cambio quitó el slide 2 (la API no lo deja mientras genera; esto
    // simula una carrera con una escritura directa).
    await dbService.runWithTenant(userId, (tx) =>
      tx
        .update(publicationCards)
        .set({
          content: {
            ...CAROUSEL,
            slides: [
              CAROUSEL.archetype === "visual_first" ? CAROUSEL.slides![0]! : null!,
              { id: S3 },
            ],
          },
        })
        .where(eq(publicationCards.id, cardId)),
    );
    await service.run({ userId, cardId, batchId: dto.imageJob!.id });
    const final = await card(cardId);
    expect((final.content as CardContent).assetIds).toEqual([]);
    expect(final.imageJob).toMatchObject({ status: "done" });
  });

  it("carrusel: ajustar un slide usa SU imagen como referencia y vuelve a ese slide", async () => {
    const primary = new FakeImageProvider();
    const service = make({ generators: [primary] });
    const cardId = await createCard(CAROUSEL);
    const first = await service.request(userId, cardId, {
      generator: 1,
      aspectRatio: "4:5",
      slideIds: [S2],
    });
    await service.run({ userId, cardId, batchId: first.imageJob!.id });
    const before = (await card(cardId)).content as CardContent & {
      slides: { id: string; assetId?: string }[];
    };
    const parent = before.slides[1]!.assetId!;

    const dto = await service.requestEdit(userId, cardId, {
      instruction: "Más cálida",
      generator: 1,
      slideId: S2,
    });
    const [row] = await batchRows(dto.imageJob!.id);
    expect(row).toMatchObject({ parentAssetId: parent, slideId: S2 });
    await service.run({ userId, cardId, batchId: dto.imageJob!.id });
    const after = (await card(cardId)).content as CardContent & {
      slides: { id: string; assetId?: string }[];
    };
    expect(after.slides[1]!.assetId).not.toBe(parent);
    expect(after.slides[0]!.assetId).toBeUndefined();
  });

  it("el config anuncia el precio en %, nunca en unidades, y el fuerte sin el modelo", async () => {
    const config = await make({
      generators: [new FakeImageProvider(), new FakeImageProvider()],
      strengths: [null, "Personas y realismo"],
    }).config(userId);
    // Plan creator: 30,000 unidades; una imagen, 700 = 2.3%.
    expect(config).toEqual({
      generatePercent: 2.3,
      editPercent: 2.3,
      generatorCount: 2,
      generatorStrengths: [null, "Personas y realismo"],
      // n imágenes redondeadas UNA vez: 3 son 7.0%, no 3 × 2.3 = 6.9%.
      batchPercents: [2.3, 4.7, 7, 9.3, 11.7, 14, 16.3, 18.7, 21, 23.3],
      defaultStyle: "foto",
    });
  });
});

describe("composeImagePrompt", () => {
  it("suma el nicho y el estilo por defecto, condicionado", () => {
    const prompt = composeImagePrompt("Taza de café", { niche: ["cafetería"], vertical: null });
    expect(prompt).toContain("Taza de café");
    expect(prompt).toContain("creador de contenido de cafetería");
    // El estilo abre el prompt: al final lo perdía contra la escena.
    expect(prompt.startsWith(`${STYLE_LEAD} ${imageStyleDef("foto").prompt}`)).toBe(true);
    expect(prompt.indexOf("Taza de café")).toBeGreaterThan(prompt.indexOf(STYLE_LEAD));
  });

  it("F10.6: usa el estilo de la voz, y el de la imagen gana sobre el de la voz", () => {
    const voz = { niche: [], vertical: null, imageStyle: "neo" };
    expect(composeImagePrompt("Taza", voz)).toContain(imageStyleDef("neo").prompt);
    const conOverride = composeImagePrompt("Taza", voz, "mini");
    expect(conOverride).toContain(imageStyleDef("mini").prompt);
    expect(conOverride).not.toContain(imageStyleDef("neo").prompt);
  });

  it("F10.6: 'sin texto ni logotipos' va con todos los estilos", () => {
    for (const style of IMAGE_STYLE_IDS) {
      expect(composeImagePrompt("Taza", null, style)).toContain(NO_TEXT_NO_LOGOS);
    }
  });

  it("F10.6: un estilo guardado que ya no existe cae al de siempre", () => {
    const prompt = composeImagePrompt("Taza", {
      niche: [],
      vertical: null,
      imageStyle: "retirado",
    });
    expect(prompt).toContain(imageStyleDef("foto").prompt);
  });

  it("sin voz de marca no inventa un nicho", () => {
    expect(composeImagePrompt("Taza", null)).not.toContain("creador de contenido de");
  });
});

describe("composeEditPrompt", () => {
  it("pide conservar lo que no se pidió cambiar", () => {
    const prompt = composeEditPrompt("  Hazla más cálida ");
    expect(prompt.startsWith("Hazla más cálida")).toBe(true);
    expect(prompt).toContain("Conserva todo lo que no se pidió cambiar");
  });
});

describe("nearestAspect", () => {
  it("una foto 3:2 se edita como la proporción más cercana que usa la red", () => {
    expect(nearestAspect(1536, 1024, ["16:9", "1:1"])).toBe("16:9");
    expect(nearestAspect(1536, 1024, ["4:5", "1:1"])).toBe("1:1");
    expect(nearestAspect(928, 1152, ["4:5", "1:1"])).toBe("4:5");
  });
});

describe("fitToAspect", () => {
  const png = (width: number, height: number) =>
    sharp({ create: { width, height, channels: 3, background: "#cc88aa" } })
      .png()
      .toBuffer();

  it("recorta el 2:3 de gpt-image a 4:5, centrado y sin reescalar", async () => {
    const out = await fitToAspect(new Uint8Array(await png(1024, 1536)), "4:5");
    const { width, height } = await sharp(out).metadata();
    expect([width, height]).toEqual([1024, 1280]);
  });

  it("deja pasar lo que ya viene en la proporción (Gemini, 928×1152)", async () => {
    const input = new Uint8Array(await png(928, 1152));
    expect(await fitToAspect(input, "4:5")).toBe(input);
  });

  it("recorta a lo ancho cuando sobra ancho (3:2 → 1:1)", async () => {
    const out = await fitToAspect(new Uint8Array(await png(1536, 1024)), "1:1");
    const { width, height } = await sharp(out).metadata();
    expect([width, height]).toEqual([1024, 1024]);
  });
});
