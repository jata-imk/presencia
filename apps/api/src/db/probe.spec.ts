import { describe, expect, it, vi } from "vitest";
import { probarBase } from "./probe.js";

// F12.8 (ADR-031): /api/health es público. Pedirlo en bucle no puede abrir
// una conexión a Postgres por request. (vi.mock se iza sobre los imports.)

const conexiones = vi.hoisted(() => ({ n: 0 }));

vi.mock("../env.js", () => ({ env: { APP_DATABASE_URL: "postgres://test/test" } }));
vi.mock("pg", () => ({
  default: {
    Client: class {
      connect() {
        conexiones.n += 1;
        return Promise.resolve();
      }
      query() {
        return Promise.resolve({ rows: [] });
      }
      end() {
        return Promise.resolve();
      }
    },
  },
}));

describe("probarBase", () => {
  it("muchos requests seguidos comparten una sola sonda", async () => {
    await Promise.all([probarBase(), probarBase(), probarBase()]);
    await probarBase();
    expect(conexiones.n).toBe(1);
  });
});
