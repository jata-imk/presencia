import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CardContent, SocialNetwork } from "@presencia/shared";
import { assets, chats, imageGenerations, publicationCards, users } from "../db/schema.js";
import { LocalAssetStorage } from "../assets/asset-storage.js";
import { InvalidImageError } from "../assets/image-inspect.js";
import { solidPng } from "../images/fake-image.provider.js";
import type { DbService as DbServiceType } from "../db/db.service.js";
import type { LibraryService as LibraryServiceType } from "./library.service.js";

// Biblioteca contra Postgres real (F12 PR2). Lo que se prueba vive en el SQL:
// que los usos se derivan de las cards y no de `card_id`, que un recorte
// cuenta como su original, que los filtros y el cursor dicen la verdad, y que
// el RLS también aplica dentro de los CTE.

let dbService: DbServiceType;
let library: LibraryServiceType;
let storageDir: string;
let userA: string;
let userB: string;
let chatA: string;

/** Un instante fijo en el pasado: el orden de las pruebas no depende del reloj. */
const BASE = Date.parse("2026-01-10T12:00:00.000Z");
const at = (minutes: number) => new Date(BASE + minutes * 60_000);

const visual = (assetIds: string[]): CardContent => ({
  archetype: "visual_first",
  caption: "c",
  hashtags: [],
  assetIds,
});

async function createCard(
  owner: string,
  assetIds: string[],
  status: "draft" | "scheduled" | "published" | "failed" | "canceled" = "draft",
  network: SocialNetwork = "instagram",
  chatId: string | null = null,
): Promise<string> {
  return dbService.runWithTenant(owner, async (tx) => {
    const [row] = await tx
      .insert(publicationCards)
      .values({
        userId: owner,
        chatId,
        network,
        archetype: "visual_first",
        content: visual(assetIds),
        status,
        scheduledAt: status === "scheduled" ? new Date(Date.now() + 3_600_000) : null,
        publishedAt: status === "published" ? new Date() : null,
      })
      .returning({ id: publicationCards.id });
    if (!row) throw new Error("No se pudo crear la card de prueba");
    return row.id;
  });
}

async function putInCard(owner: string, cardId: string, assetIds: string[]): Promise<void> {
  await dbService.runWithTenant(owner, async (tx) => {
    await tx
      .update(publicationCards)
      .set({ content: visual(assetIds) })
      .where(eq(publicationCards.id, cardId));
  });
}

interface AssetInput {
  source?: "generated" | "uploaded";
  cardId?: string | null;
  chatId?: string | null;
  createdAt?: Date;
  metadata?: Record<string, unknown>;
}

async function createAsset(owner: string, input: AssetInput = {}): Promise<string> {
  const id = randomUUID();
  await dbService.runWithTenant(owner, (tx) =>
    tx.insert(assets).values({
      id,
      userId: owner,
      cardId: input.cardId ?? null,
      chatId: input.chatId ?? null,
      storageKey: `${owner}/${id}.png`,
      mimeType: "image/png",
      sizeBytes: 1234,
      source: input.source ?? "generated",
      metadata: { width: 1080, height: 1350, ...input.metadata },
      createdAt: input.createdAt ?? new Date(),
    }),
  );
  return id;
}

async function createGeneration(
  owner: string,
  assetId: string,
  input: {
    kind?: "generate" | "edit";
    description?: string | null;
    prompt?: string;
    instruction?: string | null;
    parentAssetId?: string | null;
    status?: "pending" | "succeeded";
    createdAt?: Date;
  } = {},
): Promise<void> {
  await dbService.runWithTenant(owner, (tx) =>
    tx.insert(imageGenerations).values({
      userId: owner,
      batchId: randomUUID(),
      kind: input.kind ?? "generate",
      providerSlot: "1",
      provider: "fake",
      model: "fake",
      prompt: input.prompt ?? "Estilo de la imagen: foto.\n\nSin texto, letras ni logotipos.",
      description: input.description ?? null,
      instruction: input.instruction ?? null,
      parentAssetId: input.parentAssetId ?? null,
      aspectRatio: "4:5",
      status: input.status ?? "succeeded",
      assetId: input.status === "pending" ? null : assetId,
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    }),
  );
}

const idsOf = (page: { items: { id: string }[] }) => page.items.map((i) => i.id);

