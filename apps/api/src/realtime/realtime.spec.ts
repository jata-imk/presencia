import { randomUUID } from "node:crypto";
import { inArray, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { CardContent } from "@presencia/shared";
import { chats, users } from "../db/schema.js";
import { FakePublishingProvider } from "../publishing/fake.provider.js";
import type { DbService as DbServiceType } from "../db/db.service.js";
import type { CardsRepository as CardsRepositoryType } from "../cards/cards.repository.js";
import type { CardsService as CardsServiceType } from "../cards/cards.service.js";
import type { CardListener as CardListenerType } from "./card-listener.service.js";
import { decodeCardChanged, encodeCardChanged } from "./card-events.js";
import { HEARTBEAT_MS, StreamRegistry, type StreamClient } from "./stream-registry.service.js";

// F8.6: el puente NOTIFY/LISTEN contra Postgres real. Lo que se prueba es
// justo lo que un mock no puede: que el aviso sale de la MISMA transacción que
// la escritura (solo con COMMIT) y que el listener, con su propia conexión,
// termina escribiendo la card en el stream del dueño.

class FakeClient implements StreamClient {
  chunks: string[] = [];
  ended = false;
  write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }
  end(): void {
    this.ended = true;
  }
  /** Los eventos recibidos, ya parseados. */
  events(): { event: string; data: { id?: string; status?: string; chatId?: string | null } }[] {
    return this.chunks
      .filter((chunk) => chunk.startsWith("event: "))
      .map((chunk) => {
        const [eventLine, dataLine] = chunk.split("\n");
        return {
          event: eventLine!.slice("event: ".length),
          data: JSON.parse(dataLine!.slice("data: ".length)) as {
            id?: string;
            status?: string;
            chatId?: string | null;
          },
        };
      });
  }
}

/**
 * Los eventos de la pestaña sin los latidos.
 *
 * El heartbeat corre cada 20 s con reloj real en el bloque contra la DB, así
 * que una corrida lenta —la suite completa contra el VPS— mete un `ping` en
 * medio y tumba cualquier aserción sobre el arreglo entero. El latido es ruido
 * ambiental, no parte de lo que estas pruebas afirman.
 */
function sinPing(tab: { events: () => { event: string }[] }): { event: string }[] {
  return tab.events().filter((evento) => evento.event !== "ping");
}

const TEXT: CardContent = {
  archetype: "text_first",
  body: "Mañana publico el guion del reel.",
  hashtags: [],
  assetIds: [],
};

async function until(check: () => boolean, timeoutMs = 15_000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("No llegó a tiempo");
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe("card-events", () => {
  it("ida y vuelta, y rechaza lo que no es del contrato", () => {
    const event = { userId: randomUUID(), cardId: randomUUID() };
    expect(decodeCardChanged(encodeCardChanged(event))).toEqual(event);
    expect(decodeCardChanged(undefined)).toBeNull();
    expect(decodeCardChanged("hola")).toBeNull();
    expect(decodeCardChanged(`${event.userId}:no-es-uuid`)).toBeNull();
    expect(decodeCardChanged(`${encodeCardChanged(event)}:extra`)).toBeNull();
  });
});

describe("StreamRegistry", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("un solo heartbeat escribe a todas las conexiones", () => {
    vi.useFakeTimers();
    const registry = new StreamRegistry();
    const a = new FakeClient();
    const b = new FakeClient();
    registry.add("u1", a);
    registry.add("u2", b);
    vi.advanceTimersByTime(HEARTBEAT_MS);
    expect(a.events()).toEqual([{ event: "ping", data: {} }]);
    expect(b.events()).toEqual([{ event: "ping", data: {} }]);
    registry.onModuleDestroy();
    expect(a.ended && b.ended).toBe(true);
  });

  it("send solo llega al dueño; remove limpia el Set y la clave", () => {
    const registry = new StreamRegistry();
    const tab1 = new FakeClient();
    const tab2 = new FakeClient();
    const other = new FakeClient();
    registry.add("u1", tab1);
    registry.add("u1", tab2);
    registry.add("u2", other);

    registry.send("u1", "card", { id: "c1" });
    expect(tab1.events()).toEqual([{ event: "card", data: { id: "c1" } }]);
    expect(tab2.events()).toHaveLength(1);
    expect(other.events()).toHaveLength(0);

    registry.remove("u1", tab1);
    expect(registry.has("u1")).toBe(true);
    registry.remove("u1", tab2);
    // Sin la clave: cada usuario que alguna vez abrió la app dejaría un Set vacío.
    expect(registry.has("u1")).toBe(false);
    expect(registry.size()).toBe(1);
    registry.onModuleDestroy();
  });
});

