import { describe, expect, it } from "vitest";
import { decidir, duracion, planear, RECORDATORIO_MS } from "./alert-state.js";
import {
  chequeoDeCards,
  chequeoDeJobs,
  chequeoDeRespaldo,
  chequeoDeSaldo,
  esSinSaldo,
} from "./chequeos.js";
import { componerMensaje, recortar } from "./mensaje.js";

// F12.8 (ADR-031): la parte pura de las alertas de operación. Lo que importa
// probar es el anti-spam (DoD: "uno solo, no una ráfaga").

const AHORA = new Date("2026-11-06T12:00:00Z");
const hace = (ms: number) => new Date(AHORA.getTime() - ms);
const MIN = 60_000;

function previa(over: Partial<{ firing: boolean; since: Date; lastSentAt: Date | null }> = {}) {
  return {
    firing: true,
    since: hace(10 * MIN),
    lastSentAt: hace(10 * MIN),
    title: "Falla el job backups.daily",
    detail: "boom",
    ...over,
  };
}

describe("decidir", () => {
  it("avisa al prenderse y calla mientras sigue igual", () => {
    expect(decidir(undefined, true, AHORA)).toBe("nueva");
    expect(decidir(previa({ firing: false }), true, AHORA)).toBe("nueva");
    expect(decidir(previa(), true, AHORA)).toBe("callar");
  });

  it("recuerda una vez al día mientras siga prendida", () => {
    expect(decidir(previa({ lastSentAt: hace(RECORDATORIO_MS - MIN) }), true, AHORA)).toBe(
      "callar",
    );
    expect(decidir(previa({ lastSentAt: hace(RECORDATORIO_MS) }), true, AHORA)).toBe(
      "recordatorio",
    );
  });

  it("un aviso que no salió se reintenta como nuevo", () => {
    expect(decidir(previa({ lastSentAt: null }), true, AHORA)).toBe("nueva");
  });

  it("avisa al apagarse solo si se había avisado al prenderse", () => {
    expect(decidir(previa(), false, AHORA)).toBe("resuelta");
    expect(decidir(previa({ lastSentAt: null }), false, AHORA)).toBe("callar");
    expect(decidir(previa({ firing: false }), false, AHORA)).toBe("callar");
    expect(decidir(undefined, false, AHORA)).toBe("callar");
  });
});

describe("planear", () => {
  const obs = { key: "job:backups.daily", title: "Falla el job backups.daily", detail: "boom" };

  it("una alerta prendida que el chequeo ya no ve se resuelve", () => {
    const pasos = planear(
      [{ prefix: "job:", firing: [] }],
      new Map([["job:backups.daily", previa()]]),
      AHORA,
    );
    expect(pasos.map((p) => [p.key, p.accion, p.aviso?.decision])).toEqual([
      ["job:backups.daily", "apagar", "resuelta"],
    ]);
  });

  it("no toca llaves de otro prefijo", () => {
    const pasos = planear(
      [{ prefix: "probe:", firing: [] }],
      new Map([["job:backups.daily", previa()]]),
      AHORA,
    );
    expect(pasos).toEqual([]);
  });

  it("una alerta que el chequeo ya no alcanza a ver se queda como está", () => {
    // La cola falló hace más de 7 días y pg-boss ya borró sus filas: no
    // verla no es verla sana.
    const pasos = planear(
      [{ prefix: "job:", firing: [], evaluadas: ["job:cards.reconcile"] }],
      new Map([["job:backups.daily", previa()]]),
      AHORA,
    );
    expect(pasos).toEqual([]);
  });

  it("un prefijo sin ':' es una llave exacta", () => {
    const pasos = planear(
      [{ prefix: "chequeo:jobs", firing: [] }],
      new Map([["chequeo:jobs-lentos", previa()]]),
      AHORA,
    );
    expect(pasos).toEqual([]);
  });

  it("un fallo repetido no vuelve a avisar, pero refresca el detalle", () => {
    const pasos = planear(
      [{ prefix: "job:", firing: [{ ...obs, detail: "boom otra vez" }] }],
      new Map([["job:backups.daily", previa()]]),
      AHORA,
    );
    expect(pasos).toEqual([
      { key: "job:backups.daily", accion: "seguir", title: obs.title, detail: "boom otra vez" },
    ]);
  });

  it("recorta el detalle a un largo que cabe en Telegram", () => {
    const [paso] = planear(
      [{ prefix: "job:", firing: [{ ...obs, detail: "x".repeat(5000) }] }],
      new Map(),
      AHORA,
    );
    expect(paso?.detail.length).toBe(600);
    expect(paso?.aviso?.decision).toBe("nueva");
  });
});

describe("chequeoDeJobs", () => {
  const base = { queue: "backups.daily", lastError: "S3 403", lastFailedAt: hace(5 * MIN) };

  it("prende si la última corrida falló, aunque haya sido hace horas", () => {
    const [o] = chequeoDeJobs(
      [{ ...base, lastState: "failed", recentFailures: 0, lastFailedAt: hace(300 * MIN) }],
      AHORA,
    );
    expect(o?.key).toBe("job:backups.daily");
    expect(o?.detail).toMatch(/falló la última corrida · el último hace 5 h\nS3 403/);
  });

  it("prende si falló dentro de la ventana aunque el siguiente saliera bien", () => {
    const [o] = chequeoDeJobs(
      [{ ...base, queue: "images.generate", lastState: "completed", recentFailures: 2 }],
      AHORA,
    );
    expect(o?.detail).toMatch(/^2 fallos en 30 min/);
  });

  it("calla cuando la última salió bien y no hay fallos recientes", () => {
    expect(chequeoDeJobs([{ ...base, lastState: "completed", recentFailures: 0 }], AHORA)).toEqual(
      [],
    );
  });
});