describe("LibraryService", { timeout: 30_000 }, () => {
  beforeAll(async () => {
    try {
      process.loadEnvFile("../../.env");
    } catch {
      // sin .env: se usa el process.env tal cual (CI)
    }
    const { DbService } = await import("../db/db.service.js");
    const { AssetsRepository } = await import("../assets/assets.repository.js");
    const { AssetsService } = await import("../assets/assets.service.js");
    const { LibraryRepository } = await import("./library.repository.js");
    const { LibraryService } = await import("./library.service.js");
    const { CardsRepository } = await import("../cards/cards.repository.js");

    storageDir = await mkdtemp(path.join(tmpdir(), "presencia-library-"));
    dbService = new DbService();
    library = new LibraryService(
      dbService,
      new LibraryRepository(),
      new AssetsService(dbService, new AssetsRepository(), new LocalAssetStorage(storageDir)),
      new CardsRepository(),
    );

    const [a, b] = await dbService.db
      .insert(users)
      .values([
        { name: "Library A", email: `library-a-${randomUUID()}@test.local` },
        { name: "Library B", email: `library-b-${randomUUID()}@test.local` },
      ])
      .returning({ id: users.id });
    if (!a || !b) throw new Error("No se pudieron crear los usuarios de prueba");
    userA = a.id;
    userB = b.id;
    chatA = await dbService.runWithTenant(userA, async (tx) => {
      const [chat] = await tx
        .insert(chats)
        .values({ userId: userA, title: "Café de especialidad para Instagram" })
        .returning({ id: chats.id });
      if (!chat) throw new Error("No se pudo crear el chat de prueba");
      return chat.id;
    });
  });

  afterAll(async () => {
    await dbService.db.delete(users).where(inArray(users.id, [userA, userB]));
    await dbService.onModuleDestroy();
    await rm(storageDir, { recursive: true, force: true });
  });

  // Cada prueba usa un usuario limpio cuando cuenta filas: así una no ve las
  // imágenes de otra.
  async function freshUser(): Promise<string> {
    const [row] = await dbService.db
      .insert(users)
      .values({ name: "Library tmp", email: `library-tmp-${randomUUID()}@test.local` })
      .returning({ id: users.id });
    if (!row) throw new Error("No se pudo crear el usuario de prueba");
    return row.id;
  }

  async function dropUser(id: string): Promise<void> {
    await dbService.db.delete(users).where(inArray(users.id, [id]));
  }

  it("dice dónde nació cada imagen, dónde se usa y en qué quedó", async () => {
    const cardId = await createCard(userA, [], "draft", "instagram", chatA);
    const elegida = await createAsset(userA, { cardId, chatId: chatA, createdAt: at(1) });
    const descartada = await createAsset(userA, { cardId, chatId: chatA, createdAt: at(2) });
    const suelta = await createAsset(userA, { source: "uploaded", createdAt: at(3) });
    await putInCard(userA, cardId, [elegida]);

    const page = await library.list(userA, { createdFrom: at(0).toISOString() });
    const byId = new Map(page.items.map((i) => [i.id, i]));

    expect(byId.get(elegida)).toMatchObject({
      kind: "image",
      origin: "generated",
      state: "chosen",
      width: 1080,
      height: 1350,
      sizeBytes: 1234,
      chat: { id: chatA, title: "Café de especialidad para Instagram" },
      bornInCard: { id: cardId, chatId: chatA, network: "instagram", status: "draft" },
      uses: [{ id: cardId, chatId: chatA, network: "instagram", status: "draft" }],
    });
    expect(byId.get(descartada)).toMatchObject({ state: "discarded", uses: [] });
    expect(byId.get(descartada)?.bornInCard?.id).toBe(cardId);
    expect(byId.get(suelta)).toMatchObject({
      origin: "uploaded",
      state: "unused",
      chat: null,
      bornInCard: null,
      uses: [],
    });
    // De lo más nuevo a lo más viejo.
    expect(idsOf(page).filter((id) => [elegida, descartada, suelta].includes(id))).toEqual([
      suelta,
      descartada,
      elegida,
    ]);
  });

  it("una imagen usada en otra card sigue siendo una sola, con dos usos", async () => {
    const owner = await freshUser();
    try {
      const nacio = await createCard(owner, [], "published", "instagram");
      const asset = await createAsset(owner, { cardId: nacio });
      await putInCard(owner, nacio, [asset]);
      const otra = await createCard(owner, [asset], "draft", "linkedin");

      const page = await library.list(owner, {});

      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.bornInCard?.id).toBe(nacio);
      expect(page.items[0]?.uses.map((u) => u.id).sort()).toEqual([nacio, otra].sort());
    } finally {
      await dropUser(owner);
    }
  });

  it("oculta los recortes y cuenta su uso como uso de la original", async () => {
    const owner = await freshUser();
    try {
      const cardId = await createCard(owner, [], "scheduled", "instagram");
      const original = await createAsset(owner, { cardId, createdAt: at(1) });
      const recorte = await createAsset(owner, {
        cardId,
        createdAt: at(2),
        metadata: { croppedFrom: original },
      });
      // En el carrusel va el recorte, no la original.
      await putInCard(owner, cardId, [recorte]);

      const page = await library.list(owner, {});

      expect(idsOf(page)).toEqual([original]);
      expect(page.items[0]).toMatchObject({
        state: "chosen",
        uses: [{ id: cardId, status: "scheduled" }],
      });
    } finally {
      await dropUser(owner);
    }
  });

  it("filtra por origen, red, estado de la card, elegidas y fecha", async () => {
    const owner = await freshUser();
    try {
      const borrador = await createCard(owner, [], "draft", "instagram");
      const publicada = await createCard(owner, [], "published", "linkedin");
      const enBorrador = await createAsset(owner, { cardId: borrador, createdAt: at(1) });
      const variante = await createAsset(owner, { cardId: borrador, createdAt: at(2) });
      const enPublicada = await createAsset(owner, { cardId: publicada, createdAt: at(3) });
      const subida = await createAsset(owner, { source: "uploaded", createdAt: at(4) });
      await putInCard(owner, borrador, [enBorrador]);
      await putInCard(owner, publicada, [enPublicada]);

      const list = async (query: Parameters<typeof library.list>[1]) =>
        idsOf(await library.list(owner, query));

      expect(await list({ origin: "uploaded" })).toEqual([subida]);
      expect(await list({ origin: "generated" })).toEqual([enPublicada, variante, enBorrador]);
      expect(await list({ network: "linkedin" })).toEqual([enPublicada]);
      // Una descartada cuenta por la card donde nació.
      expect(await list({ network: "instagram" })).toEqual([variante, enBorrador]);
      expect(await list({ cardStatus: "published" })).toEqual([enPublicada]);
      expect(await list({ state: "chosen" })).toEqual([enPublicada, enBorrador]);
      expect(await list({ state: "discarded" })).toEqual([variante]);
      // "Listas para publicar": elegidas en cards en borrador.
      expect(await list({ state: "chosen", cardStatus: "draft" })).toEqual([enBorrador]);
      expect(await list({ createdFrom: at(3).toISOString() })).toEqual([subida, enPublicada]);
    } finally {
      await dropUser(owner);
    }
  });

  it("red y estado se filtran sobre la misma card, no sobre dos distintas", async () => {
    const owner = await freshUser();
    try {
      const asset = await createAsset(owner, {});
      await createCard(owner, [asset], "draft", "instagram");
      await createCard(owner, [asset], "published", "linkedin");

      const list = async (query: Parameters<typeof library.list>[1]) =>
        idsOf(await library.list(owner, query));

      expect(await list({ network: "instagram", cardStatus: "draft" })).toEqual([asset]);
      expect(await list({ network: "linkedin", cardStatus: "published" })).toEqual([asset]);
      // Está en Instagram y está en una publicada, pero no en una publicada de Instagram.
      expect(await list({ network: "instagram", cardStatus: "published" })).toEqual([]);
      expect(await list({ network: "linkedin", cardStatus: "draft" })).toEqual([]);
    } finally {
      await dropUser(owner);
    }
  });

  it("una publicación que falló cuenta como borrador; una cancelada no es un uso", async () => {
    const owner = await freshUser();
    try {
      const enFallida = await createAsset(owner, { createdAt: at(2) });
      await createCard(owner, [enFallida], "failed", "instagram");
      const cancelada = await createCard(owner, [], "canceled", "instagram");
      const enCancelada = await createAsset(owner, { cardId: cancelada, createdAt: at(1) });
      await putInCard(owner, cancelada, [enCancelada]);

      const page = await library.list(owner, {});
      expect(page.items.map((i) => [i.id, i.state])).toEqual([
        [enFallida, "chosen"],
        [enCancelada, "discarded"],
      ]);
      // El filtro no ofrece "falló": esa imagen se busca entre los borradores.
      expect(idsOf(await library.list(owner, { cardStatus: "draft" }))).toEqual([enFallida]);
      expect(idsOf(await library.list(owner, { state: "chosen", cardStatus: "draft" }))).toEqual([
        enFallida,
      ]);
    } finally {
      await dropUser(owner);
    }
  });

  it("una card con el contenido roto no tumba la Biblioteca", async () => {
    const owner = await freshUser();
    try {
      const sana = await createAsset(owner, {});
      const cardId = await createCard(owner, [sana], "draft");
      // Contenido que ningún schema escribiría: assetIds en null, un escalar
      // y un id que no es uuid.
      await dbService.runWithTenant(owner, async (tx) => {
        await tx.insert(publicationCards).values([
          {
            userId: owner,
            network: "instagram",
            archetype: "visual_first",
            content: { archetype: "visual_first", caption: "c", hashtags: [], assetIds: null },
          },
          {
            userId: owner,
            network: "instagram",
            archetype: "visual_first",
            content: { archetype: "visual_first", caption: "c", hashtags: [], assetIds: "x" },
          },
          {
            userId: owner,
            network: "instagram",
            archetype: "visual_first",
            content: {
              archetype: "visual_first",
              caption: "c",
              hashtags: [],
              assetIds: ["no-uuid"],
            },
          },
        ]);
      });

      const page = await library.list(owner, {});
      expect(idsOf(page)).toEqual([sana]);
      expect(page.items[0]?.uses.map((u) => u.id)).toEqual([cardId]);
      expect((await library.summary(owner)).total).toBe(1);
    } finally {
      await dropUser(owner);
    }
  });

  it("busca sin acentos, a media palabra y en el título del chat", async () => {
    const owner = await freshUser();
    try {
      const chatId = await dbService.runWithTenant(owner, async (tx) => {
        const [chat] = await tx
          .insert(chats)
          .values({ userId: owner, title: "Lanzamiento del taller de fotografía" })
          .returning({ id: chats.id });
        return chat!.id;
      });
      const cafe = await createAsset(owner, {
        createdAt: at(1),
        metadata: { alt: "Taza de café humeante" },
      });
      await createGeneration(owner, cafe, { description: "Una taza de café sobre madera" });
      const taller = await createAsset(owner, { chatId, source: "uploaded", createdAt: at(2) });
      const editada = await createAsset(owner, { createdAt: at(3) });
      await createGeneration(owner, editada, {
        kind: "edit",
        prompt: "Sin gente\n\nConserva todo lo que no se pidió cambiar.",
        instruction: "Sin gente",
        parentAssetId: cafe,
      });
      const cienPorCiento = await createAsset(owner, {
        source: "uploaded",
        createdAt: at(4),
        metadata: { originalName: "oferta 100%.png" },
      });

      const search = async (q: string) => idsOf(await library.list(owner, { q }));

      expect(await search("cafe")).toEqual([cafe]);
      expect(await search("CAFÉ madera")).toEqual([cafe]);
      expect(await search("humea")).toEqual([cafe]);
      expect(await search("fotografia")).toEqual([taller]);
      expect(await search("sin gente")).toEqual([editada]);
      // La plantilla de la edición ("Conserva todo…") no es algo que pidió.
      expect(await search("conserva")).toEqual([]);
      // `%` es una letra, no un comodín: sin escaparlo encontraría todo.
      expect(await search("100%")).toEqual([cienPorCiento]);
      expect(await search("%")).toEqual([cienPorCiento]);
      expect(await search("no existe esto")).toEqual([]);
    } finally {
      await dropUser(owner);
    }
  });

  it("muestra lo que pidió el creator, no el prompt compuesto", async () => {
    const owner = await freshUser();
    try {
      const nueva = await createAsset(owner, { createdAt: at(3) });
      await createGeneration(owner, nueva, {
        description: "Un café en el centro de Mérida",
        prompt: "Estilo de la imagen: foto.\n\nQué se ve: Un café en el centro de Mérida",
      });
      const vieja = await createAsset(owner, { createdAt: at(2) });
      await createGeneration(owner, vieja, { prompt: "Un gato, foto realista" });
      const editada = await createAsset(owner, { createdAt: at(1) });
      await createGeneration(owner, editada, {
        kind: "edit",
        prompt: "Más cálida\n\nConserva todo.",
        instruction: "Más cálida",
        parentAssetId: nueva,
      });

      const { items } = await library.list(owner, {});

      expect(items[0]).toMatchObject({
        id: nueva,
        prompt: "Un café en el centro de Mérida",
        instruction: null,
        parentAssetId: null,
      });
      // Anterior a F12, sin recortar: lo único que hay es el prompt completo.
      expect(items[1]).toMatchObject({ id: vieja, prompt: "Un gato, foto realista" });
      expect(items[2]).toMatchObject({
        id: editada,
        prompt: null,
        instruction: "Más cálida",
        parentAssetId: nueva,
      });
    } finally {
      await dropUser(owner);
    }
  });

  it("pagina sin repetir ni saltarse imágenes creadas en el mismo instante", async () => {
    const owner = await freshUser();
    try {
      const creadas: string[] = [];
      // Cinco con la MISMA fecha: solo el id desempata.
      for (let i = 0; i < 5; i++) creadas.push(await createAsset(owner, { createdAt: at(7) }));
      creadas.push(await createAsset(owner, { createdAt: at(1) }));

      const vistas: string[] = [];
      let cursor: string | undefined;
      let vueltas = 0;
      do {
        const page = await library.list(owner, { limit: 2, ...(cursor ? { cursor } : {}) });
        vistas.push(...idsOf(page));
        cursor = page.nextCursor ?? undefined;
        vueltas++;
      } while (cursor && vueltas < 10);

      expect(vueltas).toBe(3);
      expect(vistas).toHaveLength(6);
      expect([...vistas].sort()).toEqual([...creadas].sort());
      // La más vieja, al final.
      expect(vistas.at(-1)).toBe(creadas.at(-1));
    } finally {
      await dropUser(owner);
    }
  });

  it("rechaza un cursor que no entiende", async () => {
    await expect(library.list(userA, { cursor: "no-es-un-cursor" })).rejects.toThrow(
      /No pudimos continuar/,
    );
  });

  it("no deja ver lo de otro usuario, tampoco en los usos", async () => {
    const ajena = await createAsset(userA, {});
    await createCard(userA, [ajena], "draft");
    const propia = await createAsset(userB, {});
    // Una card de B que apunta (por id) a una imagen de A: no la vuelve suya.
    await createCard(userB, [ajena, propia], "published");

    const deB = await library.list(userB, {});
    expect(idsOf(deB)).toEqual([propia]);
    expect(deB.items[0]?.uses).toHaveLength(1);

    const deA = await library.list(userA, { state: "chosen" });
    const vista = deA.items.find((i) => i.id === ajena);
    expect(vista?.uses).toHaveLength(1);
    expect(vista?.uses[0]?.status).toBe("draft");
  });

  it("resume los cuatro atajos con sus conteos y miniaturas", async () => {
    const owner = await freshUser();
    try {
      const ahora = new Date();
      const haceDias = (dias: number) => new Date(ahora.getTime() - dias * 86_400_000);
      const borrador = await createCard(owner, [], "draft");
      const publicada = await createCard(owner, [], "published");
      const reciente = await createAsset(owner, { cardId: borrador, createdAt: haceDias(1) });
      const vieja = await createAsset(owner, { cardId: publicada, createdAt: haceDias(20) });
      const subida = await createAsset(owner, { source: "uploaded", createdAt: haceDias(2) });
      await putInCard(owner, borrador, [reciente]);
      await putInCard(owner, publicada, [vieja]);

      expect(await library.summary(owner, ahora)).toEqual({
        total: 3,
        generatedThisWeek: { count: 1, assetIds: [reciente] },
        readyToPublish: { count: 1, assetIds: [reciente] },
        uploaded: { count: 1, assetIds: [subida] },
        published: { count: 1, assetIds: [vieja] },
      });
    } finally {
      await dropUser(owner);
    }
  });

  it("el resumen cuenta todas pero solo trae las miniaturas más nuevas", async () => {
    const owner = await freshUser();
    try {
      const creadas: string[] = [];
      for (let i = 0; i < 8; i++) {
        creadas.push(await createAsset(owner, { source: "uploaded", createdAt: at(i) }));
      }
      const { uploaded, total } = await library.summary(owner);
      expect(total).toBe(8);
      expect(uploaded.count).toBe(8);
      expect(uploaded.assetIds).toEqual([...creadas].reverse().slice(0, 6));
    } finally {
      await dropUser(owner);
    }
  });

  it("una Biblioteca vacía resume en ceros", async () => {
    const owner = await freshUser();
    try {
      const vacio = { count: 0, assetIds: [] };
      expect(await library.summary(owner)).toEqual({
        total: 0,
        generatedThisWeek: vacio,
        readyToPublish: vacio,
        uploaded: vacio,
        published: vacio,
      });
      expect(await library.list(owner, {})).toEqual({ items: [], nextCursor: null });
    } finally {
      await dropUser(owner);
    }
  });

  it("sube una imagen sin card ni chat y la deja lista para usarse", async () => {
    const owner = await freshUser();
    try {
      const dto = await library.upload(owner, solidPng(40, 50, [200, 80, 120]), "mi foto.png");

      expect(dto).toMatchObject({
        kind: "image",
        origin: "uploaded",
        mimeType: "image/png",
        width: 40,
        height: 50,
        originalName: "mi foto.png",
        prompt: null,
        chat: null,
        bornInCard: null,
        uses: [],
        state: "unused",
      });
      expect(existsSync(path.join(storageDir, owner, `${dto.id}.png`))).toBe(true);
      expect(idsOf(await library.list(owner, {}))).toEqual([dto.id]);
    } finally {
      await dropUser(owner);
    }
  });

  it("no acepta un archivo que no es imagen", async () => {
    await expect(
      library.upload(userA, new TextEncoder().encode("no soy una imagen")),
    ).rejects.toBeInstanceOf(InvalidImageError);
  });

  // ── PR 4: detalle con historial de versiones ─────────────────────────

  async function cardContent(owner: string, cardId: string): Promise<CardContent> {
    return dbService.runWithTenant(owner, async (tx) => {
      const [row] = await tx
        .select({ content: publicationCards.content })
        .from(publicationCards)
        .where(eq(publicationCards.id, cardId));
      if (!row) throw new Error("No está la card");
      return row.content as CardContent;
    });
  }

  async function assetExists(owner: string, id: string): Promise<boolean> {
    return dbService.runWithTenant(owner, async (tx) => {
      const rows = await tx.select({ id: assets.id }).from(assets).where(eq(assets.id, id));
      return rows.length > 0;
    });
  }

  const cropOf = (original: string) => ({ croppedFrom: original, width: 1080, height: 1080 });

  it("el detalle trae la original y todas sus ediciones, desde cualquier versión", async () => {
    const owner = await freshUser();
    try {
      const v1 = await createAsset(owner, { createdAt: at(1) });
      await createGeneration(owner, v1, { description: "café en la barra" });
      const v2 = await createAsset(owner, { createdAt: at(2) });
      await createGeneration(owner, v2, {
        kind: "edit",
        instruction: "Más cálida",
        parentAssetId: v1,
      });
      const v3 = await createAsset(owner, { createdAt: at(3) });
      await createGeneration(owner, v3, {
        kind: "edit",
        instruction: "Sin taza",
        parentAssetId: v2,
      });
      // Una rama: otra edición de la original.
      const rama = await createAsset(owner, { createdAt: at(4) });
      await createGeneration(owner, rama, {
        kind: "edit",
        instruction: "Blanco y negro",
        parentAssetId: v1,
      });
      // Otra imagen cualquiera no entra.
      await createAsset(owner, { createdAt: at(5) });

      for (const desde of [v1, v2, v3, rama]) {
        const detail = await library.detail(owner, desde);
        expect(detail?.id).toBe(desde);
        expect(detail?.versions.map((v) => v.assetId)).toEqual([v1, v2, v3, rama]);
      }
      const detail = await library.detail(owner, v3);
      expect(detail?.versions.map((v) => [v.kind, v.instruction])).toEqual([
        ["original", null],
        ["edit", "Más cálida"],
        ["edit", "Sin taza"],
        ["edit", "Blanco y negro"],
      ]);
      expect(detail?.versions[0]).toMatchObject({ width: 1080, height: 1350 });
    } finally {
      await dropUser(owner);
    }
  });

  it("el historial pasa por los recortes sin mostrarlos", async () => {
    const owner = await freshUser();
    try {
      const original = await createAsset(owner, { createdAt: at(1) });
      const recorte = await createAsset(owner, { createdAt: at(2), metadata: cropOf(original) });
      // En un carrusel se edita la que se ve: el recorte.
      const editada = await createAsset(owner, { createdAt: at(3) });
      await createGeneration(owner, editada, {
        kind: "edit",
        instruction: "Más luz",
        parentAssetId: recorte,
      });

      for (const desde of [original, editada]) {
        const detail = await library.detail(owner, desde);
        expect(detail?.versions.map((v) => v.assetId)).toEqual([original, editada]);
      }
      // Un recorte no tiene detalle propio.
      expect(await library.detail(owner, recorte)).toBeNull();
    } finally {
      await dropUser(owner);
    }
  });

  it("una sola imagen tiene historial de una; si se borró su padre, no se inventa la original", async () => {
    const owner = await freshUser();
    try {
      const sola = await createAsset(owner, { source: "uploaded" });
      expect((await library.detail(owner, sola))?.versions).toHaveLength(1);

      const padre = await createAsset(owner, { createdAt: at(1) });
      const hija = await createAsset(owner, { createdAt: at(2) });
      await createGeneration(owner, hija, {
        kind: "edit",
        instruction: "Más fría",
        parentAssetId: padre,
      });
      expect((await library.remove(owner, [padre])).deleted).toEqual([padre]);
      const detail = await library.detail(owner, hija);
      expect(detail?.versions).toEqual([
        expect.objectContaining({ assetId: hija, kind: "edit", instruction: "Más fría" }),
      ]);
    } finally {
      await dropUser(owner);
    }
  });

  it("el detalle de otro usuario no existe", async () => {
    const ajena = await createAsset(userB);
    expect(await library.detail(userA, ajena)).toBeNull();
    expect(await library.detail(userB, ajena)).not.toBeNull();
  });

  // ── PR 4: eliminar ────────────────────────────────────────────────────

  it("elimina una imagen que no está en ninguna card, con su archivo", async () => {
    const owner = await freshUser();
    try {
      const dto = await library.upload(owner, solidPng(32, 32, [51, 102, 170]), "borrar.png");
      const file = path.join(storageDir, owner, `${dto.id}.png`);
      expect(existsSync(file)).toBe(true);
      expect(await library.remove(owner, [dto.id])).toEqual({ deleted: [dto.id], blocked: [] });
      expect(await assetExists(owner, dto.id)).toBe(false);
      expect(existsSync(file)).toBe(false);
    } finally {
      await dropUser(owner);
    }
  });

  it("en un borrador se quita de la card; en una que falló también", async () => {
    const owner = await freshUser();
    try {
      const imagen = await createAsset(owner);
      const otra = await createAsset(owner);
      const borrador = await createCard(owner, [imagen]);
      const fallida = await createCard(owner, [imagen], "failed");
      const intacta = await createCard(owner, [otra]);

      expect((await library.remove(owner, [imagen])).deleted).toEqual([imagen]);
      expect((await cardContent(owner, borrador)).assetIds).toEqual([]);
      expect((await cardContent(owner, fallida)).assetIds).toEqual([]);
      expect((await cardContent(owner, intacta)).assetIds).toEqual([otra]);
      expect(await assetExists(owner, imagen)).toBe(false);
    } finally {
      await dropUser(owner);
    }
  });

  it("en un carrusel el slide se queda sin imagen, y el recorte se va con su original", async () => {
    const owner = await freshUser();
    try {
      const original = await createAsset(owner);
      const recorte = await createAsset(owner, { metadata: cropOf(original) });
      const otra = await createAsset(owner);
      const [s1, s2] = [randomUUID(), randomUUID()];
      const cardId = await createCard(owner, []);
      await dbService.runWithTenant(owner, (tx) =>
        tx
          .update(publicationCards)
          .set({
            content: {
              ...visual([recorte, otra]),
              slides: [
                { id: s1, imagePrompt: "portada", assetId: recorte },
                { id: s2, assetId: otra },
              ],
            },
          })
          .where(eq(publicationCards.id, cardId)),
      );

      expect((await library.remove(owner, [original])).deleted).toEqual([original]);
      const content = await cardContent(owner, cardId);
      expect(content.assetIds).toEqual([otra]);
      expect(content).toMatchObject({
        slides: [
          { id: s1, imagePrompt: "portada" },
          { id: s2, assetId: otra },
        ],
      });
      expect(await assetExists(owner, original)).toBe(false);
      expect(await assetExists(owner, recorte)).toBe(false);
    } finally {
      await dropUser(owner);
    }
  });

  it("en una publicada se elimina sin tocar la card", async () => {
    const owner = await freshUser();
    try {
      const imagen = await createAsset(owner);
      const publicada = await createCard(owner, [imagen], "published");
      expect((await library.remove(owner, [imagen])).deleted).toEqual([imagen]);
      expect((await cardContent(owner, publicada)).assetIds).toEqual([imagen]);
      expect(await assetExists(owner, imagen)).toBe(false);
    } finally {
      await dropUser(owner);
    }
  });

  it("en una programada no se elimina, y nada cambia", async () => {
    const owner = await freshUser();
    try {
      const imagen = await createAsset(owner);
      const borrador = await createCard(owner, [imagen]);
      await createCard(owner, [imagen], "scheduled", "linkedin");
      expect(await library.remove(owner, [imagen])).toEqual({
        deleted: [],
        blocked: [{ id: imagen, reason: "scheduled", network: "linkedin" }],
      });
      expect(await assetExists(owner, imagen)).toBe(true);
      // El borrador tampoco la perdió: no se elimina a medias.
      expect((await cardContent(owner, borrador)).assetIds).toEqual([imagen]);
    } finally {
      await dropUser(owner);
    }
  });

  it("un recorte en una programada también bloquea a su original", async () => {
    const owner = await freshUser();
    try {
      const original = await createAsset(owner);
      const recorte = await createAsset(owner, { metadata: cropOf(original) });
      await createCard(owner, [recorte], "scheduled");
      const result = await library.remove(owner, [original]);
      expect(result.blocked.map((b) => b.reason)).toEqual(["scheduled"]);
      expect(await assetExists(owner, recorte)).toBe(true);
    } finally {
      await dropUser(owner);
    }
  });

  it("con una edición en curso no se elimina; una que murió hace rato no bloquea", async () => {
    const owner = await freshUser();
    try {
      const imagen = await createAsset(owner);
      await createGeneration(owner, imagen, {
        kind: "edit",
        instruction: "Más cálida",
        parentAssetId: imagen,
        status: "pending",
      });
      expect((await library.remove(owner, [imagen])).blocked).toEqual([
        { id: imagen, reason: "editing" },
      ]);

      const vieja = await createAsset(owner);
      await createGeneration(owner, vieja, {
        kind: "edit",
        instruction: "Más fría",
        parentAssetId: vieja,
        status: "pending",
        createdAt: new Date(Date.now() - 60 * 60_000),
      });
      expect((await library.remove(owner, [vieja])).deleted).toEqual([vieja]);
    } finally {
      await dropUser(owner);
    }
  });

  it("varias a la vez: las bloqueadas se quedan y las demás se eliminan", async () => {
    const owner = await freshUser();
    try {
      const a = await createAsset(owner);
      const b = await createAsset(owner);
      const c = await createAsset(owner);
      await createCard(owner, [b], "scheduled", "facebook");
      const result = await library.remove(owner, [a, b, c, a]);
      expect(result.deleted).toEqual([a, c]);
      expect(result.blocked).toEqual([{ id: b, reason: "scheduled", network: "facebook" }]);
    } finally {
      await dropUser(owner);
    }
  });

  it("no elimina lo de otro usuario, ni un recorte suelto", async () => {
    const ajena = await createAsset(userB);
    await library.remove(userA, [ajena]);
    expect(await assetExists(userB, ajena)).toBe(true);

    const owner = await freshUser();
    try {
      const original = await createAsset(owner);
      const recorte = await createAsset(owner, { metadata: cropOf(original) });
      expect(await library.remove(owner, [recorte])).toEqual({ deleted: [], blocked: [] });
      expect(await assetExists(owner, recorte)).toBe(true);
    } finally {
      await dropUser(owner);
    }
  });
});

