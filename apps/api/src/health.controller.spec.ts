import { ServiceUnavailableException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { probarBase } from "./db/probe.js";
import { HealthController } from "./health.controller.js";

// La sonda real abre una conexión (y env.ts valida el entorno al cargarse).
vi.mock("./db/probe.js", () => ({ probarBase: vi.fn() }));

// F12.8 (ADR-031): lo que vigila UptimeRobot tiene que decir "no" cuando la
// base no responde, no "ok" siempre.
describe("HealthController", () => {
  afterEach(() => vi.restoreAllMocks());

  it("ok cuando la base contesta", async () => {
    vi.mocked(probarBase).mockResolvedValue();
    await expect(new HealthController().check()).resolves.toEqual({ status: "ok" });
  });

  it("503 cuando la base no contesta", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(probarBase).mockRejectedValue(new Error("timeout exceeded when trying to connect"));
    await expect(new HealthController().check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
