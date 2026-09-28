import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CardContent, CardImageJob } from "@presencia/shared";
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
import { fitToAspect } from "./image-fit.js";
import { composeImagePrompt, DEFAULT_IMAGE_STYLE } from "./image-prompt.js";
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
let make: (providers: ImageProviders) => ServiceType;

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

/** Genera la primera vez y truena la segunda: una variante sale y la otra no. */
class HalfFailingProvider extends FakeImageProvider {
  private calls = 0;
  override generate(request: ImageRequest): Promise<ImageResult> {
    this.calls += 1;
    if (this.calls % 2 === 0) return Promise.reject(new Error("proveedor caído"));
    return super.generate(request);
  }
}

const fake = (): ImageProviders => ({ primary: new FakeImageProvider(), alternate: null });

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
        providers,
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

  it("pedir deja la card generando, dos filas pendientes y un job en la cola", async () => {
    const service = make(fake());
    const cardId = await createCard();
    enqueue.mockClear();

    const dto = await service.request(userId, cardId, {
      provider: "primary",
      prompt: "Taza de café de olla, más cerca",
      aspectRatio: "4:5",
    });

    expect(dto.imageJob).toMatchObject({ status: "generating", provider: "primary", assetIds: [] });
    // El prompt editado queda en la card: es lo que de verdad se generó.
    expect(dto.content).toMatchObject({ imagePrompt: "Taza de café de olla, más cerca" });
    const rows = await batchRows(dto.imageJob!.id);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === "pending" && r.aspectRatio === "4:5")).toBe(true);
    expect(rows[0]!.prompt).toContain("Taza de café de olla, más cerca");
    expect(rows[0]!.prompt).toContain(DEFAULT_IMAGE_STYLE);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0]![1]).toEqual({ userId, cardId, batchId: dto.imageJob!.id });
  });

  it("el doble click no duplica: devuelve la card generando sin encolar otra vez", async () => {
    const service = make(fake());
    const cardId = await createCard();
    enqueue.mockClear();
    const body = {
      provider: "primary" as const,
      prompt: VISUAL.imagePrompt!,
      aspectRatio: "4:5" as const,
    };

    const [a, b] = await Promise.all([
      service.request(userId, cardId, body),
      service.request(userId, cardId, body),
    ]);

    expect(a.imageJob?.id).toBe(b.imageJob?.id);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(await batchRows(a.imageJob!.id)).toHaveLength(2);
  });

  it("anuncia el cobro de dos imágenes antes de encolar", async () => {
    const service = make(fake());
    const cardId = await createCard();
    const credits = (service as unknown as { credits: { assertQuotaOr402: () => Promise<void> } })
      .credits;
    const gate = vi.spyOn(credits, "assertQuotaOr402");
    await service.request(userId, cardId, {
      provider: "primary",
      prompt: VISUAL.imagePrompt!,
      aspectRatio: "4:5",
    });
    expect(gate).toHaveBeenCalledWith(userId, 1400);
    gate.mockRestore();
  });

  it("correr el job guarda las dos, cobra una vez por imagen y elige la primera", async () => {
    const service = make(fake());
    const cardId = await createCard();
    const dto = await service.request(userId, cardId, {
      provider: "primary",
      prompt: VISUAL.imagePrompt!,
      aspectRatio: "4:5",
    });
    const job: ImageGenerationJob = { userId, cardId, batchId: dto.imageJob!.id };

    await service.run(job);

    const final = await card(cardId);
    const imageJob = final.imageJob as CardImageJob;
    expect(imageJob.status).toBe("done");
    expect(imageJob.assetIds).toHaveLength(2);
    expect((final.content as CardContent).assetIds).toEqual([imageJob.assetIds[0]]);

    const rows = await batchRows(job.batchId);
    expect(rows.every((r) => r.status === "succeeded" && r.assetId)).toBe(true);
    const ledger = await ledgerFor(rows.map((r) => r.id));
    expect(ledger).toHaveLength(2);
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
    expect(usage.filter((u) => u.imagesCount === 1).length).toBeGreaterThanOrEqual(2);

    // Correrlo otra vez (pg-boss lo entregó dos veces) no vuelve a cobrar.
    await service.run(job);
    expect(await ledgerFor(rows.map((r) => r.id))).toHaveLength(2);
  });

  it("un bloqueo del proveedor no cobra y la card lo dice", async () => {
    const service = make(fake());
    const cardId = await createCard();
    const dto = await service.request(userId, cardId, {
      provider: "primary",
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

  it("si una variante falla, la otra se entrega y solo esa se cobra", async () => {
    const service = make({ primary: new HalfFailingProvider(), alternate: null });
    const cardId = await createCard();
    const dto = await service.request(userId, cardId, {
      provider: "primary",
      prompt: VISUAL.imagePrompt!,
      aspectRatio: "4:5",
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

  it("'Probar con otro generador' sin uno configurado es un 400", async () => {
    const service = make(fake());
    const cardId = await createCard();
    await expect(
      service.request(userId, cardId, {
        provider: "alternate",
        prompt: VISUAL.imagePrompt!,
        aspectRatio: "4:5",
      }),
    ).rejects.toThrow(/otro generador/);
  });

  it("usa el generador alternativo cuando se lo piden", async () => {
    const alternate = new FakeImageProvider();
    const service = make({ primary: new FakeImageProvider(), alternate });
    const cardId = await createCard();
    const dto = await service.request(userId, cardId, {
      provider: "alternate",
      prompt: VISUAL.imagePrompt!,
      aspectRatio: "1:1",
    });
    await service.run({ userId, cardId, batchId: dto.imageJob!.id });
    expect(alternate.requests).toHaveLength(2);
    expect((await card(cardId)).imageJob).toMatchObject({ status: "done", provider: "alternate" });
  });

  it("una proporción que la red no usa es un 400", async () => {
    const service = make(fake());
    const cardId = await createCard();
    await expect(
      service.request(userId, cardId, {
        provider: "primary",
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
        provider: "primary",
        prompt: VISUAL.imagePrompt!,
        aspectRatio: "4:5",
      }),
    ).rejects.toThrow(/en cola/);
    const final = await card(cardId);
    const job = final.imageJob as CardImageJob;
    expect(job.status).toBe("failed");
    expect((await batchRows(job.id)).every((r) => r.status === "failed")).toBe(true);
  });

  it("el config anuncia el precio en %, nunca en unidades", async () => {
    const config = await make(fake()).config(userId);
    // Plan creator: 30,000 unidades; 2 × 700 = 4.7%, 700 = 2.3%.
    expect(config).toEqual({ generatePercent: 4.7, editPercent: 2.3, alternateAvailable: false });
  });
});

describe("composeImagePrompt", () => {
  it("suma el nicho y el estilo por defecto, condicionado", () => {
    const prompt = composeImagePrompt("Taza de café", { niche: ["cafetería"], vertical: null });
    expect(prompt).toContain("Taza de café");
    expect(prompt).toContain("creador de contenido de cafetería");
    expect(prompt).toContain(`Si la descripción no pide otro estilo: ${DEFAULT_IMAGE_STYLE}`);
  });

  it("sin voz de marca no inventa un nicho", () => {
    expect(composeImagePrompt("Taza", null)).not.toContain("creador de contenido de");
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
