# ADR-006 · Streaming: SSE sobre HTTP (no WebSockets)

**Decisión:** Server-Sent Events para el chat. Los "steps" (tool calls, razonamiento) son tipos de evento dentro del mismo stream. "Detener generación" = AbortController en cliente + cancelación del stream río arriba (tokens a la nada = créditos quemados).

**Razón:** Unidireccional servidor→cliente es exactamente lo que el streaming LLM necesita; es lo que usan ChatGPT/Claude.ai. `useChat` del AI SDK maneja el protocolo.

**Descartado:** WebSockets — solo si algún día se necesita bidireccional real; la sync multi-canal V1 se resuelve con SSE de eventos o polling ligero. YAGNI.
