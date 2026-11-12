import type { PropuestaDeVozDto, PropuestasDeVozDto } from "@presencia/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

// «Aprender de mis ediciones» (F12.5): las carreras que encontró la revisión
// del PR6. Una lectura vieja no pisa lo que el creator acaba de hacer, y la
// revisión con IA ya pagada sobrevive a apagar y prender.

const apiFetch = vi.fn<(path: string, init?: unknown) => Promise<unknown>>();
vi.mock("../lib/api.js", () => ({
  apiFetch: (path: string, init?: unknown) => apiFetch(path, init),
}));

const { useVozVivaStore, resetVozVivaStore } = await import("./voz-viva-store.js");

const regla: PropuestaDeVozDto = {
  id: "emojis",
  origen: "regla",
  mensaje: "Quitaste emojis.",
  rasgo: "Casi sin emojis",
  evidencia: [],
};
const ia: PropuestaDeVozDto = { ...regla, id: "ia-1", origen: "ia", rasgo: "Dice «padre»" };
const prendido = (propuestas: PropuestaDeVozDto[] = [regla]): PropuestasDeVozDto => ({
  aprender: true,
  edicionesParaRevisar: 5,
  propuestas,
});
const apagado: PropuestasDeVozDto = { aprender: false, edicionesParaRevisar: 0, propuestas: [] };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const ids = () => useVozVivaStore.getState().datos?.propuestas.map((p) => p.id);

beforeEach(() => {
  apiFetch.mockReset();
  resetVozVivaStore();
});

describe("voz-viva-store", () => {
  it("una lectura que salió antes de apagar no lo vuelve a prender", async () => {
    const vieja = deferred<PropuestasDeVozDto>();
    apiFetch.mockReturnValueOnce(vieja.promise);
    const lectura = useVozVivaStore.getState().cargar();

    useVozVivaStore.getState().poner(apagado);
    vieja.resolve(prendido());
    await lectura;

    expect(useVozVivaStore.getState().datos?.aprender).toBe(false);
    expect(ids()).toEqual([]);
  });

  it("la revisión pagada sobrevive a apagar y prender, y a una lectura nueva", async () => {
    apiFetch.mockResolvedValueOnce(prendido());
    await useVozVivaStore.getState().cargar();
    useVozVivaStore.getState().ponerRevision([ia]);
    expect(ids()).toEqual(["emojis", "ia-1"]);

    useVozVivaStore.getState().poner(apagado);
    expect(ids()).toEqual([]);
    useVozVivaStore.getState().poner(prendido());
    expect(ids()).toEqual(["emojis", "ia-1"]);

    apiFetch.mockResolvedValueOnce(prendido());
    await useVozVivaStore.getState().cargar();
    expect(ids()).toEqual(["emojis", "ia-1"]);
  });

  it("una propuesta de la IA decidida no vuelve", () => {
    useVozVivaStore.getState().poner(prendido());
    useVozVivaStore.getState().ponerRevision([ia]);
    useVozVivaStore.getState().quitar("ia-1");
    useVozVivaStore.getState().poner(prendido());
    expect(ids()).toEqual(["emojis"]);
  });

  it("una revisión que llega con el interruptor apagado no se muestra", () => {
    useVozVivaStore.getState().poner(apagado);
    useVozVivaStore.getState().ponerRevision([ia]);
    expect(ids()).toEqual([]);
  });
});
