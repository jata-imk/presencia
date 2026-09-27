import { describe, expect, it, vi } from "vitest";

// Módulo con estado: cada caso lo importa de nuevo para no heredar la ruta
// que recordó el anterior.
async function modulo() {
  vi.resetModules();
  return import("./ultima-ruta.js");
}

describe("ultimaRutaDeLaApp", () => {
  it("sin nada recordado vuelve a Chats", async () => {
    const { ultimaRutaDeLaApp } = await modulo();
    expect(ultimaRutaDeLaApp()).toBe("/chats");
  });

  it("recuerda la última ruta de la app, con su query", async () => {
    const { recordarRutaDeLaApp, ultimaRutaDeLaApp } = await modulo();
    recordarRutaDeLaApp("/ritmo");
    recordarRutaDeLaApp("/calendario", "?mes=2026-09");
    expect(ultimaRutaDeLaApp()).toBe("/calendario?mes=2026-09");
  });

  it("navegar dentro de Configuración no la pisa", async () => {
    const { recordarRutaDeLaApp, ultimaRutaDeLaApp } = await modulo();
    recordarRutaDeLaApp("/ritmo");
    recordarRutaDeLaApp("/configuracion");
    recordarRutaDeLaApp("/configuracion/voz-de-marca");
    recordarRutaDeLaApp("/configuracion/canales/desconectadas");
    expect(ultimaRutaDeLaApp()).toBe("/ritmo");
  });

  it("una ruta que solo empieza parecido no cuenta como Configuración", async () => {
    const { recordarRutaDeLaApp, ultimaRutaDeLaApp } = await modulo();
    recordarRutaDeLaApp("/configuraciones-viejas");
    expect(ultimaRutaDeLaApp()).toBe("/configuraciones-viejas");
  });
});
