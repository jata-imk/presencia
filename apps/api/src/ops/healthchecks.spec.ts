import { afterEach, describe, expect, it, vi } from "vitest";
import { pingHealthcheck } from "./healthchecks.js";

// F12.8 (ADR-031): el ping al vigilante de afuera. Nunca lanza: un
// Healthchecks caído no puede tumbar el backup ni el pase de ops.watch.
describe("pingHealthcheck", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sin URL no hace nada", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await pingHealthcheck(undefined);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("el fallo va a /fail del mismo check", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("OK"));
    vi.stubGlobal("fetch", fetch);
    await pingHealthcheck("https://hc-ping.com/abc/", true);
    await pingHealthcheck("https://hc-ping.com/key/presencia-backup?create=1", true);
    await pingHealthcheck("https://hc-ping.com/abc");
    expect(fetch.mock.calls.map((c) => c[0] as string)).toEqual([
      "https://hc-ping.com/abc/fail",
      "https://hc-ping.com/key/presencia-backup/fail?create=1",
      "https://hc-ping.com/abc",
    ]);
  });

  it("una red caída no lanza", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ENOTFOUND")));
    await expect(pingHealthcheck("https://hc-ping.com/abc")).resolves.toBeUndefined();
  });
});
