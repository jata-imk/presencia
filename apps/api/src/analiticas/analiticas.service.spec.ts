import { randomUUID } from "node:crypto";
import { NotFoundException } from "@nestjs/common";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analiticasQuerySchema, type AnaliticasPublicacionDto } from "@presencia/shared";
import { brandVoices, postMetrics, publicationCards, users } from "../db/schema.js";
// Solo tipos arriba: env.ts valida el entorno al importar, así que los
// módulos reales se cargan en beforeAll (mismo patrón que los specs de metrics).
import type { DbService as DbServiceType } from "../db/db.service.js";
import type { AnaliticasService as AnaliticasServiceType } from "./analiticas.service.js";

let dbService: DbServiceType;
let service: AnaliticasServiceType;
let ordenarPorLift: (filas: AnaliticasPublicacionDto[]) => AnaliticasPublicacionDto[];
let userA: string;
let userB: string;
/** Nunca publica: el estado "Cero absoluto". */
let userC: string;
/** Un concepto en dos redes, sin números: conceptos y hallazgos sin muestra. */
let userD: string;
/** 14 publicaciones de Instagram: las que no llevan emojis tuvieron más. */
let userE: string;

const HORA = 60 * 60 * 1000;

beforeAll(async () => {
  try {
    process.loadEnvFile("../../.env");
  } catch {
    // sin .env: se usa el process.env tal cual
  }
  const { DbService } = await import("../db/db.service.js");
  const { MetricsReadRepository } = await import("../metrics/metrics.read.repository.js");
  const { MetricsEngineService } = await import("../metrics/metrics-engine.service.js");
  const { ProfileRepository } = await import("../profile/profile.repository.js");
  const { ChannelsRepository } = await import("../channels/channels.repository.js");
  const { BrandVoiceRepository } = await import("../brand-voice/brand-voice.repository.js");
  const modulo = await import("./analiticas.service.js");
  dbService = new DbService();
  service = new modulo.AnaliticasService(
    dbService,
    new MetricsEngineService(new MetricsReadRepository()),
    new ProfileRepository(dbService),
    new ChannelsRepository(),
    new BrandVoiceRepository(),
  );
  ordenarPorLift = modulo.ordenarPorLift;

  const creados = await dbService.db
    .insert(users)
    .values([
      { name: "Analíticas A", email: `ana-a-${randomUUID()}@test.local` },
      { name: "Analíticas B", email: `ana-b-${randomUUID()}@test.local` },
      { name: "Analíticas C", email: `ana-c-${randomUUID()}@test.local` },
      { name: "Analíticas D", email: `ana-d-${randomUUID()}@test.local` },
      { name: "Analíticas E", email: `ana-e-${randomUUID()}@test.local` },
    ])
    .returning({ id: users.id });
  const [a, b, c, d, e] = creados;
  if (!a || !b || !c || !d || !e) throw new Error("No se pudieron crear los usuarios de prueba");
  userA = a.id;
  userB = b.id;
  userC = c.id;
  userD = d.id;
  userE = e.id;
}, 30_000);

afterAll(async () => {
  await dbService.db.delete(users).where(inArray(users.id, [userA, userB, userC, userD, userE]));
  await dbService.onModuleDestroy();
}, 30_000);

async function card(
  userId: string,
  status: "published" | "draft",
  campos: {
    platformPostId?: string;
    publishedAt?: Date;
    network?: "instagram" | "facebook";
    groupId?: string;
    body?: string;
  } = {},
): Promise<string> {
  const [fila] = await dbService.runWithTenant(userId, (tx) =>
    tx
      .insert(publicationCards)
      .values({
        userId,
        archetype: "text_first",
        network: campos.network ?? "instagram",
        groupId: campos.groupId ?? null,
        status,
        content: {
          archetype: "text_first",
          body: campos.body ?? "\nCómo organizo mi semana\nen cuatro minutos",
          hashtags: [],
          assetIds: [],
        },
        publishedAt: status === "published" ? (campos.publishedAt ?? new Date()) : null,
        platformPostId: campos.platformPostId ?? null,
      })
      .returning({ id: publicationCards.id }),
  );
  if (!fila) throw new Error("No se pudo crear la card");
  return fila.id;
}