describe("cursor de Biblioteca", () => {
  it("va y vuelve sin perder los microsegundos", async () => {
    const { decodeCursor, encodeCursor } = await import("./library.service.js");
    const cursor = { at: "2026-11-13 10:42:01.123456+00", id: randomUUID() };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it("devuelve null con basura en vez de lanzar", async () => {
    const { decodeCursor } = await import("./library.service.js");
    expect(decodeCursor("%%%")).toBeNull();
    expect(decodeCursor(Buffer.from('["x","no-uuid"]').toString("base64url"))).toBeNull();
    expect(decodeCursor(Buffer.from('{"a":1}').toString("base64url"))).toBeNull();
    // Bien formado, pero la fecha iría directo a un `::timestamptz`.
    const conFecha = (at: string) =>
      Buffer.from(JSON.stringify([at, randomUUID()])).toString("base64url");
    expect(decodeCursor(conFecha("abc"))).toBeNull();
    expect(decodeCursor(conFecha("2026-11-13T10:42:01.123Z"))).toBeNull();
    expect(decodeCursor(conFecha("2026-11-13 10:42:01+00; drop table assets"))).toBeNull();
    expect(decodeCursor(conFecha("2026-11-13 10:42:01-06"))).not.toBeNull();
    expect(decodeCursor(conFecha("2026-11-13 10:42:01.5+05:30"))).not.toBeNull();
  });
});
