import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { MockLanguageModelV4 } from "ai/test";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  brandVoices,
  cardVersions,
  chats,
  creditLedger,
  folders,
  publicationCards,
  users,
} from "../db/schema.js";
// Imports solo de tipo: los módulos reales se cargan en beforeAll (env.ts
// valida el entorno al importar), mismo patrón que destilar.service.spec.ts.
import type { DbService as DbServiceType } from "../db/db.service.js";
import type { VozVivaService as VozVivaServiceType } from "./voz-viva.service.js";

// «Aprender de mis ediciones» contra Postgres real. Lo que importa aquí es la
// query (qué publicaciones cuentan como evidencia de ESTA voz), que las
// decisiones y el interruptor no muevan `updated_at`, y el dinero de
// «Revisar mis ediciones».

const USAGE = {
  inputTokens: { total: 900, noCache: 900, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 120, text: 120, reasoning: undefined },
};

function modelo(salida: string): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: () =>
      Promise.resolve({
        content: [{ type: "text", text: salida }],
        finishReason: { unified: "stop", raw: undefined },
        usage: USAGE,
        warnings: [],
      }),
  });
}

const BORRADOR = "Lunes de productividad 🚀🔥\nTe comparto mi sistema.";
const EDITADO = "Lunes de productividad\nTe comparto mi sistema.";

let dbService: DbServiceType;
let crear: (salida?: string) => VozVivaServiceType;
const usuarios: string[] = [];
let userId: string;
let vozId: string;
let chatId: string;

/** Una card que salió, con la versión 1 de la IA si `original` difiere. */
async function publicada(opts: {
  original?: string;
  final: string;
  chat?: string | null;
  status?: "scheduled" | "published" | "failed" | "draft" | "canceled";
  groupId?: string;
  /** Una reescritura que el creator pidió a la IA ("Más corto"): versión 2, `ai`. */
  reescrita?: string;
}) {
  await dbService.runWithTenant(userId, async (tx) => {
    const [card] = await tx
      .insert(publicationCards)
      .values({
        userId,
        chatId: opts.chat === undefined ? chatId : opts.chat,
        archetype: "text_first",
        network: "linkedin",
        status: opts.status ?? "scheduled",
        groupId: opts.groupId ?? null,
        content: { archetype: "text_first", body: opts.final, hashtags: [] },
      })
      .returning({ id: publicationCards.id });
    if (!card) throw new Error("sin card");
    if (opts.original !== undefined) {
      await tx.insert(cardVersions).values({
        userId,
        cardId: card.id,
        n: 1,
        source: "chat",
        content: { archetype: "text_first", body: opts.original, hashtags: [] },
      });
    }
    if (opts.reescrita !== undefined) {
      await tx.insert(cardVersions).values({
        userId,
        cardId: card.id,
        n: 2,
        source: "ai",
        instruction: "Más corto",
        content: { archetype: "text_first", body: opts.reescrita, hashtags: [] },
      });
    }
  });
}

function voz() {
  return dbService.runWithTenant(userId, async (tx) => {
    const [fila] = await tx.select().from(brandVoices).where(eq(brandVoices.id, vozId));
    if (!fila) throw new Error("sin voz");
    return fila;
  });
}