describe("AnaliticasService.detalle", () => {
  it(
    "la card de otro usuario es un 404, no un detalle vacío (RLS)",
    { timeout: 15_000 },
    async () => {
      const ajena = await card(userB, "published");
      await expect(service.detalle(userA, ajena, 30)).rejects.toBeInstanceOf(NotFoundException);
    },
  );

  it("un borrador no tiene estadísticas: 404", { timeout: 15_000 }, async () => {
    const borrador = await card(userA, "draft");
    await expect(service.detalle(userA, borrador, 30)).rejects.toBeInstanceOf(NotFoundException);
  });

  it(
    "abre una publicación más vieja que el periodo, con sus números y su título",
    { timeout: 15_000 },
    async () => {
      const postId = `ig-${randomUUID()}`;
      const publishedAt = new Date(Date.now() - 60 * 24 * HORA);
      const id = await card(userA, "published", { platformPostId: postId, publishedAt });
      await dbService.runWithTenant(userA, (tx) =>
        tx.insert(postMetrics).values({
          userId: userA,
          network: "instagram",
          platformPostId: postId,
          cardId: id,
          snapshotAt: new Date(publishedAt.getTime() + 24 * HORA),
          capturedAt: new Date(publishedAt.getTime() + 24 * HORA),
          publishedAt,
          reach: 900,
          likes: 40,
          comments: 5,
          raw: { source: "spec" },
          provider: "fake",
        }),
      );

      const detalle = await service.detalle(userA, id, 7);
      expect(detalle).toMatchObject({
        cardId: id,
        titulo: "Cómo organizo mi semana",
        estado: "medida",
        alcance: 900,
        interacciones: 45,
        metricas: { reach: 900, impressions: null, likes: 40, comments: 5, shares: null },
        // Una sola publicación: no hay promedio contra qué medirla.
        lift: null,
        muestraDeRed: "sin_datos",
        enOtrasRedes: [],
      });
    },
  );
});

describe("AnaliticasService.resumen", () => {
  it("un usuario que nunca publicó está en Cero absoluto", { timeout: 15_000 }, async () => {
    const resumen = await service.resumen(userC, 30, null);
    expect(resumen).toMatchObject({
      hayPublicaciones: false,
      publicaciones: { total: 0, cambio: null },
      alcance: { total: null, cambioPct: null, redes: [] },
      engagement: [],
      ultimaMedicion: null,
    });
  });
});

describe("AnaliticasService.publicaciones: conceptos y mejores", () => {
  it(
    "con una red elegida, el concepto sigue trayendo sus hermanas de las otras redes",
    { timeout: 15_000 },
    async () => {
      const groupId = randomUUID();
      const instagram = await card(userD, "published", { groupId, network: "instagram" });
      const facebook = await card(userD, "published", { groupId, network: "facebook" });

      const respuesta = await service.publicaciones(userD, 30, "instagram");
      expect(respuesta.publicaciones.map((p) => p.cardId)).toEqual([instagram]);
      expect(respuesta.conceptos).toHaveLength(1);
      expect(respuesta.conceptos[0]).toMatchObject({ groupId, mejorEn: null });
      expect(respuesta.conceptos[0]?.hermanas.map((h) => h.cardId).sort()).toEqual(
        [instagram, facebook].sort(),
      );
      // Sin números no hay lift, y sin lift nadie es de tus mejores.
      expect(respuesta.mejores).toEqual([]);
    },
  );
});

describe("AnaliticasService.hallazgos", () => {
  it("sin muestra en ninguna red no inventa nada, y lo dice", { timeout: 15_000 }, async () => {
    expect(await service.hallazgos(userD, null)).toEqual({
      ventanaDias: 90,
      red: null,
      hayMuestra: false,
      hallazgos: [],
    });
  });
});

