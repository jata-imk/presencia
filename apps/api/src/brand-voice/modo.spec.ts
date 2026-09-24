import { describe, expect, it } from "vitest";
import {
  goalsDeExtras,
  metaSugerida,
  modoDeGoals,
  modoEfectivo,
  MODO_ESTRATEGIA_FALLBACK,
} from "@presencia/shared";

// El Modo se deriva de `extras.goals`, que es un jsonb sin schema escrito una
// sola vez por el onboarding. Lo que se prueba acá es esa frontera: que la
// derivación no invente y que lo que el usuario eligió a mano siempre gane.

describe("goalsDeExtras", () => {
  it("saca la lista cuando está", () => {
    expect(goalsDeExtras({ goals: ["Más seguidores", "Ahorrar tiempo"] })).toEqual([
      "Más seguidores",
      "Ahorrar tiempo",
    ]);
  });

  it("no se cae con lo que el motor no garantiza", () => {
    // `extras` es jsonb: puede venir con cualquier forma, incluida la de una
    // versión vieja del onboarding. Lo que no sea lista de strings no está.
    expect(goalsDeExtras(null)).toEqual([]);
    expect(goalsDeExtras({})).toEqual([]);
    expect(goalsDeExtras({ goals: "Más seguidores" })).toEqual([]);
    expect(goalsDeExtras({ goals: [1, "Más ventas", null] })).toEqual(["Más ventas"]);
    expect(goalsDeExtras("nada de esto")).toEqual([]);
  });
});

describe("modoDeGoals", () => {
  it("reconoce la intención de crecer en los presets del onboarding", () => {
    expect(modoDeGoals(["Más seguidores"])).toBe("crecer");
    expect(modoDeGoals(["Más ventas/clientes"])).toBe("crecer");
  });

  it("encuentra la intención también en el texto libre, con acentos", () => {
    // El paso de metas tiene un campo "Algo más (opcional)", así que acá entra
    // texto que nadie escribió pensando en este mapeo.
    expect(modoDeGoals(["Quiero ampliar mi audiencia en Mérida"])).toBe("crecer");
    expect(modoDeGoals(["conseguir más clientes"])).toBe("crecer");
  });

  it("cae a mantener cuando nada habla de crecer", () => {
    expect(modoDeGoals(["Ahorrar tiempo", "Consistencia al publicar"])).toBe("mantener");
    expect(modoDeGoals([])).toBe(MODO_ESTRATEGIA_FALLBACK);
  });

  it("un empate se resuelve hacia crecer", () => {
    // A propósito: una meta baja de más pasa desapercibida, una alta de más se
    // corrige con un click y además se muestra marcada como sugerida.
    expect(modoDeGoals(["Consistencia al publicar", "Más seguidores"])).toBe("crecer");
  });

  it("nunca deriva lanzar", () => {
    // Ninguna meta del onboarding significa "tengo un lanzamiento": es una
    // decisión puntual que el usuario toma cuando le pasa, no algo que se
    // adivine. Si esto empieza a devolver `lanzar`, alguien inventó un mapeo.
    const todos = [
      "Más seguidores",
      "Más ventas/clientes",
      "Ahorrar tiempo",
      "Consistencia al publicar",
      "Entender qué funciona",
      "Lanzar mi curso nuevo",
    ];
    for (const meta of todos) {
      expect(modoDeGoals([meta])).not.toBe("lanzar");
    }
  });
});

describe("modoEfectivo", () => {
  it("lo elegido a mano le gana a la derivación", () => {
    expect(modoEfectivo("mantener", { goals: ["Más seguidores"] })).toBe("mantener");
    expect(modoEfectivo("lanzar", { goals: [] })).toBe("lanzar");
  });

  it("con null deriva de las metas", () => {
    expect(modoEfectivo(null, { goals: ["Más seguidores"] })).toBe("crecer");
    expect(modoEfectivo(null, {})).toBe(MODO_ESTRATEGIA_FALLBACK);
  });
});

describe("metaSugerida", () => {
  it("mantener deja la base intacta", () => {
    expect(metaSugerida("instagram", "mantener")).toBe(5);
    expect(metaSugerida("linkedin", "mantener")).toBe(2);
  });

  it("crecer y lanzar piden más", () => {
    expect(metaSugerida("instagram", "crecer")).toBeGreaterThan(
      metaSugerida("instagram", "mantener"),
    );
    // Los dos piden más volumen; lo que cambia entre ellos es el tema, que es
    // trabajo del Chat. Un tercer factor para separarlos sería inventado.
    expect(metaSugerida("instagram", "lanzar")).toBe(metaSugerida("instagram", "crecer"));
  });

  it("nunca sugiere cero", () => {
    // `target = 0` es una elección legítima del usuario ("en esta red no
    // publico"), pero proponerla nosotros sería sugerirle que no publique.
    for (const modo of ["crecer", "mantener", "lanzar"] as const) {
      expect(metaSugerida("youtube", modo)).toBeGreaterThanOrEqual(1);
    }
  });
});
