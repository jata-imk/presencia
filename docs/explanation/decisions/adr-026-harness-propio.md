# ADR-026 · Harness propio sobre AI SDK

**Decisión:** Presencia arma su propio _harness_ de agente sobre el Vercel AI SDK, y no adopta un framework de agentes (Mastra, OpenAI Agents SDK, LangGraph). Los frameworks se estudian **como referencia** antes de construir cada pieza.

Un harness es todo lo que rodea al modelo para que haga trabajo real. En nuestro caso, la línea queda así:

| Pieza                                     | Quién la pone | Dónde                                                                                |
| ----------------------------------------- | ------------- | ------------------------------------------------------------------------------------ |
| Loop de agente (modelo → tool → modelo)   | AI SDK        | `streamText` + `stopWhen` en `chat/chat.service.ts`                                  |
| Tool calling y validación de input        | AI SDK        | `tool()` con schemas Zod (ADR-005)                                                   |
| Streaming al navegador                    | AI SDK        | `pipeUIMessageStreamToResponse` (ADR-006)                                            |
| Abstracción de proveedores                | AI SDK        | `createProviderRegistry` (ADR-004)                                                   |
| Respaldo entre proveedores, timeouts      | **Nuestro**   | `ai/fallback.ts` (ADR-004, addendum F10.7)                                           |
| Qué ve el modelo en cada turno (contexto) | **Nuestro**   | `history-window.ts`, `context-diet.ts` (ADR-006)                                     |
| Compactación de chats largos              | **Nuestro**   | `chat_summaries`, job `chat.compact` (ADR-006, addendum F10.8)                       |
| Memoria entre chats                       | **Nuestro**   | `memory_chunks` + pgvector, tool `buscar_en_memoria` (ADR-004, addendum F10.8)       |
| Memoria estructurada del usuario          | **Nuestro**   | Voz de marca ([doc de producto](../product/presencia-configuracion-voz-de-marca.md)) |
| Sesiones y persistencia                   | **Nuestro**   | `chats`, `messages` con RLS (ADR-003)                                                |
| Cobro por uso                             | **Nuestro**   | Ledger de créditos (ADR-012)                                                         |
| Telemetría de gasto                       | **Nuestro**   | `ai_usage_events` (ADR-004, addenda F4.5 y F9.8)                                     |
| Trabajo en segundo plano                  | **Nuestro**   | pg-boss (ADR-008)                                                                    |

## Razón

**Lo que nos diferencia no viene en ningún framework.** El valor de Presencia está en las piezas de abajo de la tabla: el contexto que entiende las cards como publicaciones vivas, el cobro en la misma transacción que el mensaje, el aislamiento por RLS, la Voz de marca y la cadena de respaldo que solo admite modelos que pasaron la suite cultural. Un framework trae versiones genéricas de esas piezas, y habría que pelear contra ellas para tener las nuestras.

**Lo genérico ya lo tenemos de un tercero.** El loop, las tools, el streaming y los proveedores son del AI SDK. No estamos reinventando el agente: estamos construyendo la capa de producto encima de uno.

**Lo evaluado (2026-10-09), y por qué no:**

- **Mastra.** Es el más compatible (está construido sobre el AI SDK) y trae memoria por capas: mensajes recientes, búsqueda semántica con pgvector, _working memory_ y _observational memory_. Pero guarda sus hilos y mensajes en tablas propias (`mastra_threads`, `mastra_messages`) que aíslan por un filtro `resourceId`, no por RLS de Postgres (choca con ADR-003). Su compactación no sabe qué es una card ni cuánto cobrar por resumir. Adoptarlo sería reescribir el chat, el SSE y el store de la web para obtener piezas que ya existen.
- **OpenAI Agents SDK.** Centrado en OpenAI: su compactación (`responses.compact`) solo funciona con modelos de OpenAI, y nuestra cadena cae a Gemini y a Claude. Los otros proveedores entran por un adapter de extensión.
- **LangGraph.** Ejecución durable por grafos, con checkpoints y aprobación humana. Resuelve flujos de días con pausas; nuestros turnos son de 5 pasos como máximo.

**Qué se toma de ellos como referencia** (cada pieza nueva de harness empieza por ver cómo la resolvieron):

- **Resúmenes por bloques** que se agregan en vez de reescribirse: _observational memory_ de Mastra y CliffCompaction (no resumir resúmenes; la caché del prefijo sobrevive).
- **Tracing por run y por paso:** el modelo Trace → Span del OpenAI Agents SDK.
- **ContextBuilder** con nombre propio: "almacenamiento ≠ memoria ≠ contexto".
- **Umbral de compactación por costo, no por ventana:** Mastra comprime a los 30k tokens; nosotros a los 40k (ADR-006, addendum F10.8). Claude Code y Codex compactan cerca del 60–90% de la ventana porque son agentes de código con mucho estado vivo, que no es nuestro caso.

## Cuándo reevaluar

Este ADR se reemplaza (no se edita) si aparece alguno de estos casos:

- **Flujos durables con aprobación humana:** un agente que planea y programa una semana entera, se detiene a esperar que el creator apruebe y sigue al día siguiente. Ahí LangGraph o los workflows de Mastra ahorran construir checkpoints.
- **Subagentes:** un agente que delega en otros (por ejemplo, uno que investiga tendencias mientras otro redacta).
- **Un canal que exija otro runtime** (por ejemplo, voz en tiempo real).

## Descartado

- **Una interfaz `AgentRuntime` para cambiar de runtime** (propio, Agents SDK, Mastra). YAGNI: no hay un segundo runtime en el plan, y la costura que importa ya existe en el `LanguageModel` del AI SDK.
- **Adoptar un framework "para no mantener" la memoria y la compactación.** Lo que se ahorra en mantener se paga en migrar datos, en perder RLS y en adaptar el framework a las cards y al cobro.

## Fuentes

- [Mastra: Observational Memory](https://mastra.ai/blog/observational-memory) y [Memory overview](https://mastra.ai/en/docs/memory/overview).
- [Mastra: PostgreSQL storage](https://mastra.ai/reference/storage/postgresql).
- [OpenAI Agents SDK: OpenAIResponsesCompactionSession](https://openai.github.io/openai-agents-python/ref/memory/openai_responses_compaction_session/).
- [Compactación en Codex CLI, Claude Code y OpenCode](https://codex.danielvaughan.com/2026/04/14/context-compaction-deep-dive-codex-cli-claude-code-opencode/).
- [CliffCompaction (arXiv 2609.26779)](https://arxiv.org/abs/2609.26779).
- [Chroma: Context Rot](https://research.trychroma.com/context-rot).
- [Mem0: cómo funciona](https://docs.mem0.ai/core-concepts/how-it-works) y [LongMemEval (arXiv 2410.10813)](https://arxiv.org/abs/2410.10813).
