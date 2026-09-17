# ADR-006 · Streaming: SSE sobre HTTP (no WebSockets)

**Decisión:** Server-Sent Events para el chat. Los "steps" (tool calls, razonamiento) son tipos de evento dentro del mismo stream. "Detener generación" = AbortController en cliente + cancelación del stream río arriba (tokens a la nada = créditos quemados).

**Razón:** Unidireccional servidor→cliente es exactamente lo que el streaming LLM necesita; es lo que usan ChatGPT/Claude.ai. `useChat` del AI SDK maneja el protocolo.

**Descartado:** WebSockets — solo si algún día se necesita bidireccional real; la sync multi-canal V1 se resuelve con SSE de eventos o polling ligero. YAGNI.

**Addendum (F3 PR3):** el reintento ("Reintentar" en UI) usa el mismo canal — `trigger: "regenerate-message"` es el protocolo nativo de `useChat().regenerate()` del AI SDK, no un endpoint nuevo. El mismo `POST /chats/:id/stream` lee `trigger`/`messageId` del body; si es un reintento, el backend borra el mensaje assistant anterior (y sus `publication_cards` vinculadas — decisión de producto: no quedan huérfanas) antes de volver a correr el pipeline. Los "steps" mencionados arriba ahora se renderizan en el frontend: separadores visuales para `step-start` y cards de contenido para los `tool-*` parts (antes solo se streameaba texto).

**Addendum (2026-08-19) — corrección: no existe `messageId` en el protocolo real.** El párrafo de arriba ("lee `trigger`/`messageId` del body") describía un contrato que nunca se verificó contra el `DefaultChatTransport` real — `regenerate()` del AI SDK NUNCA manda un campo `messageId` aparte, solo reenvía `messages` ya recortado del lado del cliente (sin la respuesta assistant vieja) con `trigger:"regenerate-message"`. El bug se manifestó como un 400 "Falta el id del mensaje a reintentar" en cada intento de regenerar — confirmado con el payload real capturado en vivo. Corregido: el controller extrae el id del **último elemento de `messages`** (el mensaje user al que hay que responder de nuevo) con el mismo `parseLastUserMessage` que ya usa un turno normal — `chatStreamBodySchema` pierde el campo `messageId` (dead field, nunca lo llenó nadie). `ChatService.regenerateChat` ahora recibe ese id de mensaje **user**, no de mensaje assistant, y maneja dos casos válidos: el mensaje user es el último de la conversación (turno que falló antes de generar cualquier respuesta — el botón "Reintentar" de un error, nada que borrar) o el penúltimo seguido de la respuesta assistant a regenerar (caso normal, se borra esa respuesta + sus cards). Cualquier otro caso se sigue rechazando (mismo chequeo de seguridad: no se puede reintentar un turno intermedio).

Nota provisional: el texto libre del asistente se renderiza con `react-markdown` sin plugins (más una hoja de estilos mínima, sin `@tailwindcss/typography`). Es una elección de "que funcione ya", no un compromiso de largo plazo — se reevalúa en el pulido visual final.

**Addendum (F4.5, 2026-08-09) — dieta de contexto en la rehidratación del historial.** El problema: `messages.parts` guarda el output de las tools de card tal cual (contenido completo, ADR-005), y `runAgentTurn` recarga **todo** el historial en cada turno — un chat con 5 cards arrastraba 5 JSONs completos de publicación en cada request nuevo, para siempre. `compressToolOutputsForModel` (`apps/api/src/chat/context-diet.ts`) sustituye el output de las tool calls de card más viejas que las últimas 3 por un resumen compacto (`summarizeCardContent`, `packages/shared/src/publication.ts`) — conservando la forma del objeto (`{cardId, network, status, resumen}` en vez de `...content`) para no confundir al modelo sobre el schema de la tool. Las últimas 3 viajan íntegras por si el usuario dice "cámbiale el hook a esa" (subido de 2 a 3 tras prueba manual: los flujos reales crean varias cards seguidas antes de pedir ediciones).

**Se aplica solo en el camino hacia el modelo**, nunca en el read path: `runAgentTurn` llama `convertToModelMessages(compressToolOutputsForModel(history, 3))` para construir `messages`, pero pasa `history` sin tocar como `originalMessages`. `toUIMessage` y `getMessages` (que alimentan `GET /chats/:id/messages`, es decir el navegador) no cambian — `PublicationCard.tsx` sigue pintando el `content` completo del tool part, porque no existe endpoint de cards que lo recupere después (ADR-005: "el frontend lo pinta directo desde el tool part sin round-trip"). Comprimir en el read path habría roto la UI de cards viejas.

**Hallazgo evaluado y revertido — el reasoning de modelos de razonamiento no pasa por la dieta, y no se puede recortar del lado del cliente.** Con un modelo de razonamiento (ej. OpenAI vía Responses API), cada turno persiste una part `type: "reasoning"` con un blob cifrado (`providerMetadata`) que `convertToModelMessages` reenvía tal cual — nunca es una `tool-*` part, así que `compressToolOutputsForModel` no la toca. Verificado en un chat real: una card quedaba correctamente comprimida a resumen, pero el modelo seguía citando montos exactos de esa card en turnos posteriores — el reasoning del turno donde se creó esa card (nunca comprimido) le daba acceso indirecto al detalle.