describe("mensaje", () => {
  it("junta todo el pase en un mensaje, nuevas primero, y escapa el HTML", () => {
    const m = componerMensaje(
      [
        {
          key: "a",
          decision: "resuelta",
          title: "Falla el job x",
          detail: "",
          since: hace(25 * MIN),
        },
        { key: "b", decision: "nueva", title: "Falla el job <y>", detail: "a < b", since: AHORA },
      ],
      "presencia.mx",
      AHORA,
    );
    expect(m.subject).toBe("Presencia · presencia.mx · 1 alerta nueva");
    expect(m.telegramHtml.indexOf("&lt;y&gt;")).toBeLessThan(m.telegramHtml.indexOf("Resuelto"));
    expect(m.telegramHtml).toContain("<code>a &lt; b</code>");
    expect(m.telegramHtml).toContain("Resuelto: Falla el job x (duró 25 min)");
  });

  it("si no cabe, corta bloques completos y dice cuántos faltan", () => {
    const html = ["<b>encabezado</b>", "a".repeat(40), "b".repeat(40), "c".repeat(40)].join("\n\n");
    const corto = recortar(html, 140);
    expect(corto.length).toBeLessThanOrEqual(140);
    expect(corto).toMatch(/^<b>encabezado<\/b>\n\na{40}\n\n… y 2 más/);
  });

  it("duracion", () => {
    expect(duracion(hace(3 * MIN), AHORA)).toBe("3 min");
    expect(duracion(hace(120 * MIN), AHORA)).toBe("2 h");
    expect(duracion(hace(72 * 60 * MIN), AHORA)).toBe("3 d");
  });
});

// PR3: cards degradadas y proveedores de IA.
describe("chequeoDeCards", () => {
  it("una o dos cards fallidas son de un creator, no operación", () => {
    expect(chequeoDeCards([{ reason: "x", n: 2 }])).toEqual([]);
  });

  it("tres en la ventana es un pico, con el desglose por motivo", () => {
    const [o] = chequeoDeCards([
      { reason: "No confirmó", n: 1 },
      { reason: "Huérfana", n: 3 },
    ]);
    expect(o?.key).toBe("cards:degradadas");
    expect(o?.title).toBe("4 cards pasaron a fallidas en 60 min");
    expect(o?.detail).toBe("3 × Huérfana\n1 × No confirmó");
  });
});

const evento = (
  over: Partial<{
    provider: string;
    model: string;
    fallbackFrom: string | null;
    attempts: unknown;
  }> = {},
) => ({
  provider: "openai",
  model: "gpt-6-luna",
  fallbackFrom: null,
  attempts: null,
  ...over,
});

describe("chequeoDeSaldo", () => {
  it("reconoce el 402 y el cuerpo de sin cuota, no un 503", () => {
    expect(esSinSaldo({ status: 402, error: "" })).toBe(true);
    expect(esSinSaldo({ status: 400, error: "Your credit balance is too low" })).toBe(true);
    expect(esSinSaldo({ status: 503, error: "overloaded" })).toBe(false);
  });

  it("agrupa por proveedor los intentos caídos por saldo", () => {
    const obs = chequeoDeSaldo([
      evento({
        provider: "google",
        fallbackFrom: "anthropic:claude-sonnet-5-5",
        attempts: [
          { id: "anthropic:claude-sonnet-5-5", status: 400, error: "credit balance is too low" },
          { id: "openai:gpt-6-luna", status: 503, error: "caído" },
        ],
      }),
      evento({
        attempts: [{ id: "anthropic:claude-sonnet-5-5", status: 402, error: "Payment Required" }],
      }),
      evento({ attempts: "no es una lista" }),
    ]);
    expect(obs.map((o) => o.key)).toEqual(["saldo:anthropic"]);
    expect(obs[0]?.detail).toMatch(/^2 intentos caídos por saldo/);
  });
});

describe("chequeoDeRespaldo", () => {
  const caido = evento({
    provider: "google",
    model: "gemini-3.8-flash",
    fallbackFrom: "openai:gpt-6-luna",
  });

  it("la mitad o más contestada por el respaldo prende la alerta del principal", () => {
    const obs = chequeoDeRespaldo([caido, caido, caido, evento(), evento()]);
    expect(obs.map((o) => o.key)).toEqual(["respaldo:openai:gpt-6-luna"]);
    expect(obs[0]?.detail).toMatch(/^3 de 5 respuestas .* google:gemini-3\.8-flash \(3\)$/);
  });

  it("con pocos eventos, o pocos del respaldo, calla", () => {
    expect(chequeoDeRespaldo([caido, caido, caido, caido])).toEqual([]);
    expect(chequeoDeRespaldo([caido, caido, evento(), evento(), evento()])).toEqual([]);
  });
});
