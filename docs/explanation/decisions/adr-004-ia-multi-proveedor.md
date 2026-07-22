# ADR-004 · IA: multi-proveedor desde día 1 vía capa de orquestación

**Decisión:** Vercel AI SDK como capa provider-agnostic. Proveedores iniciales: Gemini, OpenAI, MiniMax (API compatible OpenAI). El proveedor es detalle intercambiable detrás de interfaz propia.

**Razón:** Cambiar de modelo = cambiar una línea. Protege contra rate limits, precios y calidad variable.

**Regla no negociable:** suite de regresión con ~10 prompts en registro mexicano "de barrio" contra cada modelo — el moat cultural se valida por proveedor, no se asume. Ojo: cada modelo tiene manías distintas con tool calling (Gemini estricto con schemas, MiniMax más flojo).

**Descartado:** LangChain/LangGraph — abstracción con impuestos innecesarios para un agentic loop + tools.

**Implementación (F3, 2026-07-19):** registry interno (`apps/api/src/ai/provider-registry.ts`) con ids `proveedor:modelo`. Proveedores: `google`, `openai`, `anthropic`, `deepseek` (providers oficiales del AI SDK) y `minimax`/`kimi` (vía `@ai-sdk/openai-compatible`). La tabla descriptora `PROVIDERS` es la fuente única de verdad del inventario: registro, validación de env (formato de `AI_MODEL` y presencia de API key) y suite cultural derivan de ella. Agregar un proveedor = una fila en la tabla + su key en el schema de env — pero cada modelo que compita por ser default debe pasar la suite cultural primero. Todas las keys son opcionales; solo la del proveedor de `AI_MODEL` es obligatoria (fail-fast al boot). `resolveModel(modelId?)` cae al default de la env var `AI_MODEL` — cambiar de proveedor es editar la variable y reiniciar el proceso, palanca del **operador**, no del usuario. Solo la key del proveedor default es obligatoria (fail-fast al boot en `env.ts`); proveedores sin key no se registran. El resto de la app pide modelos vía `AiService` y nunca importa un proveedor concreto.

**Puerta abierta (decidido 2026-07-19, NO construido):** el usuario final no elige modelo en V1. Si algún día se quiere selector por chat, el cambio es acotado: columna `chats.model_id` nullable + pasar ese id a `resolveModel` — esta capa no cambia. No se construye UI, columna ni catálogo hasta tener evidencia de necesidad (YAGNI).

**Suite cultural:** `pnpm --filter @presencia/api suite:cultural` (script en `apps/api/scripts/cultural-suite/`) corre los ~10 prompts contra cada modelo con el system prompt de producción y una tool mock, y genera reporte lado a lado en `docs/reference/suite-cultural/` para juicio humano (sin LLM juez — el criterio cultural es del founder).

**Pendiente:** modelo default por acción (chat vs generación vs adaptación) según los resultados versionados de la suite en `docs/reference/suite-cultural/`.
