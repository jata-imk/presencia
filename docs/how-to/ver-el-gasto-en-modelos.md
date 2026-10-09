# Ver cuánto gastamos en modelos

```bash
pnpm --filter @presencia/api gasto              # últimos 7 días
pnpm --filter @presencia/api gasto -- --dias 30
```

Imprime el gasto en dólares por día, origen, modelo y tarea, y un total por modelo.

## Ver un turno paso a paso (F10.8.1)

```bash
pnpm --filter @presencia/api traza <runId>          # un turno
pnpm --filter @presencia/api traza <chatId>         # sus últimos 5 turnos
pnpm --filter @presencia/api traza <chatId> -- --turnos 20
```

Imprime cada paso del modelo (cuánto esperó, tokens y **qué porcentaje salió de caché**), cada tool que llamó con su tiempo, el total del turno con su costo y lo que el turno disparó después (título, compactación, indexado de memoria). Un turno cortado aparece con su paso `ABORTED` y "sin cobro". El `runId` de una respuesta está en `messages.run_id`; los turnos anteriores a F10.8.1 no tienen traza.

## De dónde salen los números

- **La app:** `ai_usage_events` de la base del `.env`. En tu máquina es la de dev; corrido en el VPS, la de prod. Cubre el chat, adaptar, las tendencias (con sus búsquedas de grounding) y las imágenes.
- **Los scripts de esta máquina:** `apps/api/scripts/.gasto-local.jsonl` (fuera de git). Ahí escriben el bake-off de imágenes, los ejemplos de Estilo visual y la suite cultural, que no pasan por la app. Antes eran gasto invisible.
- **Los precios:** `apps/api/src/ai/model-prices.ts`, la fuente única. Cada fila dice de dónde salió y cuándo se revisó.

## Qué hacer si…

- **Un modelo sale "sin precio":** falta su fila en `model-prices.ts`. Se agrega con la fuente; no se adivina.
- **Cambiaste de proveedor:** el consumo se sigue registrando (cada fila lleva proveedor y modelo), pero el dinero solo aparece cuando el modelo nuevo tiene su fila de precio.
- **El total no cuadra con la factura del proveedor:** el reporte es el techo. No resta niveles gratis (las 5,000 búsquedas al mes de Gemini) ni descuentos de batch, y no ve el gasto de otra máquina ni de otro ambiente que compartan la misma key. Si dev y prod usan la misma key de Google, el prepago se gasta en los dos.

## Dato a tener en cuenta

Google cobra la imagen por tokens de salida. Una 4:5 (928×1152) sale en ~~1,580 tokens: **~~$0.095**, no los $0.067 del 1K cuadrado de su lista de precios.
