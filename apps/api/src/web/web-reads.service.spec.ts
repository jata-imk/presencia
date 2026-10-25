import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { chats, users } from "../db/schema.js";
import type { DbService as DbServiceType } from "../db/db.service.js";
import type { PageRead } from "./read-page.js";
import { normalizeReadUrl } from "./read-url.js";
import type { WebReadsService as WebReadsServiceType } from "./web-reads.service.js";

// F10.10: leer un enlace desde el chat contra Postgres real, con la red de
// mentira (readPage). Lo que se prueba es el caché y lo que se guarda: la
// red y la guardia SSRF tienen sus propios specs.

const readPage = vi.fn<(url: string) => Promise<PageRead>>();
vi.mock("./read-page.js", () => ({ readPage: (url: string) => readPage(url) }));

const NOTA = "La marquesita cumple 80 años en Mérida. ".repeat(10);
const ok = (url: string): PageRead => ({
  status: "ok",
  url,
  finalUrl: url,
  title: "La marquesita cumple 80 años",
  siteName: "Diario de Yucatán",
  text: NOTA,
  truncated: false,
  onlyDescription: false,
});

let dbService: DbServiceType;
let service: WebReadsServiceType;
let userA: string;
let userB: string;
let chatA: string;
let chatA2: string;
let chatB: string;

describe("normalizeReadUrl", () => {
  it.each([
    ["yucatan.com.mx/nota", "https://yucatan.com.mx/nota"],
    ["https://x.mx/nota#comentarios", "https://x.mx/nota"],
    ["https://x.mx/nota.", "https://x.mx/nota"],
    [
      "https://es.wikipedia.org/wiki/Marquesita_(postre)",
      "https://es.wikipedia.org/wiki/Marquesita_(postre)",
    ],
    ["  https://x.mx/a?b=1  ", "https://x.mx/a?b=1"],
  ])("%s → %s", (raw, url) => {
    expect(normalizeReadUrl(raw)).toBe(url);
  });

  it("basura no es una URL", () => {
    expect(normalizeReadUrl("http://")).toBeNull();
  });
});

describe("WebReadsService", { timeout: 30_000 }, () => {
  beforeAll(async () => {
    try {
      process.loadEnvFile("../../.env");
    } catch {
      // sin .env: se usa el process.env tal cual (CI)
    }
    const { DbService } = await import("../db/db.service.js");
    const { WebReadsRepository } = await import("./web-reads.repository.js");
    const { WebReadsService } = await import("./web-reads.service.js");
    dbService = new DbService();
    service = new WebReadsService(dbService, new WebReadsRepository());

    const [a, b] = await dbService.db
      .insert(users)
      .values([
        { name: "Web A", email: `web-a-${randomUUID()}@test.local` },
        { name: "Web B", email: `web-b-${randomUUID()}@test.local` },
      ])
      .returning({ id: users.id });
    userA = a!.id;
    userB = b!.id;
    const chatOf = (userId: string) =>
      dbService.runWithTenant(userId, async (tx) => {
        const [chat] = await tx.insert(chats).values({ userId }).returning({ id: chats.id });
        return chat!.id;
      });
    chatA = await chatOf(userA);
    chatA2 = await chatOf(userA);
    chatB = await chatOf(userB);
  });

  afterAll(async () => {
    await dbService.db.delete(users).where(inArray(users.id, [userA, userB]));
    await dbService.onModuleDestroy();
  });

  beforeEach(() => {
    readPage.mockReset();
    readPage.mockImplementation((url) => Promise.resolve(ok(url)));
  });

  it("lee, guarda el texto y devuelve solo la referencia", async () => {
    const url = `https://www.yucatan.com.mx/nota-${randomUUID()}`;
    const { output, row } = await service.read(userA, chatA, url);
    expect(output).toMatchObject({
      url,
      urlFinal: url,
      titulo: "La marquesita cumple 80 años",
      dominio: "yucatan.com.mx",
      estado: "ok",
      truncado: false,
    });
    expect(output).not.toHaveProperty("texto");
    expect(row?.extractedText).toBe(NOTA);
    expect(row?.tokenEstimate).toBeGreaterThan(0);
  });

  it("la misma URL en el mismo chat sale de la base, sin pedirla otra vez", async () => {
    const url = `https://www.yucatan.com.mx/otra-${randomUUID()}`;
    const first = await service.read(userA, chatA, url);
    const again = await service.read(userA, chatA, `${url}#comentarios`);
    expect(readPage).toHaveBeenCalledTimes(1);
    expect(again.output.readId).toBe(first.output.readId);
  });

  it("desde otro chat del mismo creator, se copia a ese chat", async () => {
    const url = `https://www.yucatan.com.mx/copia-${randomUUID()}`;
    const first = await service.read(userA, chatA, url);
    const other = await service.read(userA, chatA2, url);
    expect(readPage).toHaveBeenCalledTimes(1);
    expect(other.output.readId).not.toBe(first.output.readId);
    expect(other.row?.chatId).toBe(chatA2);
    expect(other.row?.extractedText).toBe(NOTA);
  });

  it("el caché de un creator no le sirve a otro", async () => {
    const url = `https://www.yucatan.com.mx/ajena-${randomUUID()}`;
    await service.read(userA, chatA, url);
    await service.read(userB, chatB, url);
    expect(readPage).toHaveBeenCalledTimes(2);
  });

  it("una lectura fallida se guarda con su estado y no sirve de caché", async () => {
    const url = `https://www.instagram.com/p/${randomUUID()}`;
    readPage.mockResolvedValue({
      status: "requiere_sesion",
      url,
      finalUrl: null,
      detail: "red que pide sesión",
    });
    const first = await service.read(userA, chatA, url);
    expect(first.output).toMatchObject({ estado: "requiere_sesion", dominio: "instagram.com" });
    expect(first.row?.extractedText).toBeNull();
    await service.read(userA, chatA, url);
    expect(readPage).toHaveBeenCalledTimes(2);
  });

  it("una dirección que no se puede armar no llega a la red", async () => {
    const { output, row } = await service.read(userA, chatA, "http://");
    expect(output.estado).toBe("no_encontrada");
    expect(row).toBeNull();
    expect(readPage).not.toHaveBeenCalled();
  });

  it("findById de una lectura ajena es null (RLS)", async () => {
    const { output } = await service.read(userA, chatA, `https://x.mx/${randomUUID()}`);
    expect(await service.findById(userB, output.readId!)).toBeNull();
    expect(await service.findById(userA, output.readId!)).not.toBeNull();
  });
});
