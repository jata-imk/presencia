import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aiUsageEvents, brandVoices, chats, messages, users } from "./schema.js";
// Import solo de tipo: el módulo real se carga en beforeAll, después de
// poblar process.env (env.ts valida el entorno en el import).
import type { DbService as DbServiceType } from "./db.service.js";

// DoD de F2: el aislamiento cross-tenant se prueba contra la base real,
// conectando como presencia_app (APP_DATABASE_URL) — con el rol owner,
// FORCE ROW LEVEL SECURITY no se ejercitaría de verdad (ADR-003).

let dbService: DbServiceType;
let userA: string;
let userB: string;
let chatA: string;

describe("RLS tenant_isolation", () => {
  beforeAll(async () => {
    // Mismo .env de la raíz que usan tsx --env-file y drizzle.config; en CI
    // las variables llegan por entorno y el archivo no existe.
    try {
      process.loadEnvFile("../../.env");
    } catch {
      // sin .env: se usa el process.env tal cual
    }
    const { DbService } = await import("./db.service.js");
    dbService = new DbService();

    // users no tiene RLS (la administra Better Auth); el insert directo es válido.
    const [a, b] = await dbService.db
      .insert(users)
      .values([
        { name: "Tenant A", email: `rls-a-${randomUUID()}@test.local` },
        { name: "Tenant B", email: `rls-b-${randomUUID()}@test.local` },
      ])
      .returning({ id: users.id });
    if (!a || !b) throw new Error("No se pudieron crear los usuarios de prueba");
    userA = a.id;
    userB = b.id;

    chatA = await dbService.runWithTenant(userA, async (tx) => {
      const [chat] = await tx
        .insert(chats)
        .values({ userId: userA, title: "Chat privado de A" })
        .returning({ id: chats.id });
      if (!chat) throw new Error("No se pudo crear el chat de prueba");
      await tx.insert(messages).values({
        chatId: chat.id,
        userId: userA,
        role: "user",
        parts: [{ type: "text", text: "hola" }],
      });
      return chat.id;
    });
  }, 30_000);

  afterAll(async () => {
    // El cascade de la FK borra chats/messages: las acciones de integridad
    // referencial no pasan por RLS (comportamiento documentado de Postgres).
    await dbService.db.delete(users).where(inArray(users.id, [userA, userB]));
    await dbService.onModuleDestroy();
  }, 30_000);

  it("el dueño ve sus propias filas", { timeout: 15_000 }, async () => {
    const rows = await dbService.runWithTenant(userA, (tx) => tx.select().from(chats));
    expect(rows.map((c) => c.id)).toContain(chatA);
  });

  it("otro tenant no lee chats ni mensajes ajenos", { timeout: 15_000 }, async () => {
    const { chatRows, messageRows } = await dbService.runWithTenant(userB, async (tx) => ({
      chatRows: await tx.select().from(chats),
      messageRows: await tx.select().from(messages),
    }));
    expect(chatRows).toHaveLength(0);
    expect(messageRows).toHaveLength(0);
  });

  it("otro tenant no puede insertar filas a nombre ajeno", { timeout: 15_000 }, async () => {
    // Drizzle envuelve el error de Postgres; el motivo real viene en cause.
    const error: unknown = await dbService
      .runWithTenant(userB, (tx) =>
        tx.insert(messages).values({
          chatId: chatA,
          userId: userA,
          role: "user",
          parts: [{ type: "text", text: "intruso" }],
        }),
      )
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(Error);
    expect(String((error as Error).cause)).toMatch(/row-level security/);
  });

  it("sin tenant fijado no hay acceso", { timeout: 15_000 }, async () => {
    // Fuera de runWithTenant no existe app.user_id: la policy no puede
    // evaluarse y Postgres rechaza la query (default-deny, nunca fuga).
    await expect(dbService.db.select().from(chats)).rejects.toThrow();
  });

  // F4: brand_voices alimenta el system prompt — mismo patrón de
  // tenant_isolation, misma verificación contra Postgres real. El cascade
  // de la FK userId al borrar users (afterAll de arriba) limpia esta fila.
  describe("brand_voices", () => {
    let voiceA: string;

    beforeAll(async () => {
      voiceA = await dbService.runWithTenant(userA, async (tx) => {
        const [voice] = await tx
          .insert(brandVoices)
          .values({ userId: userA, name: "Mi voz", isDefault: true, niche: ["comida"] })
          .returning({ id: brandVoices.id });
        if (!voice) throw new Error("No se pudo crear la voz de prueba");
        return voice.id;
      });
    }, 15_000);

    it("el dueño ve su propia voz de marca", { timeout: 15_000 }, async () => {
      const rows = await dbService.runWithTenant(userA, (tx) => tx.select().from(brandVoices));
      expect(rows.map((v) => v.id)).toContain(voiceA);
    });

    it("otro tenant no lee la voz de marca ajena", { timeout: 15_000 }, async () => {
      const rows = await dbService.runWithTenant(userB, (tx) => tx.select().from(brandVoices));
      expect(rows).toHaveLength(0);
    });

    it("otro tenant no puede insertar una voz a nombre ajeno", { timeout: 15_000 }, async () => {
      const error: unknown = await dbService
        .runWithTenant(userB, (tx) =>
          tx.insert(brandVoices).values({ userId: userA, name: "Intrusa" }),
        )
        .then(
          () => null,
          (e: unknown) => e,
        );
      expect(error).toBeInstanceOf(Error);
      expect(String((error as Error).cause)).toMatch(/row-level security/);
    });
  });

  // F4.5: ai_usage_events alimenta el ledger de créditos de F5 — mismo
  // patrón de tenant_isolation, más una verificación extra específica de
  // esta tabla: es append-only por diseño (0006_rls_ai_usage_events revoca
  // UPDATE/DELETE al rol de la API), no solo por convención.
  describe("ai_usage_events", () => {
    let eventA: string;

    beforeAll(async () => {
      eventA = await dbService.runWithTenant(userA, async (tx) => {
        const [event] = await tx
          .insert(aiUsageEvents)
          .values({
            userId: userA,
            chatId: chatA,
            taskKind: "chat",
            provider: "google",
            model: "gemini-3.6-flash",
            inputTokens: 100,
            outputTokens: 20,
            stepsCount: 1,
            durationMs: 500,
            providerRaw: { steps: [], finishReason: "stop" },
          })
          .returning({ id: aiUsageEvents.id });
        if (!event) throw new Error("No se pudo crear el evento de usage de prueba");
        return event.id;
      });
    }, 15_000);

    it("el dueño ve su propio evento de usage", { timeout: 15_000 }, async () => {
      const rows = await dbService.runWithTenant(userA, (tx) => tx.select().from(aiUsageEvents));
      expect(rows.map((e) => e.id)).toContain(eventA);
    });

    it("otro tenant no lee el usage ajeno", { timeout: 15_000 }, async () => {
      const rows = await dbService.runWithTenant(userB, (tx) => tx.select().from(aiUsageEvents));
      expect(rows).toHaveLength(0);
    });

    it("otro tenant no puede insertar un evento a nombre ajeno", { timeout: 15_000 }, async () => {
      const error: unknown = await dbService
        .runWithTenant(userB, (tx) =>
          tx.insert(aiUsageEvents).values({
            userId: userA,
            taskKind: "chat",
            provider: "google",
            model: "gemini-3.6-flash",
            inputTokens: 1,
            outputTokens: 1,
            stepsCount: 1,
            durationMs: 1,
            providerRaw: {},
          }),
        )
        .then(
          () => null,
          (e: unknown) => e,
        );
      expect(error).toBeInstanceOf(Error);
      expect(String((error as Error).cause)).toMatch(/row-level security/);
    });

    it(
      "presencia_app no puede modificar ni borrar un evento existente (append-only)",
      { timeout: 15_000 },
      async () => {
        const updateError: unknown = await dbService
          .runWithTenant(userA, (tx) =>
            tx.update(aiUsageEvents).set({ outputTokens: 999 }).where(eq(aiUsageEvents.id, eventA)),
          )
          .then(
            () => null,
            (e: unknown) => e,
          );
        expect(updateError).toBeInstanceOf(Error);
        expect(String((updateError as Error).cause)).toMatch(/permission denied/);

        const deleteError: unknown = await dbService
          .runWithTenant(userA, (tx) =>
            tx.delete(aiUsageEvents).where(eq(aiUsageEvents.id, eventA)),
          )
          .then(
            () => null,
            (e: unknown) => e,
          );
        expect(deleteError).toBeInstanceOf(Error);
        expect(String((deleteError as Error).cause)).toMatch(/permission denied/);
      },
    );
  });
});
