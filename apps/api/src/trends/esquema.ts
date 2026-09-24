import { z } from "zod";
import { socialNetworkSchema, TREND_FORMATS, TREND_SIGNALS } from "@presencia/shared";
import { MAX_TENDENCIAS } from "./prompt.js";

// Lo que la llamada de estructura le pide al modelo: la prosa de la búsqueda
// convertida en items, con la procedencia como índice a la lista de fuentes.
//
// Vive sola, y no dentro de trends.service.ts, para poder probar su forma sin
// arrastrar env.ts: la forma es un contrato con el PROVEEDOR, no con nosotros.
// Ver esquema.spec.ts.

export const esquemaDeEstructura = z.object({
  tendencias: z
    .array(
      z.object({
        topic: z.string(),
        signal: z.enum(TREND_SIGNALS),
        network: socialNetworkSchema,
        format: z.enum(TREND_FORMATS),
        blurb: z.string(),
        sourceIndex: z.number().int(),
        // `nullable` y NUNCA `nullish`/`optional`: la llave viaja siempre, y
        // `null` es como el modelo dice "no tengo una propuesta buena". El AI
        // SDK convierte con `io: "input"`, donde una llave opcional sale de
        // `required`, y OpenAI en modo strict rechaza el schema entero por eso
        // —después de pagar la búsqueda—. Pasó en prod (F9.6, #90); ver
        // esquema.spec.ts. Que un proveedor laxo omita la llave es el mismo
        // riesgo que ya corren `topic` o `blurb`, que siempre fueron requeridas.
        // El tope de largo tampoco va acá: lo aplica `ensamblarTendencias`, que
        // descarta solo la propuesta y no la tendencia.
        titulo: z.string().nullable(),
        gancho: z.string().nullable(),
      }),
    )
    .max(MAX_TENDENCIAS * 2),
});
