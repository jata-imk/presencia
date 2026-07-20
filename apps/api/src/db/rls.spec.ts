import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chats, messages, users } from "./schema.js";
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
});