Se implementó `stripReasoningParts` para descartarlo de todo el historial y se **revirtió el mismo día**: OpenAI Responses API exige que todo mensaje de texto viaje acompañado de su reasoning item original — quitarlo rompe el request con `400 invalid_request_error`: _"Item '...' of type 'message' was provided without its required 'reasoning' item: '...'"_. Reproducido y confirmado contra un chat real antes de revertir. No es un detalle cosmético del proveedor: es una restricción estructural del protocolo, no algo que se pueda mitigar filtrando parts en el cliente sin cambiar de API mode (ej. Chat Completions en vez de Responses, o encadenar con `previous_response_id` en vez de reconstruir el historial completo cada turno — ninguna de las dos se evalúa aquí).

**Queda como hueco de contexto conocido, no resuelto:** el reasoning de todos los turnos anteriores viaja completo en cada request, sin comprimir, y puede filtrar detalle de cards ya comprimidas por `compressToolOutputsForModel`. No compromete correctitud (el dato ya vive completo en Postgres) ni seguridad (mismo tenant), pero sí diluye el ahorro de tokens de la dieta de cards para modelos de razonamiento. Revisar si algún día se cambia de API mode, o cuando se construya `history_compaction` (backlog, Notion) — ese mecanismo sí podría absorber este caso si trabaja a nivel de mensajes completos en vez de parts sueltas.

**Beneficio secundario:** un prefijo de contexto más corto y estable es precondición para que el prompt caching funcione después. Se evaluó y se pospuso deliberadamente en la sesión de diseño de F4.5 (2026-08-02, puerta abierta documentada en la tarea de Notion "F4.5 · Instrumentación de usage + routing por tarea"): el mínimo cacheable son 1024 tokens de prefijo estable (2048 en modelos clase Haiku), y el `SYSTEM_PROMPT` actual no los cruza de forma consistente — implementarlo hoy sería un no-op decorado. Las dos optimizaciones (dieta de contexto + caching futuro) se refuerzan.

## Addendum (2026-09-16, F8.6) — un segundo stream: eventos de cards

El "SSE de eventos" que este ADR dejaba para cuando hiciera falta llegó con F8.6: la card tiene que cambiar
sola en el navegador cuando el worker la marca publicada o fallida, sin recargar.

**Endpoint.** `GET /api/stream` (`realtime/stream.controller.ts`), abierto mientras la app esté abierta.
Escrito a mano y no con el AI SDK: `EventSource` solo hace `GET` y no acepta headers, y esto es un canal,
no una respuesta que termina. La autenticación es la cookie de sesión que el guard global ya resuelve.
Eventos: `card` (el `PublicationCardDto` completo), `card-deleted` (`{ id }`) y `resync`.

**El puente entre procesos: `NOTIFY`/`LISTEN`.** El worker corre en otro contenedor (ADR-020), así que un
`Map` de conexiones en la API no ve lo que él escribe.

- Toda escritura de `cards.repository.ts` hace `pg_notify('card_changed', '<userId>:<cardId>')` **dentro
  de su transacción**. Postgres solo lo entrega con `COMMIT`, así que nunca se avisa de algo que no quedó
  guardado.
- La API escucha con un `pg.Client` dedicado (`realtime/card-listener.service.ts`), no del pool: `LISTEN`
  vive lo que vive la sesión.
- El payload lleva **solo ids**. La card se lee con el RLS de su dueño en `CardsService.findDto`, una
  sola ruta arma el DTO, y un payload inventado no puede empujar la card de otro tenant (llega como
  `card-deleted`).
- Las notificaciones se atienden en serie para que dos cambios seguidos de la misma card no lleguen
  invertidos. Sin conexiones de ese usuario en el proceso, no se lee nada.

**Descartado: Redis/pub-sub.** Hay una sola API; Postgres ya está y el volumen es de pocos eventos por
usuario. Si algún día hay varias réplicas de la API, cada una escucha el mismo canal y atiende a sus
conexiones: el diseño no cambia.

**Lo que se pierde y cómo se recupera.** `NOTIFY` no se encola: si el listener estaba desconectado, esos
eventos no vuelven. Tres redes, de la más cercana a la más lejana:

1. Al reconectar el listener, la API manda `resync` a todas las conexiones.
2. `EventSource` reconecta solo si se corta (deploy, red), y el cliente revalida al reconectar.
3. Volver a la pestaña revalida lo que está en pantalla.
   Misma simetría que el resto del sistema: el cron es la red de seguridad del proveedor, y la revalidación
   es la del stream.

**Heartbeat.** Un `event: ping` cada 20 s a todas las conexiones, con un solo intervalo por proceso. Es un
evento con nombre y no un comentario SSE porque también lo usa el cliente: si pasan 50 s sin recibir nada,
da la conexión por muerta y reconecta. Eso cubre las conexiones medio abiertas, que `EventSource` no
detecta solo: una laptop que se durmió, o un proxy que no propaga el cierre del servidor. El proxy de dev
de Vite es uno de esos: al reiniciar la API deja colgado al navegador.
El nginx de CloudPanel corta a los 900 s una conexión que no manda nada (`desplegar.md`).

**El cliente** aplica la card al store normalizado (addendum de ADR-018) sin volver a pedirla. Vive en `components/realtime/LiveCards.tsx`, montado en el shell autenticado: si el
stream responde algo que no es un stream (un 502 de nginx durante un deploy, un 401), `EventSource` se
cierra para siempre, así que ahí el cliente reintenta a mano con espera creciente (3 s a 60 s).
