# ADR-004 · IA: multi-proveedor desde día 1 vía capa de orquestación

**Decisión:** Vercel AI SDK como capa provider-agnostic. Proveedores iniciales: Gemini, OpenAI, MiniMax (API compatible OpenAI). El proveedor es detalle intercambiable detrás de interfaz propia.

**Razón:** Cambiar de modelo = cambiar una línea. Protege contra rate limits, precios y calidad variable.

**Regla no negociable:** suite de regresión con ~10 prompts en registro mexicano "de barrio" contra cada modelo — el moat cultural se valida por proveedor, no se asume. Ojo: cada modelo tiene manías distintas con tool calling (Gemini estricto con schemas, MiniMax más flojo).

**Descartado:** LangChain/LangGraph — abstracción con impuestos innecesarios para un agentic loop + tools.

**Pendiente:** modelo default por acción (chat vs generación vs adaptación) según la suite de regresión cultural.
