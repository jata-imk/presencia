import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { users } from "../db/schema.js";
import type { DbService as DbServiceType } from "../db/db.service.js";
import type { TelegramLinksService as TelegramLinksServiceType } from "./telegram-links.service.js";
import { hashLinkToken, looksLikeLinkToken } from "./link-token.js";

// Vincular Telegram con Presencia (F11, ADR-030), contra Postgres real y como
// presencia_app (RLS + la policy worker_scan de 0059): que el código sirva una
// sola vez y por 15 minutos, que un Telegram quede en una sola cuenta, que
// desconectar lo suelte, y que dos /start con el mismo código no lo canjeen dos
// veces.

let dbService: DbServiceType;
let links: TelegramLinksServiceType;
const usuarios: string[] = [];

async function nuevoUsuario(): Promise<string> {
  const [user] = await dbService.db
    .insert(users)
    .values({ name: "Telegram", email: `tg-${randomUUID()}@test.local`, emailVerified: true })
    .returning({ id: users.id });
  if (!user) throw new Error("No se pudo crear el usuario de prueba");
  usuarios.push(user.id);
  return user.id;
}

const codigoDe = (url: string) => new URL(url).searchParams.get("start")!;
/** Un id de Telegram que no choca con otras corridas. */
const tgId = () => String(Math.floor(Math.random() * 1e12));

