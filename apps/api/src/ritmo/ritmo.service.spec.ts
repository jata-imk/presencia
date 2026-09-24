import { beforeAll, describe, expect, it, vi } from "vitest";
import { metaSugerida } from "@presencia/shared";
import type { ModoEstrategia, RitmoCadenciaDto, SocialNetwork } from "@presencia/shared";
// Import solo de tipo: el módulo real se carga en beforeAll, mismo patrón que
// brand-voice.service.spec.ts — importarlo arriba arrastra db.service.js, que
// arrastra env.ts, que valida el entorno al cargarse.
import type { Tx } from "../db/db.service.js";
import type { RitmoService as RitmoServiceType } from "./ritmo.service.js";

let RitmoService: new (...args: never[]) => RitmoServiceType;

beforeAll(async () => {
  try {
    process.loadEnvFile("../../.env");
  } catch {
    // sin .env: se usa el process.env tal cual (CI)
  }
  ({ RitmoService } = (await import("./ritmo.service.js")) as unknown as {
    RitmoService: new (...args: never[]) => RitmoServiceType;
  });
});

// Sin Postgres: lo que se prueba acá es el "vas 8/14" de la cabecera, que es
// aritmética sobre la rejilla que el motor ya devolvió. Su parte frágil es la
// frontera de la semana, porque depende de la zona horaria del usuario y no de
// la del servidor.

// Domingo 20 de septiembre de 2026, 13:00 en Mérida.
const AHORA = new Date("2026-09-20T19:00:00.000Z");
const MERIDA = "America/Mexico_City";

function dia(fecha: string, porRed: Partial<Record<SocialNetwork, number>>) {
  return {
    dia: fecha,
    total: Object.values(porRed).reduce((s, n) => s + n, 0),
    porRed,
  };
}

function armar(opciones: {
  dias: RitmoCadenciaDto["dias"];
  metas?: Map<SocialNetwork, number>;
  redes?: SocialNetwork[];
  timezone?: string;
  /** El Modo elegido a mano. `undefined` = no eligió, se deriva de `goals`. */
  modo?: ModoEstrategia;
  /** Lo que contestó en el paso de metas del onboarding. */
  goals?: string[];
}): RitmoServiceType {
  const cadencia: RitmoCadenciaDto = {
    dias: opciones.dias,
    total: opciones.dias.reduce((s, d) => s + d.total, 0),
    rachaActual: 0,
    mejorRacha: 0,
  };
  const dbService = {
    runWithTenant: <T>(_userId: string, fn: (tx: Tx) => Promise<T>) => fn({} as Tx),
  };
  const motor = { cadencia: vi.fn().mockResolvedValue(cadencia) };
  const repo = {
    metas: vi.fn().mockResolvedValue(opciones.metas ?? new Map()),
    redesConectadas: vi.fn().mockResolvedValue(opciones.redes ?? ["facebook"]),
  };
  const profileRepo = {
    findById: vi.fn().mockResolvedValue({ timezone: opciones.timezone ?? MERIDA }),
  };
  // La voz de marca entra al resumen porque el Modo mueve la meta sugerida.
  const voiceRepo = {
    findDefault: vi.fn().mockResolvedValue({
      modo: opciones.modo ?? null,
      extras: { goals: opciones.goals ?? [] },
    }),
  };
  return new RitmoService(
    dbService as never,
    motor as never,
    repo as never,
    voiceRepo as never,
    profileRepo as never,
    {} as never,
  );
}

describe("RitmoService.resumen", () => {
  it("cuenta solo lo publicado desde el lunes de esta semana", async () => {
    // AHORA es domingo: la semana va del lunes 14 al domingo 20. Lo del
    // domingo 13 pertenece a la semana anterior y no puede sumar.
    const service = armar({
      dias: [
        dia("2026-09-13", { facebook: 5 }),
        dia("2026-09-14", { facebook: 2 }),
        dia("2026-09-20", { facebook: 1 }),
      ],
    });
    vi.setSystemTime(AHORA);
    const resumen = await service.resumen("u1");
    vi.useRealTimers();

    expect(resumen.objetivos[0]).toMatchObject({ network: "facebook", hechas: 3 });
  });

  it("la frontera de la semana es la del usuario, no la de UTC", async () => {
    // El domingo 19:00 en Mérida es lunes 01:00 en UTC. Con la frontera mal
    // puesta, ese post arrancaría una semana nueva y el contador se caería a
    // cero justo cuando el usuario acaba de publicar.
    const service = armar({ dias: [dia("2026-09-20", { facebook: 4 })] });
    vi.setSystemTime(new Date("2026-09-21T01:00:00.000Z"));
    const resumen = await service.resumen("u1");
    vi.useRealTimers();

    expect(resumen.objetivos[0]?.hechas).toBe(4);
  });

  it("el Modo mueve la meta sugerida: por eso no es un adorno", async () => {
    // Si el chip solo se mostrara, sería decoración aparentando importar. Lo
    // que lo vuelve real es esto: el usuario dijo que quiere crecer y la
    // sugerencia sube en consecuencia, sin dejar de estar marcada como nuestra.
    const service = armar({ dias: [], redes: ["facebook"], modo: "crecer" });
    vi.setSystemTime(AHORA);
    const resumen = await service.resumen("u1");
    vi.useRealTimers();

    expect(resumen.modo).toBe("crecer");
    expect(resumen.modoSugerido).toBe(false);
    expect(resumen.objetivos[0]?.meta).toBe(metaSugerida("facebook", "crecer"));
    expect(resumen.objetivos[0]?.meta).toBeGreaterThan(metaSugerida("facebook", "mantener"));
    expect(resumen.objetivos[0]?.sugerido).toBe(true);
  });

  it("sin Modo elegido lo deriva de lo que contestó en el onboarding", async () => {
    // `extras.goals` era dato muerto: se escribía una vez y no lo leía nadie.
    // De ahí sale el default, y `modoSugerido` es lo que deja a la pantalla
    // decir que lo dedujimos en vez de presentarlo como decisión suya.
    const service = armar({ dias: [], redes: ["facebook"], goals: ["Más seguidores"] });
    vi.setSystemTime(AHORA);
    const resumen = await service.resumen("u1");
    vi.useRealTimers();

    expect(resumen.modo).toBe("crecer");
    expect(resumen.modoSugerido).toBe(true);
  });

  it("marca la meta como sugerida mientras el usuario no ponga la suya", async () => {
    // No es cosmético: un número que el producto propuso y uno que la persona
    // aceptó no son la misma promesa, y confundirlos hace que se sienta
    // evaluada contra algo que nunca eligió.
    const service = armar({
      dias: [],
      redes: ["facebook", "linkedin"],
      metas: new Map<SocialNetwork, number>([["linkedin", 4]]),
    });
    vi.setSystemTime(AHORA);
    const resumen = await service.resumen("u1");
    vi.useRealTimers();

    expect(resumen.objetivos).toEqual([
      { network: "facebook", meta: 3, hechas: 0, sugerido: true },
      { network: "linkedin", meta: 4, hechas: 0, sugerido: false },
    ]);
  });

  it("no propone metas para redes que el usuario no conectó", async () => {
    // Una meta en una red sin cuenta es una vara de medir que nunca aceptó y
    // que además no puede cumplir desde acá.
    const service = armar({ dias: [], redes: [] });
    vi.setSystemTime(AHORA);
    const resumen = await service.resumen("u1");
    vi.useRealTimers();

    expect(resumen.objetivos).toEqual([]);
  });
});
