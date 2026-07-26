# ADR-006 · Streaming: SSE sobre HTTP (no WebSockets)

**Decisión:** Server-Sent Events para el chat. Los "steps" (tool calls, razonamiento) son tipos de evento dentro del mismo stream. "Detener generación" = AbortController en cliente + cancelación del stream río arriba (tokens a la nada = créditos quemados).

**Razón:** Unidireccional servidor→cliente es exactamente lo que el streaming LLM necesita; es lo que usan ChatGPT/Claude.ai. `useChat` del AI SDK maneja el protocolo.

**Descartado:** WebSockets — solo si algún día se necesita bidireccional real; la sync multi-canal V1 se resuelve con SSE de eventos o polling ligero. YAGNI.

**Addendum (F3 PR3):** el reintento ("Reintentar" en UI) usa el mismo canal — `trigger: "regenerate-message"` es el protocolo nativo de `useChat().regenerate()` del AI SDK, no un endpoint nuevo. El mismo `POST /chats/:id/stream` lee `trigger`/`messageId` del body; si es un reintento, el backend borra el mensaje assistant anterior (y sus `publication_cards` vinculadas — decisión de producto: no quedan huérfanas) antes de volver a correr el pipeline. Los "steps" mencionados arriba ahora se renderizan en el frontend: separadores visuales para `step-start` y cards de contenido para los `tool-*` parts (antes solo se streameaba texto).

Nota provisional: el texto libre del asistente se renderiza con `react-markdown` sin plugins (más una hoja de estilos mínima, sin `@tailwindcss/typography`). Es una elección de "que funcione ya", no un compromiso de largo plazo — se reevalúa en el pulido visual final.
