import { describe, expect, it } from "vitest";
import { zodSchema } from "ai";
import {
  CARD_ARCHETYPE_TOOLS,
  buildPostText,
  cardTextFieldsSchema,
  normalizeHashtags,
  type CardContent,
} from "@presencia/shared";

// F10.8.4: el modelo manda los hashtags con "#" y la card salía "##tacos".
// Se guardan sin "#" (el schema compartido los normaliza en todos los
// caminos) y buildPostText se lo pone al publicar o pintar.

function tool(name: (typeof CARD_ARCHETYPE_TOOLS)[number]["toolName"]) {
  const def = CARD_ARCHETYPE_TOOLS.find((t) => t.toolName === name);
  if (!def) throw new Error(`sin tool ${name}`);
  return def;
}

describe("hashtags", () => {
  it("la card del chat guarda los hashtags sin # ni espacios", () => {
    const def = tool("crear_borrador_visual");
    const input = def.inputSchema.parse({
      network: "instagram",
      caption: "Tacos de cochinita",
      hashtags: ["#tacos", "##Mérida", "cochinita", " #Café Xtabay ", "#", ""],
    });
    const content = def.buildContent(input);
    expect(content.hashtags).toEqual(["tacos", "Mérida", "cochinita", "CaféXtabay"]);
  });

  it("varias etiquetas juntas en un string se separan, no se funden", () => {
    const def = tool("crear_borrador_texto");
    const content = def.buildContent(
      def.inputSchema.parse({
        network: "linkedin",
        body: "Hola",
        hashtags: ["#tacos #merida", "uno, dos"],
      }),
    );
    expect(content.hashtags).toEqual(["tacos", "merida", "uno", "dos"]);
  });

  // La migración 0052 repite esta regla en SQL: si cambia aquí, cambia allá.
  it("descarta repetidos y quita también los espacios Unicode", () => {
    expect(normalizeHashtags(["tacos", "#tacos #tacos", "Café Xtabay", "Café Xtabay"])).toEqual([
      "tacos",
      "CaféXtabay",
    ]);
  });

  it("el texto publicado lleva un solo # aunque la card vieja lo traiga guardado", () => {
    const legacy = {
      archetype: "text_first",
      body: "Hola",
      hashtags: ["#tacos", "mérida"],
      assetIds: [],
    } as CardContent;
    expect(buildPostText(legacy)).toBe("Hola\n\n#tacos #mérida");
  });

  it("el editor del panel también los normaliza al guardar", () => {
    const fields = cardTextFieldsSchema.parse({ hashtags: ["#uno", "dos", "#"] });
    expect(fields.hashtags).toEqual(["uno", "dos"]);
  });

  it("los topes del editor cuentan lo normalizado, no lo crudo", () => {
    const largo = "a".repeat(100);
    expect(cardTextFieldsSchema.parse({ hashtags: [`#${largo}`] }).hashtags).toEqual([largo]);
    const treinta = Array.from({ length: 30 }, (_, i) => `t${String(i)}`);
    expect(cardTextFieldsSchema.safeParse({ hashtags: [...treinta, "#"] }).success).toBe(true);
    expect(cardTextFieldsSchema.safeParse({ hashtags: [...treinta, "otra"] }).success).toBe(false);
  });

  // El transform no puede romper la conversión del SDK: zodSchema() convierte
  // con io "input", y un transform suelto (sin pipe) lanzaría aquí.
  it.each(CARD_ARCHETYPE_TOOLS.map((t) => t.toolName))(
    "%s sigue convirtiéndose a JSON Schema",
    (name) => {
      const json = zodSchema(tool(name).inputSchema).jsonSchema as {
        properties: Record<string, { type?: unknown; items?: { type?: unknown } }>;
      };
      expect(json.properties.hashtags).toMatchObject({ type: "array", items: { type: "string" } });
    },
  );
});
