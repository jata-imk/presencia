import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { MockLanguageModelV4 } from "ai/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chats, creditLedger, messageAttachments, messages, users } from "../db/schema.js";
import { LocalAssetStorage } from "../assets/asset-storage.js";
import type { DbService as DbServiceType } from "../db/db.service.js";
import type { AttachmentsService as AttachmentsServiceType } from "./attachments.service.js";
import type { AttachmentDigestService as DigestServiceType } from "./attachment-digest.service.js";
import { cleanDescription, DIGEST_RETRY_AFTER_MS, digestDue } from "./attachment-digest.js";

// La descripción de un adjunto (F10.9 PR4) contra Postgres real y el modelo
// simulado: que la guarde, que la cobre una vez, que no la repita y qué lee.

const USAGE = {
  inputTokens: { total: 900, noCache: 900, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 40, text: 40, reasoning: undefined },
};

let dbService: DbServiceType;
let attachments: AttachmentsServiceType;
let crear: (respuesta: string, vistos: unknown[]) => DigestServiceType;
let storageDir: string;
let userId: string;
let chatId: string;

describe("AttachmentDigestService", { timeout: 30_000 }, () => {
  beforeAll(async () => {
    try {
      process.loadEnvFile("../../.env");
    } catch {
      // sin .env: se usa el process.env tal cual (CI)
    }
    const { DbService } = await import("../db/db.service.js");
    const { AttachmentsRepository } = await import("./attachments.repository.js");
    const { AttachmentsService } = await import("./attachments.service.js");
    const { AttachmentDigestService } = await import("./attachment-digest.service.js");
    const { AiUsageRepository } = await import("../ai/ai-usage.repository.js");
    const { AiUsageService } = await import("../ai/ai-usage.service.js");
    const { CreditsRepository } = await import("../credits/credits.repository.js");
    const { CreditsService } = await import("../credits/credits.service.js");

    storageDir = await mkdtemp(path.join(tmpdir(), "presencia-describir-"));
    dbService = new DbService();
    const repo = new AttachmentsRepository();
    attachments = new AttachmentsService(dbService, repo, new LocalAssetStorage(storageDir));
    const aiUsage = new AiUsageService(dbService, new AiUsageRepository());
    const credits = new CreditsService(dbService, new CreditsRepository());
    crear = (respuesta, vistos) => {
      const model = new MockLanguageModelV4({
        doGenerate: (options) => {
          vistos.push(options.prompt);
          return Promise.resolve({
            content: [{ type: "text", text: respuesta }],
            finishReason: { unified: "stop", raw: undefined },
            usage: USAGE,
            warnings: [],
          });
        },
      });
      const ai = {
        resolveForTask: () => ({
          model,
          id: "openai:mock-utility",
          provider: "openai",
          modelName: "mock-utility",
        }),
      };
      return new AttachmentDigestService(
        dbService,
        repo,
        attachments,
        ai as never,
        aiUsage,
        credits,
        {} as never,
      );
    };

    const [user] = await dbService.db
      .insert(users)
      .values({ name: "Describir", email: `describir-${randomUUID()}@test.local` })
      .returning({ id: users.id });
    userId = user!.id;
    chatId = await dbService.runWithTenant(userId, async (tx) => {
      const [chat] = await tx.insert(chats).values({ userId }).returning({ id: chats.id });
      return chat!.id;
    });
  });

  afterAll(async () => {
    await dbService.db.delete(users).where(inArray(users.id, [userId]));
    await dbService.onModuleDestroy();
    await rm(storageDir, { recursive: true, force: true });
  });

  const rowOf = (id: string) =>
    dbService.runWithTenant(userId, async (tx) => {
      const [row] = await tx.select().from(messageAttachments).where(eq(messageAttachments.id, id));
      return row!;
    });
  /** Sube un adjunto y lo deja enviado en un mensaje, como lo encola el chat. */
  const enviado = async (input: { data: Uint8Array; filename: string }) => {
    const dto = await attachments.upload({ userId, chatId, ...input });
    await dbService.runWithTenant(userId, async (tx) => {
      const messageId = randomUUID();
      await tx.insert(messages).values({ id: messageId, chatId, userId, role: "user", parts: [] });
      await tx
        .update(messageAttachments)
        .set({ messageId })
        .where(eq(messageAttachments.id, dto.id));
    });
    return dto;
  };
  const cobrosDe = (id: string) =>
    dbService.runWithTenant(userId, (tx) =>
      tx
        .select()
        .from(creditLedger)
        .where(and(eq(creditLedger.reason, "content_digest"), eq(creditLedger.referenceId, id))),
    );

  it("describe un texto con su principio, la guarda, la cobra una vez y no la repite", async () => {
    const dto = await enviado({
      data: new TextEncoder().encode("# Menú\n- Marquesita de queso: $45"),
      filename: "menu.md",
    });
    const vistos: unknown[] = [];
    await crear("Descripción: Menú con la marquesita de queso a $45.", vistos).describe({
      userId,
      attachmentId: dto.id,
      chatId,
    });

    const row = await rowOf(dto.id);
    expect(row.description).toBe("Menú con la marquesita de queso a $45.");
    expect(row.describedAt).toBeInstanceOf(Date);
    expect(JSON.stringify(vistos[0])).toContain("Marquesita de queso: $45");
    expect(await cobrosDe(dto.id)).toHaveLength(1);

    // Otra vez (un reintento): ni llama al modelo ni cobra.
    const otra: unknown[] = [];
    await crear("Otra cosa", otra).describe({ userId, attachmentId: dto.id, chatId });
    expect(otra).toHaveLength(0);
    expect((await rowOf(dto.id)).description).toBe("Menú con la marquesita de queso a $45.");
    expect(await cobrosDe(dto.id)).toHaveLength(1);
  });

  it("una respuesta vacía no guarda ni cobra, y lanza para que pg-boss reintente", async () => {
    const dto = await enviado({
      data: new TextEncoder().encode("algo"),
      filename: "vacio.txt",
    });
    await expect(
      crear("   ", []).describe({ userId, attachmentId: dto.id, chatId }),
    ).rejects.toThrow(/no describió/);
    const row = await rowOf(dto.id);
    expect(row.description).toBeNull();
    expect(await cobrosDe(dto.id)).toHaveLength(0);
    // El intento queda anotado: el chat no la vuelve a pedir en un día.
    expect(row.describedAt).toBeInstanceOf(Date);
    expect(digestDue(row)).toBe(false);
  });

  it("uno que ya no está en ningún mensaje (se quitó al editar) no se describe", async () => {
    const dto = await attachments.upload({
      userId,
      chatId,
      data: new TextEncoder().encode("quitado"),
      filename: "quitado.txt",
    });
    const vistos: unknown[] = [];
    await crear("No debería", vistos).describe({ userId, attachmentId: dto.id, chatId });
    expect(vistos).toHaveLength(0);
    expect(await cobrosDe(dto.id)).toHaveLength(0);
  });

  it("una imagen viaja como archivo al modelo que la describe", async () => {
    const { solidPng } = await import("../images/fake-image.provider.js");
    const dto = await enviado({
      data: solidPng(40, 30, [10, 120, 200]),
      filename: "azul.png",
    });
    const vistos: unknown[] = [];
    await crear("Un rectángulo azul liso.", vistos).describe({
      userId,
      attachmentId: dto.id,
      chatId,
    });
    expect(JSON.stringify(vistos[0])).toContain('"mediaType":"image/png"');
    expect((await rowOf(dto.id)).description).toBe("Un rectángulo azul liso.");
  });
});

describe("digestDue", () => {
  it("se pide si no tiene descripción ni un intento del último día", () => {
    const now = Date.now();
    expect(digestDue({ description: null, describedAt: null }, now)).toBe(true);
    expect(digestDue({ description: "Una foto", describedAt: new Date(now) }, now)).toBe(false);
    expect(digestDue({ description: null, describedAt: new Date(now - 1000) }, now)).toBe(false);
    expect(
      digestDue({ description: null, describedAt: new Date(now - DIGEST_RETRY_AFTER_MS) }, now),
    ).toBe(true);
  });
});

describe("cleanDescription", () => {
  it("quita el encabezado y los saltos; vacío es null", () => {
    expect(cleanDescription("Descripción:  Una foto\n de tacos.")).toBe("Una foto de tacos.");
    expect(cleanDescription("   ")).toBeNull();
  });
});
