import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrendItem } from "@presencia/shared";
import { sessions, trendSources, users, userTrends } from "../db/schema.js";
// Imports solo de tipo: los módulos reales se cargan en beforeAll, mismo
// patrón que metrics.repository.spec.ts (env.ts valida el entorno al importar).
import type { DbService as DbServiceType } from "../db/db.service.js";
import type { TrendsRepository as TrendsRepositoryType } from "./trends.repository.js";

// Contra Postgres real, porque lo que está bajo prueba es justo lo que un mock
// no ejercita: que `user_trends` y `trend_sources` estén aisladas por RLS, y
// que el barrido —que corre SIN tenant— sí las vea a todas.
//
// Ese par es la parte delicada del cambio de F9.6: la tabla vieja no tenía RLS
// y se leía desde cualquier tenant a propósito. Si la policy nueva quedara mal,
// el síntoma sería silencioso en las dos direcciones — o el usuario no ve sus
// tendencias, o ve las de otro.

let dbService: DbServiceType;
let repo: TrendsRepositoryType;
let userA: string;
let userB: string;

const AHORA = new Date("2026-09-24T12:00:00.000Z");
const EN_UNA_SEMANA = new Date("2026-10-01T12:00:00.000Z");
const HACE_UN_DIA = new Date("2026-09-23T12:00:00.000Z");

const ITEM: TrendItem = {
  topic: "Carruseles antes y después",
  signal: "rising",
  network: "instagram",
  format: "carrusel",
  blurb: "El formato lado a lado se está moviendo en cuentas de diseño.",
  sourceTitle: "ejemplo.mx",
  sourceUrl: "https://ejemplo.mx/tendencias",
};

async function nuevoUsuario(conSesion: boolean): Promise<string> {
  const [user] = await dbService.db
    .insert(users)
    .values({
      name: "Tendencias",
      email: `trends-${randomUUID()}@test.local`,
      emailVerified: true,
    })
    .returning({ id: users.id });
  if (!user) throw new Error("No se pudo crear el usuario de prueba");
  if (conSesion) {
    await dbService.db.insert(sessions).values({
      userId: user.id,
      token: randomUUID(),
      expiresAt: new Date(AHORA.getTime() + 30 * 24 * 60 * 60 * 1000),
    });
  }
  return user.id;
}

async function guardar(userId: string, items: TrendItem[], expiresAt: Date): Promise<void> {
  await dbService.runWithTenant(userId, (tx) =>
    repo.upsert(tx, {
      userId,
      items,
      generatedAt: AHORA,
      expiresAt,
      provider: "google",
      model: "gemini-spec",
      usage: { consultas: 3 },
    }),
  );
}