describe("AnaliticasService: el hallazgo de voz", () => {
  /** Una publicada hace `dias` con su medición a 24 h. */
  async function medida(dias: number, body: string, likes: number): Promise<void> {
    const postId = `ig-${randomUUID()}`;
    const publishedAt = new Date(Date.now() - dias * 24 * HORA);
    const id = await card(userE, "published", { platformPostId: postId, publishedAt, body });
    await dbService.runWithTenant(userE, (tx) =>
      tx.insert(postMetrics).values({
        userId: userE,
        network: "instagram",
        platformPostId: postId,
        cardId: id,
        snapshotAt: new Date(publishedAt.getTime() + 24 * HORA),
        capturedAt: new Date(publishedAt.getTime() + 24 * HORA),
        publishedAt,
        reach: 1000,
        likes,
        comments: 0,
        raw: { source: "spec" },
        provider: "fake",
      }),
    );
  }

  async function ponerVoz(campos: {
    styleNotes?: string[];
    learnFromEdits?: boolean;
    decisiones?: Record<string, unknown>;
  }): Promise<void> {
    await dbService.runWithTenant(userE, (tx) =>
      tx
        .update(brandVoices)
        .set({
          ...(campos.styleNotes ? { styleNotes: campos.styleNotes } : {}),
          ...(campos.learnFromEdits === undefined ? {} : { learnFromEdits: campos.learnFromEdits }),
          ...(campos.decisiones ? { voiceProposalDecisions: campos.decisiones } : {}),
        })
        .where(eq(brandVoices.isDefault, true)),
    );
  }

  beforeAll(async () => {
    await dbService.runWithTenant(userE, (tx) =>
      tx
        .insert(brandVoices)
        .values({ userId: userE, name: "Mi voz", isDefault: true, niche: ["x"] }),
    );
    // Mismo largo, para que solo el emoji parta los grupos (el ☕ es una
    // sola unidad de UTF-16).
    for (let i = 0; i < 6; i += 1) await medida(10 + i * 3, "Hola amigos", 90);
    for (let i = 0; i < 8; i += 1) await medida(11 + i * 3, "Hola amigo☕", 50);
  }, 60_000);

  it("le pone su propuesta contra la voz de hoy", { timeout: 20_000 }, async () => {
    await ponerVoz({ styleNotes: [], decisiones: {}, learnFromEdits: true });
    const { hallazgos } = await service.hallazgos(userE, null);
    expect(hallazgos.find((h) => h.tipo === "voz")).toMatchObject({
      rasgo: "emojis",
      ganador: "sin",
      nGanador: 6,
      nPerdedor: 8,
      propuesta: {
        id: "m-emojis-sin-instagram",
        rasgo: "Casi sin emojis",
        voz: { estado: "propone" },
      },
    });

    await ponerVoz({ styleNotes: ["Sin emojis"] });
    const ya = (await service.hallazgos(userE, null)).hallazgos.find((h) => h.tipo === "voz");
    expect(ya).toMatchObject({
      propuesta: { voz: { estado: "ya_lo_dice", rasgo: "Sin emojis" } },
    });
    // "Ya lo dice" no es propuesta para Configuración.
    expect(await service.propuestasDeVoz(userE)).toEqual({ propuestas: [] });
  });

  it(
    "Configuración la ve con «Aprender» prendido; apagado, solo Analíticas",
    { timeout: 20_000 },
    async () => {
      await ponerVoz({ styleNotes: [], decisiones: {}, learnFromEdits: true });
      expect(await service.propuestasDeVoz(userE)).toEqual({
        propuestas: [
          {
            id: "m-emojis-sin-instagram",
            origen: "metricas",
            mensaje:
              "En Instagram, tus publicaciones sin emojis tuvieron 80% más interacción que las que sí llevan.",
            rasgo: "Casi sin emojis",
            evidencia: [],
            otrosIds: [],
          },
        ],
      });

      await ponerVoz({ learnFromEdits: false });
      expect(await service.propuestasDeVoz(userE)).toEqual({ propuestas: [] });
      const { hallazgos } = await service.hallazgos(userE, null);
      expect(hallazgos.some((h) => h.tipo === "voz")).toBe(true);
    },
  );

  it("un «No» lo calla en los dos lados", { timeout: 20_000 }, async () => {
    await ponerVoz({
      styleNotes: [],
      learnFromEdits: true,
      decisiones: {
        "m-emojis-sin-instagram": { decision: "descartada", at: new Date().toISOString() },
      },
    });
    const { hallazgos } = await service.hallazgos(userE, null);
    expect(hallazgos.some((h) => h.tipo === "voz")).toBe(false);
    expect(await service.propuestasDeVoz(userE)).toEqual({ propuestas: [] });
  });
});

describe("analiticasQuerySchema", () => {
  it("30 días por defecto; 7, 30 o 90 y nada más", () => {
    expect(analiticasQuerySchema.parse({})).toEqual({ periodo: 30 });
    expect(analiticasQuerySchema.parse({ periodo: "90", red: "tiktok" })).toEqual({
      periodo: 90,
      red: "tiktok",
    });
    expect(analiticasQuerySchema.safeParse({ periodo: "14" }).success).toBe(false);
    expect(analiticasQuerySchema.safeParse({ red: "myspace" }).success).toBe(false);
  });
});

describe("ordenarPorLift", () => {
  it("por lift de mayor a menor; las que no tienen, al final y de la más nueva a la más vieja", () => {
    const fila = (cardId: string, lift: number | null, publishedAt: string) =>
      ({ cardId, lift, publishedAt }) as AnaliticasPublicacionDto;
    const orden = ordenarPorLift([
      fila("vieja-sin", null, "2026-11-01T00:00:00.000Z"),
      fila("baja", -20, "2026-11-10T00:00:00.000Z"),
      fila("nueva-sin", null, "2026-11-15T00:00:00.000Z"),
      fila("alta", 62, "2026-11-05T00:00:00.000Z"),
    ]).map((f) => f.cardId);
    expect(orden).toEqual(["alta", "baja", "nueva-sin", "vieja-sin"]);
  });
});
