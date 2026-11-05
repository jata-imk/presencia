import type { TelegramLinkDto, TelegramLinkStatusDto } from "@presencia/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

// La carrera de la revisión del PR7a: una consulta que salió antes de
// desconectar (o de generar otro enlace) llega después con el estado viejo, y
// no debe pisar el nuevo.

const apiFetch = vi.fn<(path: string, init?: unknown) => Promise<unknown>>();
vi.mock("../lib/api.js", () => ({
  apiFetch: (path: string, init?: unknown) => apiFetch(path, init),
}));

const { useTelegramLinkStore, resetTelegramLinkStore } = await import("./telegram-link-store.js");

const status = (over: Partial<TelegramLinkStatusDto>): TelegramLinkStatusDto => ({
  state: "connected",
  username: "jose",
  linkedAt: "2026-10-28T12:00:00.000Z",
  expiresAt: null,
  botUsername: "presencia_bot",
  ...over,
});

/** Una respuesta que llega cuando el test quiere. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  apiFetch.mockReset();
  resetTelegramLinkStore();
});

describe("telegram-link-store", () => {
  it("una consulta vieja no deshace el desconectar", async () => {
    const vieja = deferred<TelegramLinkStatusDto>();
    apiFetch.mockReturnValueOnce(vieja.promise); // GET al montar, sigue en camino
    void useTelegramLinkStore.getState().refresh();

    apiFetch.mockResolvedValueOnce(undefined); // DELETE
    apiFetch.mockResolvedValueOnce(status({ state: "disconnected", username: null })); // GET nuevo
    await useTelegramLinkStore.getState().unlink();

    vieja.resolve(status({}));
    await vieja.promise;
    await Promise.resolve();
    expect(useTelegramLinkStore.getState().status?.state).toBe("disconnected");
  });

  it("una consulta vieja no le quita el enlace nuevo a la tarjeta", async () => {
    const antes = "2026-11-04T12:05:00.000Z";
    useTelegramLinkStore.setState({ status: status({ state: "waiting", expiresAt: antes }) });
    const vieja = deferred<TelegramLinkStatusDto>();
    apiFetch.mockReturnValueOnce(vieja.promise); // el polling
    void useTelegramLinkStore.getState().refresh();

    const link: TelegramLinkDto = {
      url: "https://t.me/presencia_bot?start=nuevo",
      expiresAt: "2026-11-04T12:15:00.000Z",
    };
    apiFetch.mockResolvedValueOnce(link); // POST
    await useTelegramLinkStore.getState().createLink();

    vieja.resolve(status({ state: "waiting", expiresAt: antes }));
    await vieja.promise;
    await Promise.resolve();
    const { status: after, link: kept } = useTelegramLinkStore.getState();
    expect(after?.expiresAt).toBe(link.expiresAt);
    expect(kept).toEqual(link);
  });
});