describe("TrendsRepository", () => {
  beforeAll(async () => {
    try {
      process.loadEnvFile("../../.env");
    } catch {
      // sin .env: se usa el process.env tal cual (CI)
    }
    const { DbService } = await import("../db/db.service.js");
    const { TrendsRepository } = await import("./trends.repository.js");
    dbService = new DbService();
    repo = new TrendsRepository();
    userA = await nuevoUsuario(true);
    userB = await nuevoUsuario(true);
  }, 30_000);

  afterAll(async () => {
    await dbService.db.delete(users).where(inArray(users.id, [userA, userB]));
    await dbService.onModuleDestroy();
  }, 30_000);

  it("un segundo refresco actualiza la fila, no agrega otra", { timeout: 15_000 }, async () => {
    await guardar(userA, [ITEM], EN_UNA_SEMANA);
    await guardar(userA, [ITEM, { ...ITEM, topic: "Otra cosa" }], EN_UNA_SEMANA);

    // Dentro del tenant: sin `app.user_id` fijado la policy no deja pasar
    // nada, que es exactamente lo que este cambio vino a instalar.
    const filas = await dbService.runWithTenant(userA, (tx) => tx.select().from(userTrends));
    expect(filas).toHaveLength(1);

    const guardadas = await dbService.runWithTenant(userA, (tx) => repo.find(tx));
    expect(guardadas?.items).toHaveLength(2);
  });

  it("otro tenant no ve tendencias ajenas", { timeout: 15_000 }, async () => {
    // La tabla vieja no tenía RLS y se leía desde cualquier tenant a
    // propósito: era una caché compartida. Ahora es dato de una persona.
    await guardar(userA, [ITEM], EN_UNA_SEMANA);
    const deB = await dbService.runWithTenant(userB, (tx) => repo.find(tx));
    expect(deB).toBeNull();
  });

  it("descarta los items guardados que ya no pasan el schema", { timeout: 15_000 }, async () => {
    // `items` es jsonb: una fila escrita por una versión vieja del código no
    // puede llegar a medias a la pantalla.
    await guardar(userA, [ITEM, { topic: "rota" } as unknown as TrendItem], EN_UNA_SEMANA);
    const guardadas = await dbService.runWithTenant(userA, (tx) => repo.find(tx));
    expect(guardadas?.items).toHaveLength(1);
  });

  it("una tanda vacía SÍ es una fila, no ausencia", { timeout: 15_000 }, async () => {
    // De esto cuelga que la pantalla pueda distinguir "todavía no buscamos" de
    // "buscamos y no encontramos", y que el barrido sepa que ya pasó por acá.
    await guardar(userB, [], EN_UNA_SEMANA);
    const guardadas = await dbService.runWithTenant(userB, (tx) => repo.find(tx));
    expect(guardadas).not.toBeNull();
    expect(guardadas?.items).toEqual([]);
    expect(guardadas?.generatedAt).toBeInstanceOf(Date);
  });

  it("las vencidas vuelven igual, para mostrarlas con su fecha", { timeout: 15_000 }, async () => {
    await guardar(userA, [ITEM], HACE_UN_DIA);
    const guardadas = await dbService.runWithTenant(userA, (tx) => repo.find(tx));
    expect(guardadas?.items).toHaveLength(1);
    expect(guardadas?.expiresAt.getTime()).toBeLessThan(AHORA.getTime());
  });

  it("posponer mueve el vencimiento sin tocar las tendencias", { timeout: 15_000 }, async () => {
    await guardar(userA, [ITEM], HACE_UN_DIA);
    const hasta = new Date(AHORA.getTime() + 12 * 60 * 60 * 1000);
    await dbService.runWithTenant(userA, (tx) => repo.posponer(tx, hasta));

    const guardadas = await dbService.runWithTenant(userA, (tx) => repo.find(tx));
    expect(guardadas?.expiresAt.getTime()).toBe(hasta.getTime());
    expect(guardadas?.items).toHaveLength(1);
  });

  it("el barrido ve a quien le venció y a quien nunca tuvo", { timeout: 15_000 }, async () => {
    // Corre sin tenant: si la policy de worker faltara, esto devolvería vacío
    // y las tendencias no se refrescarían nunca, sin un solo error.
    await guardar(userA, [ITEM], HACE_UN_DIA);
    await dbService.runWithTenant(userB, (tx) => tx.delete(userTrends));

    const pendientes = await dbService.runWorkerScan((tx) => repo.porRefrescar(tx, AHORA, 200));
    expect(pendientes).toContain(userA);
    expect(pendientes).toContain(userB);
  });

  it("el barrido NO ve a quien tiene una tanda vigente", { timeout: 15_000 }, async () => {
    await guardar(userA, [ITEM], EN_UNA_SEMANA);
    const pendientes = await dbService.runWorkerScan((tx) => repo.porRefrescar(tx, AHORA, 200));
    expect(pendientes).not.toContain(userA);
  });

  it("el barrido salta a las cuentas sin sesión viva", { timeout: 20_000 }, async () => {
    // Sin este filtro el negocio paga una búsqueda por semana por cada cuenta
    // que se registró y no volvió. Quien vuelva entra al pase siguiente.
    const dormido = await nuevoUsuario(false);
    try {
      const pendientes = await dbService.runWorkerScan((tx) => repo.porRefrescar(tx, AHORA, 200));
      expect(pendientes).not.toContain(dormido);
    } finally {
      await dbService.db.delete(users).where(eq(users.id, dormido));
    }
  });

  it("las fuentes propias también están aisladas por tenant", { timeout: 15_000 }, async () => {
    await dbService.runWithTenant(userA, (tx) =>
      tx.insert(trendSources).values({ userId: userA, host: "canal10.tv" }),
    );
    const deA = await dbService.runWithTenant(userA, (tx) => repo.fuentes(tx));
    const deB = await dbService.runWithTenant(userB, (tx) => repo.fuentes(tx));
    expect(deA.map((f) => f.host)).toContain("canal10.tv");
    expect(deB).toHaveLength(0);
  });
});
