import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  aiUsageEvents,
  brandVoices,
  chats,
  folders,
  messages,
  publicationCards,
  socialAccounts,
  socialConnectIntents,
  users,
} from "./schema.js";
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

  // F6 PR8: folders (Carpetas) — tabla desde F0/F4 pero sin rutas hasta
  // ahora. Mismo patrón de tenant_isolation que brand_voices.
  describe("folders", () => {
    let folderA: string;

    beforeAll(async () => {
      folderA = await dbService.runWithTenant(userA, async (tx) => {
        const [folder] = await tx
          .insert(folders)
          .values({ userId: userA, name: "Marca personal", icon: "💼" })
          .returning({ id: folders.id });
        if (!folder) throw new Error("No se pudo crear la carpeta de prueba");
        return folder.id;
      });
    }, 15_000);

    it("el dueño ve su propia carpeta", { timeout: 15_000 }, async () => {
      const rows = await dbService.runWithTenant(userA, (tx) => tx.select().from(folders));
      expect(rows.map((f) => f.id)).toContain(folderA);
    });

    it("otro tenant no lee la carpeta ajena", { timeout: 15_000 }, async () => {
      const rows = await dbService.runWithTenant(userB, (tx) => tx.select().from(folders));
      expect(rows).toHaveLength(0);
    });

    it(
      "otro tenant no puede insertar una carpeta a nombre ajeno",
      { timeout: 15_000 },
      async () => {
        const error: unknown = await dbService
          .runWithTenant(userB, (tx) =>
            tx.insert(folders).values({ userId: userA, name: "Intrusa" }),
          )
          .then(
            () => null,
            (e: unknown) => e,
          );
        expect(error).toBeInstanceOf(Error);
        expect(String((error as Error).cause)).toMatch(/row-level security/);
      },
    );

    // El caso real que esto previene: ChatService.moveToFolder no debe
    // aceptar el folderId de OTRO tenant solo porque el FK de Postgres
    // valida existencia física, no visibilidad por RLS (ver
    // FoldersService.assertOwnsFolder).
    it("otro tenant no ve la carpeta ajena aunque sepa su id", { timeout: 15_000 }, async () => {
      const rows = await dbService.runWithTenant(userB, (tx) =>
        tx.select().from(folders).where(eq(folders.id, folderA)),
      );
      expect(rows).toHaveLength(0);
    });

    // F6.5: el conteo de FoldersRepository.list es un LEFT JOIN a chats, o
    // sea que cruza dos tablas — hay que confirmar que RLS filtra las DOS
    // y que el conteo de A nunca ve chats de B.
    it("el conteo por carpeta no cruza tenants", { timeout: 15_000 }, async () => {
      // B intenta meter un chat en la carpeta de A. RLS le esconde la
      // carpeta, pero el FK es físico: lo que lo frena es que la fila que
      // inserta tiene que ser suya (user_id = B), y entonces el conteo de
      // A —que corre bajo el tenant de A— nunca la ve.
      await dbService.runWithTenant(userB, (tx) =>
        tx.insert(chats).values({ userId: userB, title: "De B", folderId: folderA }),
      );

      const [row] = await dbService.runWithTenant(userA, (tx) =>
        tx
          .select({ id: folders.id, chatCount: sql<number>`count(${chats.id})::int` })
          .from(folders)
          .leftJoin(chats, and(eq(chats.folderId, folders.id), isNull(chats.archivedAt)))
          .where(eq(folders.id, folderA))
          .groupBy(folders.id),
      );
      expect(row?.chatCount).toBe(0);

      await dbService.runWithTenant(userB, (tx) =>
        tx.delete(chats).where(eq(chats.folderId, folderA)),
      );
    });
  });

  // F6.5: fijar chats. El pin es una columna nueva sobre una tabla que ya
  // tenía RLS desde 0001 — se verifica que la policy la cubre igual, más
  // el invariante de que archivar limpia el pin (CHECK en DB).
  describe("chats · pinned_at", () => {
    let chatA: string;

    beforeAll(async () => {
      chatA = await dbService.runWithTenant(userA, async (tx) => {
        const [chat] = await tx
          .insert(chats)
          .values({ userId: userA, title: "Fijado de prueba" })
          .returning({ id: chats.id });
        if (!chat) throw new Error("No se pudo crear el chat de prueba");
        return chat.id;
      });
    }, 15_000);

    it("otro tenant no puede fijar un chat ajeno", { timeout: 15_000 }, async () => {
      // Bajo RLS un UPDATE sobre fila ajena no lanza: afecta 0 filas. Por
      // eso los servicios hacen getChat primero para dar un 404 explícito.
      await dbService.runWithTenant(userB, (tx) =>
        tx.update(chats).set({ pinnedAt: new Date() }).where(eq(chats.id, chatA)),
      );
      const [row] = await dbService.runWithTenant(userA, (tx) =>
        tx.select().from(chats).where(eq(chats.id, chatA)),
      );
      expect(row?.pinnedAt).toBeNull();
    });

    // F6.5: la búsqueda (ADR-017) cruza chats, messages, folders y cards
    // con índices GIN. Los índices son globales a la tabla, así que hay que
    // confirmar que RLS sigue filtrando por tenant DESPUÉS del índice — un
    // hit del GIN sobre una fila ajena no debe llegar al resultado.
    it("la búsqueda no cruza tenants", { timeout: 15_000 }, async () => {
      const marca = `zzqx-${randomUUID().slice(0, 8)}`;
      await dbService.runWithTenant(userA, (tx) =>
        tx
          .update(chats)
          .set({ title: `Secreto ${marca}` })
          .where(eq(chats.id, chatA)),
      );

      const mios = await dbService.runWithTenant(userA, (tx) =>
        tx
          .select({ id: chats.id })
          .from(chats)
          .where(sql`${marca} <% f_unaccent(${chats.title})`),
      );
      expect(mios.map((c) => c.id)).toContain(chatA);

      const ajenos = await dbService.runWithTenant(userB, (tx) =>
        tx
          .select({ id: chats.id })
          .from(chats)
          .where(sql`${marca} <% f_unaccent(${chats.title})`),
      );
      expect(ajenos).toHaveLength(0);
    });

    it("el CHECK impide fijar y archivar a la vez", { timeout: 15_000 }, async () => {
      const error: unknown = await dbService
        .runWithTenant(userA, (tx) =>
          tx
            .update(chats)
            .set({ pinnedAt: new Date(), archivedAt: new Date() })
            .where(eq(chats.id, chatA)),
        )
        .then(
          () => null,
          (e: unknown) => e,
        );
      expect(error).toBeInstanceOf(Error);
      expect(String((error as Error).cause)).toMatch(/chats_not_pinned_and_archived/);
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

  // F6: social_accounts / social_connect_intents (ADR-009 addendum) — mismo
  // patrón de tenant_isolation, más una verificación específica de
  // social_accounts: el índice único sobre provider_ref es GLOBAL (no por
  // usuario) a propósito, y debe seguir cortando en seco incluso cuando el
  // que intenta insertar no puede ver la fila existente por RLS — es la base
  // del mecanismo anti-robo de cuenta en ChannelsService.claimConnectIntent.
  describe("social_accounts / social_connect_intents", () => {
    let accountA: string;

    beforeAll(async () => {
      accountA = await dbService.runWithTenant(userA, async (tx) => {
        const [account] = await tx
          .insert(socialAccounts)
          .values({ userId: userA, network: "linkedin", providerRef: `pf_${randomUUID()}` })
          .returning({ id: socialAccounts.id, providerRef: socialAccounts.providerRef });
        if (!account) throw new Error("No se pudo crear la cuenta de prueba");
        return account.id;
      });
    }, 15_000);

    it("el dueño ve su propia cuenta conectada", { timeout: 15_000 }, async () => {
      const rows = await dbService.runWithTenant(userA, (tx) => tx.select().from(socialAccounts));
      expect(rows.map((a) => a.id)).toContain(accountA);
    });

    it("otro tenant no lee cuentas ajenas", { timeout: 15_000 }, async () => {
      const rows = await dbService.runWithTenant(userB, (tx) => tx.select().from(socialAccounts));
      expect(rows).toHaveLength(0);
    });

    it("otro tenant no puede insertar una cuenta a nombre ajeno", { timeout: 15_000 }, async () => {
      const error: unknown = await dbService
        .runWithTenant(userB, (tx) =>
          tx
            .insert(socialAccounts)
            .values({ userId: userA, network: "x", providerRef: `pf_${randomUUID()}` }),
        )
        .then(
          () => null,
          (e: unknown) => e,
        );
      expect(error).toBeInstanceOf(Error);
      expect(String((error as Error).cause)).toMatch(/row-level security/);
    });

    it(
      "el índice único de provider_ref corta un robo de cuenta entre tenants " +
        "aunque RLS le esconda la fila existente al segundo tenant",
      { timeout: 15_000 },
      async () => {
        const [existing] = await dbService.runWithTenant(userA, (tx) =>
          tx
            .select({ providerRef: socialAccounts.providerRef })
            .from(socialAccounts)
            .where(eq(socialAccounts.id, accountA)),
        );
        if (!existing) throw new Error("Fixture accountA no encontrada");

        // userB no puede ver la fila de userA (ya probado arriba), pero el
        // índice único es a nivel de tabla, no de policy — debe rechazar
        // igual, aunque el conflicto sea "invisible" para quien lo dispara.
        const error: unknown = await dbService
          .runWithTenant(userB, (tx) =>
            tx.insert(socialAccounts).values({
              userId: userB,
              network: "x",
              providerRef: existing.providerRef,
            }),
          )
          .then(
            () => null,
            (e: unknown) => e,
          );
        expect(error).toBeInstanceOf(Error);
        expect(String((error as Error).cause)).toMatch(
          /duplicate key value violates unique constraint "social_accounts_provider_ref"/,
        );
      },
    );

    it(
      "otro tenant no lee ni escribe intents de conexión ajenos",
      { timeout: 15_000 },
      async () => {
        const intentA = await dbService.runWithTenant(userA, async (tx) => {
          const [intent] = await tx
            .insert(socialConnectIntents)
            .values({
              userId: userA,
              knownAccountRefs: [],
              expiresAt: new Date(Date.now() + 60_000),
            })
            .returning({ id: socialConnectIntents.id });
          if (!intent) throw new Error("No se pudo crear el intent de prueba");
          return intent.id;
        });

        const rowsForB = await dbService.runWithTenant(userB, (tx) =>
          tx.select().from(socialConnectIntents).where(eq(socialConnectIntents.id, intentA)),
        );
        expect(rowsForB).toHaveLength(0);

        const error: unknown = await dbService
          .runWithTenant(userB, (tx) =>
            tx
              .insert(socialConnectIntents)
              .values({ userId: userA, knownAccountRefs: [], expiresAt: new Date() }),
          )
          .then(
            () => null,
            (e: unknown) => e,
          );
        expect(error).toBeInstanceOf(Error);
        expect(String((error as Error).cause)).toMatch(/row-level security/);
      },
    );
  });

  // F6: publication_cards ya tenía la policy desde 0001 (F0) pero nunca se
  // había probado contra Postgres real — se cierra ese hueco acá, junto con
  // el FK nuevo social_account_id (migración 0011_cards_social_account).
  describe("publication_cards", () => {
    let cardA: string;

    beforeAll(async () => {
      cardA = await dbService.runWithTenant(userA, async (tx) => {
        const [card] = await tx
          .insert(publicationCards)
          .values({
            userId: userA,
            chatId: chatA,
            archetype: "text_first",
            network: "linkedin",
            content: { archetype: "text_first", body: "hola", hashtags: [], assetIds: [] },
          })
          .returning({ id: publicationCards.id });
        if (!card) throw new Error("No se pudo crear la card de prueba");
        return card.id;
      });
    }, 15_000);

    it("el dueño ve su propia card", { timeout: 15_000 }, async () => {
      const rows = await dbService.runWithTenant(userA, (tx) => tx.select().from(publicationCards));
      expect(rows.map((c) => c.id)).toContain(cardA);
    });

    it("otro tenant no lee cards ajenas", { timeout: 15_000 }, async () => {
      const rows = await dbService.runWithTenant(userB, (tx) => tx.select().from(publicationCards));
      expect(rows).toHaveLength(0);
    });

    it("otro tenant no puede insertar una card a nombre ajeno", { timeout: 15_000 }, async () => {
      const error: unknown = await dbService
        .runWithTenant(userB, (tx) =>
          tx.insert(publicationCards).values({
            userId: userA,
            chatId: chatA,
            archetype: "text_first",
            network: "x",
            content: { archetype: "text_first", body: "intruso", hashtags: [], assetIds: [] },
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
      "otro tenant no puede apuntar social_account_id a una cuenta ajena por FK (aunque no la vea)",
      { timeout: 15_000 },
      async () => {
        const accountA = await dbService.runWithTenant(userA, async (tx) => {
          const [account] = await tx
            .insert(socialAccounts)
            .values({ userId: userA, network: "linkedin", providerRef: `pf_${randomUUID()}` })
            .returning({ id: socialAccounts.id });
          if (!account) throw new Error("No se pudo crear la cuenta de prueba");
          return account.id;
        });

        // El FK en sí no está gobernado por RLS (existencia, no dueño) — la
        // fila de userA sí se puede referenciar desde otro tenant a nivel
        // de Postgres. La defensa real es de aplicación: CardsService
        // valida la cuenta con ChannelsRepository.findAccountById() DENTRO
        // de la transacción del tenant que programa, que sí filtra por RLS
        // (ver cards.service.spec.ts). Este test documenta ese límite, no
        // lo cierra en la DB.
        const cardB = await dbService.runWithTenant(userB, async (tx) => {
          const [card] = await tx
            .insert(publicationCards)
            .values({
              userId: userB,
              chatId: chatA,
              archetype: "text_first",
              network: "linkedin",
              socialAccountId: accountA,
              content: { archetype: "text_first", body: "hola", hashtags: [], assetIds: [] },
            })
            .returning({
              id: publicationCards.id,
              socialAccountId: publicationCards.socialAccountId,
            });
          if (!card) throw new Error("No se pudo crear la card de prueba");
          return card;
        });
        expect(cardB.socialAccountId).toBe(accountA);

        await dbService.runWithTenant(userB, (tx) =>
          tx.delete(publicationCards).where(eq(publicationCards.id, cardB.id)),
        );
      },
    );

    // F6 PR8: chatId pasó a nullable + onDelete:"set null" (migración
    // 0012) — una card sobrevive al chat que la originó en vez de
    // cascadear con él. Este test es justo lo que ChatService.deleteChat
    // depende que sea cierto (ahí se rechaza el borrado si la card sigue
    // "scheduled"; para una "draft" como esta, el borrado del chat sí
    // procede y la card queda huérfana).
    it(
      "la card sobrevive con chatId null si se borra el chat que la originó",
      { timeout: 15_000 },
      async () => {
        const { chatId, cardId } = await dbService.runWithTenant(userA, async (tx) => {
          const [chat] = await tx
            .insert(chats)
            .values({ userId: userA, title: "Chat a borrar" })
            .returning({ id: chats.id });
          if (!chat) throw new Error("No se pudo crear el chat de prueba");
          const [card] = await tx
            .insert(publicationCards)
            .values({
              userId: userA,
              chatId: chat.id,
              archetype: "text_first",
              network: "linkedin",
              content: { archetype: "text_first", body: "sobrevive", hashtags: [], assetIds: [] },
            })
            .returning({ id: publicationCards.id });
          if (!card) throw new Error("No se pudo crear la card de prueba");
          return { chatId: chat.id, cardId: card.id };
        });

        await dbService.runWithTenant(userA, (tx) => tx.delete(chats).where(eq(chats.id, chatId)));

        const rows = await dbService.runWithTenant(userA, (tx) =>
          tx.select().from(publicationCards).where(eq(publicationCards.id, cardId)),
        );
        expect(rows).toHaveLength(1);
        expect(rows[0]?.chatId).toBeNull();

        await dbService.runWithTenant(userA, (tx) =>
          tx.delete(publicationCards).where(eq(publicationCards.id, cardId)),
        );
      },
    );
  });
});
