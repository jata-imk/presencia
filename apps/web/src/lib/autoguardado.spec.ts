import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Autoguardado, type EstadoDeCampo } from "./autoguardado.js";

type Parche = Record<string, unknown>;

interface Envio {
  parche: Parche;
  resolver: () => void;
  rechazar: (error: Error) => void;
}

function armar(opciones: { combinar?: (a: Parche, b: Parche) => Parche } = {}) {
  const envios: Envio[] = [];
  let estados: ReadonlyMap<string, EstadoDeCampo> = new Map();
  const motor = new Autoguardado<Parche>({
    enviar: (parche) =>
      new Promise<void>((resolve, reject) => {
        envios.push({ parche, resolver: resolve, rechazar: reject });
      }),
    combinar: opciones.combinar ?? ((a, b) => ({ ...a, ...b })),
    alCambiar: (nuevos) => {
      estados = nuevos;
    },
    mensajeDeError: (error) => (error instanceof Error ? error.message : "falló"),
    retrasoMs: 800,
    guardadoVisibleMs: 2000,
  });
  return { motor, envios, estado: (campo: string) => estados.get(campo) };
}

/** Deja correr las promesas ya resueltas (el `await` del motor). */
async function microtareas() {
  await vi.advanceTimersByTimeAsync(0);
}

describe("Autoguardado", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("espera el debounce y manda una sola vez lo último", async () => {
    const { motor, envios } = armar();
    motor.programar("audience", { audience: "C" });
    await vi.advanceTimersByTimeAsync(500);
    motor.programar("audience", { audience: "Cr" });
    await vi.advanceTimersByTimeAsync(799);
    expect(envios).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(envios.map((e) => e.parche)).toEqual([{ audience: "Cr" }]);
  });

  it("junta campos distintos en un solo envío", async () => {
    const { motor, envios } = armar();
    motor.programar("audience", { audience: "x" });
    motor.programar("formality", { formality: 70 });
    await vi.advanceTimersByTimeAsync(800);
    expect(envios.map((e) => e.parche)).toEqual([{ audience: "x", formality: 70 }]);
  });

  it("inmediato no espera el debounce", async () => {
    const { motor, envios } = armar();
    motor.programar("useAnglicisms", { useAnglicisms: false }, { inmediato: true });
    await microtareas();
    expect(envios).toHaveLength(1);
  });

  it("nunca hay dos envíos en vuelo: lo que llega mientras tanto sale después", async () => {
    const { motor, envios } = armar();
    motor.programar("a", { a: 1 }, { inmediato: true });
    await microtareas();
    motor.programar("b", { b: 2 }, { inmediato: true });
    motor.programar("c", { c: 3 }, { inmediato: true });
    await microtareas();
    expect(envios).toHaveLength(1);

    envios[0]?.resolver();
    await microtareas();
    expect(envios.map((e) => e.parche)).toEqual([{ a: 1 }, { b: 2, c: 3 }]);
  });

  it("con combinar de reemplazo, sale solo el último parche", async () => {
    const { motor, envios } = armar({ combinar: (_a, b) => b });
    motor.programar("prompt", { prompt: "uno", langs: ["es"] });
    motor.programar("langs", { prompt: "uno", langs: ["es", "en"] });
    await vi.advanceTimersByTimeAsync(800);
    expect(envios.map((e) => e.parche)).toEqual([{ prompt: "uno", langs: ["es", "en"] }]);
  });

  it("marca guardando, guardado, y la marca se apaga sola", async () => {
    const { motor, envios, estado } = armar();
    motor.programar("audience", { audience: "x" }, { inmediato: true });
    await microtareas();
    expect(estado("audience")).toEqual({ tipo: "guardando" });

    envios[0]?.resolver();
    await microtareas();
    expect(estado("audience")).toEqual({ tipo: "guardado" });

    await vi.advanceTimersByTimeAsync(2000);
    expect(estado("audience")).toBeUndefined();
  });

  it("un error queda pegado a los campos del envío hasta que vuelven a cambiar", async () => {
    const { motor, envios, estado } = armar();
    motor.programar("niche", { niche: [] }, { inmediato: true });
    await microtareas();
    envios[0]?.rechazar(new Error("Necesitas al menos un nicho."));
    await microtareas();
    expect(estado("niche")).toEqual({ tipo: "error", mensaje: "Necesitas al menos un nicho." });

    await vi.advanceTimersByTimeAsync(5000);
    expect(estado("niche")?.tipo).toBe("error");

    motor.programar("niche", { niche: ["cocina"] });
    expect(estado("niche")).toBeUndefined();
  });

  it("un campo que cambió mientras viajaba no se marca como guardado", async () => {
    const { motor, envios, estado } = armar();
    motor.programar("audience", { audience: "a" }, { inmediato: true });
    await microtareas();
    motor.programar("audience", { audience: "ab" });
    envios[0]?.resolver();
    await microtareas();
    expect(estado("audience")).toBeUndefined();
    expect(motor.tienePendiente("audience")).toBe(true);

    await vi.advanceTimersByTimeAsync(800);
    expect(envios.map((e) => e.parche)).toEqual([{ audience: "a" }, { audience: "ab" }]);
  });

  it("vaciarYa manda lo pendiente sin esperar", async () => {
    const { motor, envios } = armar();
    motor.programar("audience", { audience: "x" });
    void motor.vaciarYa();
    await microtareas();
    expect(envios).toHaveLength(1);
  });
});