describe("VozVivaService", () => {
  beforeAll(async () => {
    try {
      process.loadEnvFile("../../.env");
    } catch {
      // sin .env: se usa el process.env tal cual (CI)
    }
    const { DbService } = await import("../db/db.service.js");
    const { AiUsageRepository } = await import("../ai/ai-usage.repository.js");
    const { AiUsageService } = await import("../ai/ai-usage.service.js");
    const { CreditsRepository } = await import("../credits/credits.repository.js");
    const { CreditsService } = await import("../credits/credits.service.js");
    const { BrandVoiceRepository } = await import("./brand-voice.repository.js");
    const { VozVivaRepository } = await import("./voz-viva.repository.js");
    const { VozVivaService } = await import("./voz-viva.service.js");
    dbService = new DbService();
    const aiUsage = new AiUsageService(dbService, new AiUsageRepository());
    const credits = new CreditsService(dbService, new CreditsRepository());

    crear = (salida = '{"propuestas":[]}') => {
      const ai = {
        resolveForTask: () => ({
          model: modelo(salida),
          id: "openai:mock-adapt",
          provider: "openai",
          modelName: "mock-adapt",
        }),
      };
      return new VozVivaService(
        dbService,
        ai as never,
        aiUsage,
        credits,
        new BrandVoiceRepository(),
        new VozVivaRepository(),
      );
    };
  }, 30_000);

  beforeEach(async () => {
    const [user] = await dbService.db
      .insert(users)
      .values({
        name: "Voz viva",
        email: `voz-viva-${randomUUID()}@test.local`,
        emailVerified: true,
      })
      .returning({ id: users.id });
    if (!user) throw new Error("No se pudo crear el usuario de prueba");
    usuarios.push(user.id);
    userId = user.id;
    await dbService.runWithTenant(userId, async (tx) => {
      const [v] = await tx
        .insert(brandVoices)
        .values({ userId, name: "Mi voz", isDefault: true, niche: ["productividad"] })
        .returning({ id: brandVoices.id });
      const [c] = await tx.insert(chats).values({ userId }).returning({ id: chats.id });
      if (!v || !c) throw new Error("sin voz o chat");
      vozId = v.id;
      chatId = c.id;
    });
  });

  afterAll(async () => {
    if (usuarios.length > 0) await dbService.db.delete(users).where(inArray(users.id, usuarios));
    await dbService.onModuleDestroy();
  }, 30_000);

  it("propone con 4 editadas de esta voz y cuenta las intactas", { timeout: 20_000 }, async () => {
    for (let i = 0; i < 4; i++) await publicada({ original: BORRADOR, final: EDITADO });
    await publicada({ final: BORRADOR }); // programada sin tocar: emojis intactos

    const { aprender, propuestas, edicionesParaRevisar } = await crear().propuestas(userId);
    expect(aprender).toBe(true);
    expect(edicionesParaRevisar).toBe(4);
    expect(propuestas).toHaveLength(1);
    expect(propuestas[0]).toMatchObject({
      id: "emojis",
      mensaje: "Quitaste emojis en 4 de tus últimas 5 publicaciones.",
    });
  });

  it(
    "no cuenta borradores, canceladas, otra voz ni el mismo grupo dos veces",
    { timeout: 20_000 },
    async () => {
      await publicada({ original: BORRADOR, final: EDITADO, status: "draft" });
      await publicada({ original: BORRADOR, final: EDITADO, status: "canceled" });
      // Una card huérfana (su chat se borró): no se sabe con qué voz se escribió.
      await publicada({ original: BORRADOR, final: EDITADO, chat: null });
      // Un chat en una carpeta con otra voz.
      const otroChat = await dbService.runWithTenant(userId, async (tx) => {
        const [otra] = await tx
          .insert(brandVoices)
          .values({ userId, name: "Cliente", isDefault: false, niche: ["x"] })
          .returning({ id: brandVoices.id });
        const [carpeta] = await tx
          .insert(folders)
          .values({ userId, name: "Cliente", brandVoiceId: otra?.id })
          .returning({ id: folders.id });
        const [c] = await tx
          .insert(chats)
          .values({ userId, folderId: carpeta?.id })
          .returning({ id: chats.id });
        return c?.id ?? null;
      });
      await publicada({ original: BORRADOR, final: EDITADO, chat: otroChat });
      // El mismo post en dos redes: una decisión, no dos.
      const grupo = randomUUID();
      await publicada({ original: BORRADOR, final: EDITADO, groupId: grupo });
      await publicada({ original: BORRADOR, final: EDITADO, groupId: grupo, status: "published" });
      await publicada({ original: BORRADOR, final: EDITADO, status: "failed" });

      const { propuestas, edicionesParaRevisar } = await crear().propuestas(userId);
      expect(edicionesParaRevisar).toBe(2);
      expect(propuestas).toEqual([]);
    },
  );

  it(
    "decidir y apagar no mueven updated_at; apagado no hay propuestas",
    { timeout: 20_000 },
    async () => {
      for (let i = 0; i < 4; i++) await publicada({ original: BORRADOR, final: EDITADO });
      const servicio = crear();
      const antes = (await voz()).updatedAt;

      await servicio.decidir(userId, "emojis", "descartada");
      const despues = await voz();
      expect(despues.updatedAt).toEqual(antes);
      expect(despues.voiceProposalDecisions).toMatchObject({ emojis: { decision: "descartada" } });
      // El "No" se respeta: las 4 de antes ya no cuentan.
      expect((await servicio.propuestas(userId)).propuestas).toEqual([]);

      for (let i = 0; i < 4; i++) await publicada({ original: BORRADOR, final: EDITADO });
      expect((await servicio.propuestas(userId)).propuestas).toHaveLength(1);

      expect(await servicio.aprender(userId, false)).toEqual({
        aprender: false,
        propuestas: [],
        edicionesParaRevisar: 0,
      });
      expect((await voz()).updatedAt).toEqual(antes);
      expect((await servicio.aprender(userId, true)).propuestas).toHaveLength(1);
    },
  );

  it(
    "lo que cambió la IA a pedido no cuenta como edición del creator",
    { timeout: 20_000 },
    async () => {
      // La IA le quitó los emojis ("Más corto") y el creator programó eso tal cual.
      for (let i = 0; i < 4; i++) {
        await publicada({ original: BORRADOR, reescrita: EDITADO, final: EDITADO });
      }
      const { propuestas, edicionesParaRevisar } = await crear().propuestas(userId);
      expect(propuestas).toEqual([]);
      expect(edicionesParaRevisar).toBe(0);
    },
  );

  it(
    "revisar: apagado avisa sin mandar nada al modelo ni cobrar",
    { timeout: 20_000 },
    async () => {
      await publicada({ original: BORRADOR, final: EDITADO });
      await publicada({ original: "Qué chido verte", final: "Qué padre verte" });
      const servicio = crear();
      await servicio.aprender(userId, false);
      await expect(servicio.revisar(userId)).rejects.toThrow("Prende «Aprender de mis ediciones»");
      const cobros = await dbService.runWithTenant(userId, (tx) =>
        tx.select().from(creditLedger).where(eq(creditLedger.reason, "voice_distill")),
      );
      expect(cobros).toHaveLength(0);
    },
  );

  it("revisar: con menos de 2 editadas avisa sin cobrar", { timeout: 20_000 }, async () => {
    await publicada({ original: BORRADOR, final: EDITADO });
    await expect(crear().revisar(userId)).rejects.toThrow("Todavía no hay suficientes");
    const cobros = await dbService.runWithTenant(userId, (tx) =>
      tx.select().from(creditLedger).where(eq(creditLedger.reason, "voice_distill")),
    );
    expect(cobros).toHaveLength(0);
  });

  it(
    "revisar: devuelve propuestas limpias y cobra voice_distill",
    { timeout: 20_000 },
    async () => {
      await publicada({ original: BORRADOR, final: EDITADO });
      await publicada({ original: "Qué chido verte", final: "Qué padre verte" });
      const salida = JSON.stringify({
        propuestas: [
          {
            rasgo: "Dice «padre», nunca «chido»",
            mensaje: "Cambiaste «chido» por «padre».",
            antes: "Qué chido verte",
            despues: "Qué padre verte",
          },
        ],
      });

      const { propuestas } = await crear(salida).revisar(userId);
      expect(propuestas).toEqual([
        {
          id: "ia-1",
          origen: "ia",
          rasgo: "Dice «padre», nunca «chido»",
          mensaje: "Cambiaste «chido» por «padre».",
          evidencia: [{ antes: "Qué chido verte", despues: "Qué padre verte" }],
        },
      ]);

      const cobros = await dbService.runWithTenant(userId, (tx) =>
        tx
          .select()
          .from(creditLedger)
          .where(and(eq(creditLedger.userId, userId), eq(creditLedger.reason, "voice_distill"))),
      );
      expect(cobros).toHaveLength(1);
      expect(cobros[0]?.delta).toBeLessThan(0);
      // Revisar no cambia la voz: el rasgo lo guarda el creator si dice "Agregar".
      expect((await voz()).styleNotes).toEqual([]);
    },
  );
});
