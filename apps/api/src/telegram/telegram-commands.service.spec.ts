import { beforeAll, describe, expect, it, vi } from "vitest";
import type { TelegramCommandsService as Commands } from "./telegram-commands.service.js";
import type { RedeemResult } from "./telegram-links.service.js";

// Qué contesta el bot (F11, ADR-030), sin Telegram ni base: el servicio de
// vínculos va de mentira. Lo que importa es que a cada caso le toque su texto
// y que un código con mal formato ni siquiera llegue a la base.

const CODIGO = "a".repeat(43);

let crear: (links: Record<string, unknown>) => Commands;
let copy: typeof import("./telegram.copy.js").copy;
let secretMatches: typeof import("./telegram-webhook.controller.js").secretMatches;
let webUrl: string;

beforeAll(async () => {
  try {
    process.loadEnvFile("../../.env");
  } catch {
    // sin .env: se usa el process.env tal cual (CI)
  }
  const { TelegramCommandsService } = await import("./telegram-commands.service.js");
  ({ copy } = await import("./telegram.copy.js"));
  ({ secretMatches } = await import("./telegram-webhook.controller.js"));
  ({ WEB_URL: webUrl } = (await import("../env.js")).env);
  crear = (links) => new TelegramCommandsService(links as never);
});

const yo = { id: 12345, username: "creator_mid" };

describe("TelegramCommandsService", () => {
  it("/start sin código: según si ya está conectado", async () => {
    expect(await crear({ resolveUser: () => Promise.resolve("u1") }).start(yo, "")).toBe(
      copy.alreadyLinked,
    );
    expect(await crear({ resolveUser: () => Promise.resolve(null) }).start(yo, "")).toBe(
      copy.notLinked(webUrl),
    );
  });

  it("/start con un código mal formado no consulta la base", async () => {
    const redeem = vi.fn();
    expect(await crear({ redeem }).start(yo, "hola")).toBe(copy.invalid(webUrl));
    expect(redeem).not.toHaveBeenCalled();
  });

  it("/start con código: un texto por resultado, y canjea con el id y el @usuario", async () => {
    const casos: [RedeemResult, string][] = [
      [{ kind: "linked" }, copy.linked],
      [{ kind: "already_linked" }, copy.alreadyLinked],
      [{ kind: "expired" }, copy.expired(webUrl)],
      [{ kind: "taken" }, copy.taken],
      [{ kind: "invalid" }, copy.invalid(webUrl)],
    ];
    for (const [resultado, texto] of casos) {
      const redeem = vi.fn(() => Promise.resolve(resultado));
      expect(await crear({ redeem }).start(yo, CODIGO)).toBe(texto);
      expect(redeem).toHaveBeenCalledWith(CODIGO, "12345", "creator_mid");
    }
  });

  it("/disconnect dice si había algo que desconectar", async () => {
    expect(await crear({ unlinkByExternalId: () => Promise.resolve(true) }).disconnect(yo)).toBe(
      copy.disconnected,
    );
    expect(await crear({ unlinkByExternalId: () => Promise.resolve(false) }).disconnect(yo)).toBe(
      copy.notLinkedToDisconnect,
    );
  });

  it("un mensaje de quien no está conectado recibe cómo conectarse", async () => {
    expect(await crear({ resolveUser: () => Promise.resolve(null) }).message(yo)).toBe(
      copy.notLinked(webUrl),
    );
  });

  it("todo lo que dice el bot tutea y lleva a Configuración cuando hace falta", () => {
    const textos = [copy.notLinked(webUrl), copy.invalid(webUrl), copy.expired(webUrl)];
    for (const t of textos) expect(t).toContain(`${webUrl}/configuracion/canales`);
    const todo = Object.values(copy)
      .map((v) => (typeof v === "function" ? v(webUrl) : v))
      .join(" ");
    expect(todo).not.toMatch(/\b(vos|querés|podés|tenés|usted)\b/i);
  });
});

describe("secretMatches", () => {
  it("solo el secret exacto pasa", () => {
    const secret = "s".repeat(64);
    expect(secretMatches(secret, secret)).toBe(true);
    expect(secretMatches("s".repeat(63), secret)).toBe(false);
    expect(secretMatches(`${"s".repeat(63)}x`, secret)).toBe(false);
    expect(secretMatches(undefined, secret)).toBe(false);
    // Sin secret configurado, nada pasa (ni un header vacío).
    expect(secretMatches("", undefined)).toBe(false);
    expect(secretMatches("algo", undefined)).toBe(false);
  });
});