// Timeouts largos como el resto de los specs con base real: cada test hace
// varios viajes por el túnel de dev, compitiendo con la suite en paralelo.
describe("NOTIFY → LISTEN → stream", { timeout: 30_000 }, () => {
  let dbService: DbServiceType;
  let cardsRepo: CardsRepositoryType;
  let service: CardsServiceType;
  let registry: StreamRegistry;
  let listener: CardListenerType;
  let userA: string;
  let userB: string;
  let chatA: string;

  beforeAll(async () => {
    try {
      process.loadEnvFile("../../.env");
    } catch {
      // En CI las variables vienen del entorno.
    }
    const { DbService } = await import("../db/db.service.js");
    const { CardsRepository } = await import("../cards/cards.repository.js");
    const { ChannelsRepository } = await import("../channels/channels.repository.js");
    const { CardsService } = await import("../cards/cards.service.js");
    const { CardListener } = await import("./card-listener.service.js");

    dbService = new DbService();
    cardsRepo = new CardsRepository();
    service = new CardsService(
      dbService,
      cardsRepo,
      new ChannelsRepository(),
      new FakePublishingProvider(),
    );
    registry = new StreamRegistry();
    listener = new CardListener(registry, service);
    await listener.onModuleInit();

    const [a, b] = await dbService.db
      .insert(users)
      .values([
        { name: "Realtime A", email: `rt-a-${randomUUID()}@test.local` },
        { name: "Realtime B", email: `rt-b-${randomUUID()}@test.local` },
      ])
      .returning({ id: users.id });
    if (!a || !b) throw new Error("No se pudieron crear los usuarios de prueba");
    userA = a.id;
    userB = b.id;
    chatA = await dbService.runWithTenant(userA, async (tx) => {
      const [chat] = await tx.insert(chats).values({ userId: userA }).returning({ id: chats.id });
      return chat!.id;
    });
  }, 30_000);

  afterAll(async () => {
    await listener.onModuleDestroy();
    registry.onModuleDestroy();
    await dbService.db.delete(users).where(inArray(users.id, [userA, userB]));
    await dbService.onModuleDestroy();
  }, 30_000);

  function connect(userId: string): FakeClient {
    const client = new FakeClient();
    registry.add(userId, client);
    return client;
  }

  it("una escritura commiteada llega al stream del dueño con la card completa", async () => {
    const tab = connect(userA);
    const card = await dbService.runWithTenant(userA, (tx) =>
      cardsRepo.insertCard(tx, {
        userId: userA,
        chatId: chatA,
        network: "linkedin",
        content: TEXT,
      }),
    );
    await until(() => tab.events().some((e) => e.data.id === card.id));
    expect(tab.events().find((e) => e.data.id === card.id)).toMatchObject({
      event: "card",
      data: { id: card.id, status: "draft" },
    });
    registry.remove(userA, tab);
  });

  it("con ROLLBACK no avisa nada", async () => {
    const tab = connect(userA);
    const rolledBack = randomUUID();
    await expect(
      dbService.runWithTenant(userA, async (tx) => {
        await tx.insert(chats).values({ id: rolledBack, userId: userA });
        await cardsRepo.insertCard(tx, {
          userId: userA,
          chatId: rolledBack,
          network: "linkedin",
          content: TEXT,
        });
        throw new Error("abortar");
      }),
    ).rejects.toThrow("abortar");
    // Una escritura commiteada DESPUÉS sirve de testigo: si la del rollback
    // hubiera avisado, habría llegado antes que esta.
    const witness = await dbService.runWithTenant(userA, (tx) =>
      cardsRepo.insertCard(tx, { userId: userA, chatId: chatA, network: "x", content: TEXT }),
    );
    await until(() => tab.events().some((e) => e.data.id === witness.id));
    expect(sinPing(tab)).toHaveLength(1);
    registry.remove(userA, tab);
  });

  it("el cierre en lote de huérfanas avisa de cada card que la guardia dejó pasar", async () => {
    const tab = connect(userA);
    const [orphan, untouched] = await dbService.runWithTenant(userA, async (tx) => {
      const rows = [];
      for (const network of ["linkedin", "facebook"] as const) {
        const card = await cardsRepo.insertCard(tx, {
          userId: userA,
          chatId: chatA,
          network,
          content: TEXT,
        });
        rows.push(
          await cardsRepo.markScheduling(tx, card.id, {
            socialAccountId: null as unknown as string,
            scheduledAt: new Date(Date.now() + 3_600_000),
          }),
        );
      }
      return rows;
    });
    await until(() => tab.events().filter((e) => e.data.status === "scheduled").length >= 2);

    // Solo `orphan` pasa la guardia: el cutoff es posterior a su updated_at.
    // `untouched` va en la lista pero con `updated_at` movido al futuro.
    await dbService.runWithTenant(userA, async (tx) => {
      await tx.execute(
        sql`update publication_cards set updated_at = now() + interval '1 hour' where id = ${untouched!.id}`,
      );
    });
    tab.chunks = [];
    await dbService.runWithTenant(userA, (tx) =>
      cardsRepo.markOrphansFailed(tx, [orphan!.id, untouched!.id], new Date(Date.now() + 60_000), {
        reason: "test",
      }),
    );
    await until(() => tab.events().some((e) => e.data.id === orphan!.id));
    // Margen para que un aviso de más, si lo hubiera, alcance a llegar.
    await new Promise((r) => setTimeout(r, 500));
    expect(tab.events().map((e) => [e.data.id, e.data.status])).toEqual([[orphan!.id, "failed"]]);
    registry.remove(userA, tab);
  });

  it("borrar un chat avisa de sus cards, que el SET NULL del FK haría en silencio", async () => {
    const tab = connect(userA);
    const doomedChat = await dbService.runWithTenant(userA, async (tx) => {
      const [chat] = await tx.insert(chats).values({ userId: userA }).returning({ id: chats.id });
      return chat!.id;
    });
    const card = await dbService.runWithTenant(userA, (tx) =>
      cardsRepo.insertCard(tx, {
        userId: userA,
        chatId: doomedChat,
        network: "linkedin",
        content: TEXT,
      }),
    );
    await until(() => tab.events().some((e) => e.data.id === card.id));
    tab.chunks = [];

    await dbService.runWithTenant(userA, async (tx) => {
      await cardsRepo.detachFromChat(tx, doomedChat);
      await tx.delete(chats).where(inArray(chats.id, [doomedChat]));
    });
    await until(() => tab.events().some((e) => e.data.id === card.id));
    expect(tab.events()[0]).toMatchObject({ event: "card", data: { id: card.id, chatId: null } });
    registry.remove(userA, tab);
  });

  it("updated_at sigue el orden real de las escrituras aunque una espere el lock", async () => {
    const card = await dbService.runWithTenant(userA, (tx) =>
      cardsRepo.insertCard(tx, {
        userId: userA,
        chatId: chatA,
        network: "linkedin",
        content: TEXT,
      }),
    );
    let releaseLock!: () => void;
    const lockHeld = new Promise<void>((r) => (releaseLock = r));
    let lockTaken!: () => void;
    const locked = new Promise<void>((r) => (lockTaken = r));

    // A toma el lock de la fila y escribe DESPUÉS de que B ya armó su UPDATE.
    const first = dbService.runWithTenant(userA, async (tx) => {
      await tx.execute(sql`select id from publication_cards where id = ${card.id} for update`);
      lockTaken();
      await lockHeld;
      return cardsRepo.markFailed(tx, card.id, { reason: "a" });
    });
    await locked;
    // B arranca antes pero espera el lock: termina escribiendo último.
    const second = dbService.runWithTenant(userA, (tx) => cardsRepo.cancelSchedule(tx, card.id));
    await new Promise((r) => setTimeout(r, 300));
    releaseLock();
    const a = await first;
    const b = await second;
    // El navegador descarta lo "más viejo": la última escritura tiene que
    // tener el updated_at mayor, o su evento se perdería.
    expect(b.updatedAt.getTime()).toBeGreaterThan(a.updatedAt.getTime());
  });

  it("una card que ya no existe llega como card-deleted", async () => {
    const tab = connect(userA);
    const ghost = randomUUID();
    await listener.handle(encodeCardChanged({ userId: userA, cardId: ghost }));
    expect(sinPing(tab)).toEqual([{ event: "card-deleted", data: { id: ghost } }]);
    registry.remove(userA, tab);
  });

  it("nunca empuja la card de otro usuario, y sin conexiones no lee nada", async () => {
    const card = await dbService.runWithTenant(userA, (tx) =>
      cardsRepo.insertCard(tx, {
        userId: userA,
        chatId: chatA,
        network: "linkedin",
        content: TEXT,
      }),
    );
    const spy = vi.spyOn(service, "findDto");

    // Un payload (a mano) que dice que la card de A es de B: el RLS de B no la
    // ve, así que B recibe card-deleted y nunca el contenido.
    const tabB = connect(userB);
    await listener.handle(encodeCardChanged({ userId: userB, cardId: card.id }));
    expect(tabB.events()).toEqual([{ event: "card-deleted", data: { id: card.id } }]);
    registry.remove(userB, tabB);

    spy.mockClear();
    await listener.handle(encodeCardChanged({ userId: userB, cardId: card.id }));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
