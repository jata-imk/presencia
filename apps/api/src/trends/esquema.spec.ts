import { describe, expect, it } from "vitest";
import { zodSchema } from "ai";
import { esquemaDeEstructura } from "./esquema.js";

// La forma del schema de estructura es un contrato con el PROVEEDOR.
//
// En prod el tier utility cae a OpenAI, cuyo provider del AI SDK manda
// `strictJsonSchema: true` por default. En modo strict, todo objeto tiene que
// declarar `additionalProperties: false` y TODAS sus llaves en `required`: una
// sola llave opcional y OpenAI rechaza el schema entero, después de que la
// búsqueda con grounding ya se pagó. Pasó (F9.6, #90): `titulo` y `gancho` eran
// `.nullish()` y toda búsqueda de tendencias terminaba en error.
//
// Se prueba contra la MISMA conversión que usa el SDK (`zodSchema`), no contra
// `z.toJSONSchema` a mano: el SDK convierte con `io: "input"`, donde `.nullish()`,
// `.catch()` y `.default()` sacan la llave de `required`. Solo `.nullable()` la deja.

interface NodoJson {
  type?: unknown;
  properties?: Record<string, NodoJson>;
  required?: string[];
  additionalProperties?: unknown;
  items?: NodoJson;
  anyOf?: NodoJson[];
}

/** Las rutas de los objetos que OpenAI strict rechazaría, con el motivo. */
function violacionesStrict(nodo: NodoJson, ruta = "$"): string[] {
  const errores: string[] = [];
  if (nodo.type === "object" && nodo.properties) {
    if (nodo.additionalProperties !== false) {
      errores.push(`${ruta}: falta additionalProperties: false`);
    }
    const requeridas = new Set(nodo.required ?? []);
    for (const llave of Object.keys(nodo.properties)) {
      if (!requeridas.has(llave)) errores.push(`${ruta}: '${llave}' no está en required`);
    }
    for (const [llave, hijo] of Object.entries(nodo.properties)) {
      errores.push(...violacionesStrict(hijo, `${ruta}.${llave}`));
    }
  }
  if (nodo.items) errores.push(...violacionesStrict(nodo.items, `${ruta}[]`));
  for (const opcion of nodo.anyOf ?? []) errores.push(...violacionesStrict(opcion, ruta));
  return errores;
}

describe("esquemaDeEstructura", () => {
  it("cumple el modo strict de OpenAI tal como lo manda el AI SDK", async () => {
    const json = (await zodSchema(esquemaDeEstructura).jsonSchema) as NodoJson;
    expect(violacionesStrict(json)).toEqual([]);
  });

  it("deja al modelo decir 'no tengo propuesta' con null", () => {
    const parsed = esquemaDeEstructura.safeParse({
      tendencias: [
        {
          topic: "Carruseles antes y después",
          signal: "rising",
          network: "instagram",
          format: "carrusel",
          blurb: "Se está moviendo.",
          sourceIndex: 0,
          titulo: null,
          gancho: null,
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });
});
