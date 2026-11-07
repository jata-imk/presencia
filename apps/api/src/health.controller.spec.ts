import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { HealthController } from "./health.controller.js";

// db.service importa el cliente real, que valida el entorno al cargarse
// (vi.mock se iza por encima de los imports).
vi.mock("./db/db.service.js", () => ({ DbService: class {} }));

function controller(execute: () => Promise<unknown>) {
  return new HealthController({ db: { execute } } as never);
}

// F12.8 (ADR-031): lo que vigila UptimeRobot tiene que decir "no" cuando la
// base no responde, no "ok" siempre.
describe("HealthController", () => {
  it("ok cuando la base contesta", async () => {
    await expect(controller(() => Promise.resolve({ rows: [] })).check()).resolves.toEqual({
      status: "ok",
    });
  });

  it("503 cuando la base truena", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      controller(() => Promise.reject(new Error("ECONNREFUSED"))).check(),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("503 cuando la base no contesta a tiempo", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const pendiente = controller(() => new Promise(() => undefined)).check();
    const resultado = expect(pendiente).rejects.toBeInstanceOf(ServiceUnavailableException);
    await vi.advanceTimersByTimeAsync(3_000);
    await resultado;
    vi.useRealTimers();
  });
});
