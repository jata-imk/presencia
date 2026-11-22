import { randomUUID } from "node:crypto";
import { NotFoundException } from "@nestjs/common";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analiticasQuerySchema, type AnaliticasPublicacionDto } from "@presencia/shared";
import { postMetrics, publicationCards, users } from "../db/schema.js";
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
  const modulo = await import("./analiticas.service.js");
  dbService = new DbService();
  service = new modulo.AnaliticasService(
    dbService,
    new MetricsEngineService(new MetricsReadRepository()),
    new ProfileRepository(dbService),
    new ChannelsRepository(),
  );
  ordenarPorLift = modulo.ordenarPorLift;

  const creados = await dbService.db
    .insert(users)
    .values([
      { name: "Analíticas A", email: `ana-a-${randomUUID()}@test.local` },
      { name: "Analíticas B", email: `ana-b-${randomUUID()}@test.local` },
      { name: "Analíticas C", email: `ana-c-${randomUUID()}@test.local` },
    ])
    .returning({ id: users.id });
  const [a, b, c] = creados;
  if (!a || !b || !c) throw new Error("No se pudieron crear los usuarios de prueba");
  userA = a.id;
  userB = b.id;
  userC = c.id;
}, 30_000);

afterAll(async () => {
  await dbService.db.delete(users).where(inArray(users.id, [userA, userB, userC]));
  await dbService.onModuleDestroy();
}, 30_000);

async function card(
  userId: string,
  status: "published" | "draft",
  campos: { platformPostId?: string; publishedAt?: Date } = {},
): Promise<string> {
  const [fila] = await dbService.runWithTenant(userId, (tx) =>
    tx
      .insert(publicationCards)
      .values({
        userId,
        archetype: "text_first",
        network: "instagram",
        status,
        content: {
          archetype: "text_first",
          body: "\nCómo organizo mi semana\nen cuatro minutos",
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
