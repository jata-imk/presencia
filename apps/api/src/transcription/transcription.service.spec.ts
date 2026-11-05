import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { APICallError } from "@ai-sdk/provider";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aiUsageEvents, creditLedger, users } from "../db/schema.js";
import type { DbService as DbServiceType } from "../db/db.service.js";
import type { CreditsService as CreditsServiceType } from "../credits/credits.service.js";
import { TranscriptionChain, type TranscriptionLink } from "./transcription-chain.js";
import type { TranscriptionService as TranscriptionServiceType } from "./transcription.service.js";
import { billedMinutes } from "./voice.js";

// F11 PR6: transcribir una nota contra Postgres real, con modelos de mentira:
// que cobre los minutos iniciados en un asiento con la referencia del mensaje,
// que deje su fila de gasto con los segundos, y que una cadena caída no cobre.

let dbService: DbServiceType;
let credits: CreditsServiceType;
let crear: (links: TranscriptionLink[]) => TranscriptionServiceType;
let userId: string;

const link = (provider: string, run: TranscriptionLink["run"]): TranscriptionLink => ({
  provider,
  modelName: `${provider}-stt`,
  run,
});
const caido = () =>
  Promise.reject(
    new APICallError({ message: "503", url: "x", requestBodyValues: {}, statusCode: 503 }),
  );

describe("billedMinutes", () => {
  it("cobra por minuto iniciado, y al menos uno", () => {
    expect(billedMinutes(0)).toBe(1);
    expect(billedMinutes(12)).toBe(1);
    expect(billedMinutes(60)).toBe(1);
    expect(billedMinutes(61)).toBe(2);
    expect(billedMinutes(600)).toBe(10);
  });
});

describe("TranscriptionService", { timeout: 30_000 }, () => {
  beforeAll(async () => {
    try {
      process.loadEnvFile("../../.env");
    } catch {
      // sin .env: se usa el process.env tal cual (CI)
    }
    const { DbService } = await import("../db/db.service.js");
    const { TranscriptionService } = await import("./transcription.service.js");
    const { AiUsageRepository } = await import("../ai/ai-usage.repository.js");
    const { AiUsageService } = await import("../ai/ai-usage.service.js");
    const { CreditsRepository } = await import("../credits/credits.repository.js");
    const { CreditsService } = await import("../credits/credits.service.js");
    dbService = new DbService();
    const aiUsage = new AiUsageService(dbService, new AiUsageRepository());
    credits = new CreditsService(dbService, new CreditsRepository());
    crear = (links) =>
      new TranscriptionService(
        dbService,
        credits,
        aiUsage,
        new TranscriptionChain(links, { retryDelayMs: 0 }),
      );
    const [user] = await dbService.db
      .insert(users)
      .values({ name: "Escuchar", email: `escuchar-${randomUUID()}@test.local` })
      .returning({ id: users.id });
    userId = user!.id;
  });

  afterAll(async () => {
    await dbService.db.delete(users).where(inArray(users.id, [userId]));
    await dbService.onModuleDestroy();
  });

  const cobrosDe = (messageId: string) =>
    dbService.runWithTenant(userId, (tx) =>
      tx
        .select()
        .from(creditLedger)
        .where(
          and(
            eq(creditLedger.reason, "audio_transcription"),
            eq(creditLedger.referenceId, messageId),
          ),
        ),
    );
  const usosDe = () =>
    dbService.runWithTenant(userId, (tx) =>
      tx.select().from(aiUsageEvents).where(eq(aiUsageEvents.taskKind, "transcription")),
    );

  it("transcribe, cobra los minutos iniciados en un asiento y deja su fila de gasto", async () => {
    const messageId = randomUUID();
    const text = await crear([
      link("groq", () => Promise.resolve({ text: "  hazme 3 ideas  ", raw: { language: "es" } })),
    ]).transcribe({ userId, messageId, audio: new Uint8Array([1]), seconds: 61 });
    expect(text).toBe("hazme 3 ideas");
    const cobros = await cobrosDe(messageId);
    expect(cobros).toHaveLength(1);
    expect(cobros[0]).toMatchObject({ referenceType: "message", delta: -20 });
    const usos = await usosDe();
    expect(usos.at(-1)).toMatchObject({
      provider: "groq",
      model: "groq-stt",
      audioSeconds: 61,
      fallbackFrom: null,
      chatId: null,
    });
  });

  it("con el respaldo: la fila dice desde dónde cayó, y cobra lo mismo", async () => {
    const messageId = randomUUID();
    await crear([
      link("groq", caido),
      link("openai", () => Promise.resolve({ text: "hola", raw: {} })),
    ]).transcribe({ userId, messageId, audio: new Uint8Array([1]), seconds: 12 });
    expect((await cobrosDe(messageId))[0]).toMatchObject({ delta: -10 });
    expect((await usosDe()).at(-1)).toMatchObject({
      provider: "openai",
      fallbackFrom: "groq:groq-stt",
    });
  });

  it("un texto vacío también se cobra: el proveedor ya facturó", async () => {
    const messageId = randomUUID();
    const text = await crear([
      link("groq", () => Promise.resolve({ text: " ", raw: {} })),
    ]).transcribe({ userId, messageId, audio: new Uint8Array([1]), seconds: 5 });
    expect(text).toBe("");
    expect(await cobrosDe(messageId)).toHaveLength(1);
  });

  it("si toda la cadena cae, lanza y no cobra", async () => {
    const messageId = randomUUID();
    await expect(
      crear([link("groq", caido)]).transcribe({
        userId,
        messageId,
        audio: new Uint8Array([1]),
        seconds: 30,
      }),
    ).rejects.toThrow();
    expect(await cobrosDe(messageId)).toHaveLength(0);
  });

  it("el gate pide la nota más el mínimo del turno (402 sin cuota)", async () => {
    const service = crear([link("groq", () => Promise.resolve({ text: "x", raw: {} }))]);
    await expect(service.assertQuota(userId, 60)).resolves.toBeUndefined();
    const { rawBalance } = await credits.getQuotaStatus(userId);
    // Una nota tan larga que no alcanza: 10 unidades por minuto.
    const minutos = Math.ceil(rawBalance / 10) + 1;
    const error = await service.assertQuota(userId, minutos * 60).catch((e: unknown) => e);
    expect((error as { getStatus(): number }).getStatus()).toBe(402);
  });
});