// Cada caso hace varias transacciones seguidas por el túnel: bajo la suite
// completa, 5 s no alcanzan (mismo margen que chat-title.service.spec).
describe("TelegramLinksService", { timeout: 30_000 }, () => {
  beforeAll(async () => {
    try {
      process.loadEnvFile("../../.env");
    } catch {
      // sin .env: se usa el process.env tal cual (CI)
    }
    const { DbService } = await import("../db/db.service.js");
    const { TelegramLinksRepository } = await import("./telegram-links.repository.js");
    const { TelegramLinksService } = await import("./telegram-links.service.js");
    dbService = new DbService();
    links = new TelegramLinksService(dbService, new TelegramLinksRepository());
  }, 30_000);

  afterAll(async () => {
    if (usuarios.length > 0) await dbService.db.delete(users).where(inArray(users.id, usuarios));
    await dbService.onModuleDestroy();
  }, 30_000);

  let userId: string;
  beforeEach(async () => {
    userId = await nuevoUsuario();
  });

  it("el enlace lleva un código de un solo uso que no se guarda en claro", async () => {
    const link = await links.createLink(userId, "presencia_dev_bot");
    expect(link.url).toMatch(/^https:\/\/t\.me\/presencia_dev_bot\?start=[A-Za-z0-9_-]{43}$/);
    const codigo = codigoDe(link.url);
    expect(looksLikeLinkToken(codigo)).toBe(true);
    expect(hashLinkToken(codigo)).toHaveLength(64);
    expect(await links.status(userId, null)).toMatchObject({
      state: "waiting",
      expiresAt: link.expiresAt,
    });
  });

  it("canjear el código conecta la cuenta, y el segundo canje ya no sirve", async () => {
    const telegram = tgId();
    const codigo = codigoDe((await links.createLink(userId, "bot")).url);

    expect(await links.redeem(codigo, telegram, "creator_mid")).toEqual({ kind: "linked" });
    expect(await links.status(userId, null)).toMatchObject({
      state: "connected",
      username: "creator_mid",
    });
    expect(await links.resolveUser(telegram)).toBe(userId);

    // El mismo código otra vez: para quien ya está conectado no es un error.
    expect(await links.redeem(codigo, telegram, null)).toEqual({ kind: "already_linked" });
    // Y desde otro Telegram, el código ya no existe.
    expect(await links.redeem(codigo, tgId(), null)).toEqual({ kind: "invalid" });
  });

  it("un código vencido no conecta", async () => {
    const hace20min = new Date(Date.now() - 20 * 60_000);
    const codigo = codigoDe((await links.createLink(userId, "bot", hace20min)).url);
    expect(await links.redeem(codigo, tgId(), null)).toEqual({ kind: "expired" });
    expect(await links.status(userId, null)).toMatchObject({ state: "expired" });
  });

  it("un enlace nuevo invalida el anterior", async () => {
    const viejo = codigoDe((await links.createLink(userId, "bot")).url);
    const nuevo = codigoDe((await links.createLink(userId, "bot")).url);
    expect(await links.redeem(viejo, tgId(), null)).toEqual({ kind: "invalid" });
    expect((await links.redeem(nuevo, tgId(), null)).kind).toBe("linked");
  });

  it("un Telegram conectado a otra cuenta no se puede conectar aquí", async () => {
    const telegram = tgId();
    const otra = await nuevoUsuario();
    await links.redeem(codigoDe((await links.createLink(otra, "bot")).url), telegram, null);

    const link = await links.createLink(userId, "bot");
    const codigo = codigoDe(link.url);
    expect(await links.redeem(codigo, telegram, null)).toEqual({ kind: "taken" });
    // La web deja de decir "Esperando" (PR7a).
    expect(await links.status(userId, "bot")).toEqual({
      state: "taken",
      username: null,
      linkedAt: null,
      expiresAt: link.expiresAt,
      botUsername: "bot",
    });
    // El código no se gastó: tras desconectar en la otra cuenta, sí conecta.
    expect(await links.unlinkByExternalId(telegram)).toBe(true);
    expect(await links.redeem(codigo, telegram, null)).toEqual({ kind: "linked" });
    expect(await links.status(userId, null)).toMatchObject({ state: "connected" });
  });

  it("'ya en otra cuenta' se limpia al generar otro enlace o al cancelar", async () => {
    const telegram = tgId();
    const otra = await nuevoUsuario();
    await links.redeem(codigoDe((await links.createLink(otra, "bot")).url), telegram, null);

    await links.redeem(codigoDe((await links.createLink(userId, "bot")).url), telegram, null);
    expect(await links.status(userId, null)).toMatchObject({ state: "taken" });
    await links.createLink(userId, "bot");
    expect(await links.status(userId, null)).toMatchObject({ state: "waiting" });

    await links.redeem(codigoDe((await links.createLink(userId, "bot")).url), telegram, null);
    expect(await links.unlink(userId)).toBeNull();
    expect(await links.status(userId, null)).toMatchObject({ state: "disconnected" });
  });

  it("'ya en otra cuenta' se vuelve 'vencido' cuando el enlace vence", async () => {
    const telegram = tgId();
    const otra = await nuevoUsuario();
    await links.redeem(codigoDe((await links.createLink(otra, "bot")).url), telegram, null);
    const codigo = codigoDe((await links.createLink(userId, "bot")).url);
    await links.redeem(codigo, telegram, null);
    const en20min = new Date(Date.now() + 20 * 60_000);
    expect(await links.status(userId, null, en20min)).toMatchObject({ state: "expired" });
  });

  it("con un Telegram ya conectado no se genera otro enlace", async () => {
    await links.redeem(codigoDe((await links.createLink(userId, "bot")).url), tgId(), null);
    await expect(links.createLink(userId, "bot")).rejects.toMatchObject({ status: 409 });
  });

  it("desconectar suelta el Telegram, y se puede volver a conectar", async () => {
    const telegram = tgId();
    await links.redeem(codigoDe((await links.createLink(userId, "bot")).url), telegram, null);

    expect(await links.unlink(userId)).toBe(telegram);
    expect(await links.resolveUser(telegram)).toBeNull();
    expect(await links.status(userId, null)).toMatchObject({ state: "disconnected" });
    // Desconectar de nuevo no avisa a nadie: ya no había vínculo activo.
    expect(await links.unlink(userId)).toBeNull();

    const codigo = codigoDe((await links.createLink(userId, "bot")).url);
    expect(await links.redeem(codigo, telegram, null)).toEqual({ kind: "linked" });
  });

  it("dos /start con el mismo código a la vez lo canjean una sola vez", async () => {
    const codigo = codigoDe((await links.createLink(userId, "bot")).url);
    const [a, b] = await Promise.all([
      links.redeem(codigo, tgId(), null),
      links.redeem(codigo, tgId(), null),
    ]);
    expect([a.kind, b.kind].sort()).toEqual(["invalid", "linked"]);
  });

  it("un Telegram ya conectado que abre el código de otra cuenta no oye 'ya conectado'", async () => {
    const telegram = tgId();
    await links.redeem(codigoDe((await links.createLink(userId, "bot")).url), telegram, null);
    // Un código de otra cuenta que ya no está pendiente (reemplazado).
    const otra = await nuevoUsuario();
    const reemplazado = codigoDe((await links.createLink(otra, "bot")).url);
    await links.createLink(otra, "bot");
    expect(await links.redeem(reemplazado, telegram, null)).toEqual({ kind: "invalid" });
    // Y uno inventado, tampoco.
    expect(await links.redeem("b".repeat(43), telegram, null)).toEqual({ kind: "invalid" });
  });

  it("el vencimiento lo decide también Postgres, no solo el reloj de la app", async () => {
    const hace20min = new Date(Date.now() - 20 * 60_000);
    const codigo = codigoDe((await links.createLink(userId, "bot", hace20min)).url);
    // La app cree que es hace 20 min (el código "sigue vigente"); el UPDATE no.
    expect(await links.redeem(codigo, tgId(), null, hace20min)).toEqual({ kind: "invalid" });
    expect(await links.status(userId, null)).toMatchObject({ state: "expired" });
  });

  it("de un Telegram que nadie conectó no se sabe de quién es", async () => {
    expect(await links.resolveUser(tgId())).toBeNull();
    expect(await links.unlinkByExternalId(tgId())).toBe(false);
  });
});
