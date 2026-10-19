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

## Addendum (2026-09-29, F10.5 PR3) — el modelo ve la card viva

Desde F10.5 una card cambia después de nacer: se edita a mano, se restaura una versión y, en el PR4, la IA la ajusta. El output de la tool en `messages.parts` sigue siendo la card **al nacer**, congelada (los mensajes son append-only). Si el historial viajara así, "hazme otra como esa" partiría de un texto que ya no existe.

- **`withLiveCards`** (`chat/context-diet.ts`) sustituye contenido y estado de cada output de card por los vivos antes de armar el contexto del modelo. Va **antes** de la dieta de contexto, así que el resumen de las cards viejas también sale del contenido vivo. Es una sola query por turno (`findContentByIds`). Si falla, el turno sigue con la foto del historial: peor contexto, no un chat caído.
- El navegador ya leía el contenido vivo de cards-store (F8.6); esto lo iguala del lado del modelo.
- **Regenerar un turno ya no borra cards que salieron a la red.** Si la respuesta tiene alguna card programada o publicada, la API responde 409 (`hasSentCards`). Antes la borraba sin cancelarla en el proveedor, y el post se publicaba sin card que lo representara. Si alguna card tiene ediciones (más de una versión), el navegador pide confirmación antes de regenerar, porque regenerar borra las cards con sus versiones.

## Addendum (2026-10-04, F10.6.2) — markdown del chat

La nota provisional de arriba se resolvió así:

- **`remark-gfm`** como único plugin. Las URLs sueltas se vuelven links (antes salían como texto) y se suman tablas, tachado y listas de tareas.
- **Nada desborda el ancho del chat.** El problema real era el scroll horizontal de la página en móvil:
  - Los bloques de código se renderizan con `CodeBlock`: caja con su propio scroll, el lenguaje arriba y "Copiar". **Sin colores de sintaxis**: Presencia no es una herramienta de código y un resaltador no se paga.
  - Las tablas van en un contenedor con scroll.
  - Los links y el texto sin espacios se cortan (`overflow-wrap: anywhere`).
- **Los links abren en otra pestaña** (`target="_blank" rel="noopener noreferrer"`), así no se pierde el chat.
- **Sigue sin `@tailwindcss/typography`**: la hoja `.markdown` de `app.css` alcanza y usa los tokens.
- **`--font-mono` es la monoespaciada del sistema.** JetBrains Mono nunca se cargó, así que el código caía a Courier New.

## Addendum (2026-10-07, F10.8 PR1) — el stream de eventos también trae chats

- **El título automático llega por el mismo puente que las cards (F8.6).** `chat_changed` es un segundo canal de NOTIFY, con el mismo formato de payload (`<userId>:<chatId>`) y la misma conexión LISTEN y cola en serie de `CardListener`. El navegador recibe `event: chat` con el `ChatSummary` de esa fila, leída con el RLS del usuario y traducida por `toChatSummary`, la misma función que usa `GET /api/chats`. El listener lee con `ChatRepository` y no con `ChatService`, que arrastra la IA, los créditos y la voz de marca.
- **Quién notifica:** el título automático (`ChatRepository.setAutoTitle`) y el renombre (`renameChat`), en la misma transacción que la escritura. Así, otra pestaña o el celular ven el nombre nuevo sin recargar. Los demás cambios del chat (fijar, archivar, mover) no notifican todavía: el contrato del evento es el **título**. Como el evento trae la fila completa, la web la acomoda según `archivedAt` (si se archivó en otra pestaña, sale de Recientes). Los demás cambios se suman cuando otro canal (Telegram, F11) los necesite.
- **Al revalidar** (reconexión, `resync`, la pestaña vuelve a ser visible), la web pide de nuevo la lista de chats, además de las cards, si ya la tenía cargada.
- **Por qué el stream de eventos y no el stream del turno:** el título se genera después de que la respuesta terminó (necesita el primer intercambio completo), cuando el stream del turno ya se cerró. El de eventos sigue abierto y llega a todas las pestañas.

## Addendum (2026-10-08, F10.8 PR2) — compactación del historial

El backlog de "compactación real" (HIGH desde F4.5) se cierra así:

- **Qué ve el modelo** (`chat/history-window.ts`, puro): el resumen del tramo viejo (`chat_summaries`) como un intercambio sintético (creator → "Entendido…") y, después, los mensajes posteriores **completos**.
  - **Mensajes enteros, nunca partes:** la regla del reasoning item de arriba sigue intacta. Lo que se conserva viaja tal cual, y lo resumido se va entero.
  - **Los roles siguen alternando.** El prompt de sistema no cambia de un turno a otro, así que su caché sigue sirviendo.
  - **Las cards del tramo no las resume el LLM:** van como lista determinista (`cardSummariesIn`, de la dieta), con su id. Así "cámbiale el hook a esa" sigue encontrando su card.
- **Cuándo se compacta:** al cerrar un turno guardado cuyo contexto pasó de `CHAT_COMPACT_AT_TOKENS` (40k). El contexto es la entrada del **paso más grande**, no la suma: un turno con tools hace varias llamadas.
  - Se encola el job `chat.compact`, con `singletonKey = chatId`. El handler es idempotente: relee todo, y si el tramo pendiente es corto no hace nada.
  - Resume con el modelo utility todo menos lo más reciente (los últimos 10 mensajes; desde F10.8.1, ~12k tokens: ver el addendum siguiente). El corte nunca parte un turno: lo que queda empieza con un mensaje del creator.
- **Techo mecánico:** si aun así lo que viaja pasa de `CHAT_HISTORY_CAP_TOKENS` (120k estimados, ~4 caracteres por token), se mandan solo los mensajes más recientes que caben, con una nota. Esto pasa si el resumen falló o todavía no corre. No usa LLM: es el seguro del hueco de seguridad.
- **Verificado contra Luna con razonamiento** (umbral bajado a 2k en dev):
  - después de 7 turnos el job resumió los 4 primeros mensajes;
  - el turno siguiente respondió bien sobre datos que solo estaban en el tramo resumido (horario, promo, "sin emojis"), sin el 400 de reasoning items;
  - la UI siguió mostrando la conversación completa.
- **Ajustes del review del PR:**
  - **La lista de cards del resumen se refresca en cada turno** con su estado y contenido de hoy, y las borradas salen. Esas cards ya no están en ningún output de tool, así que `withLiveCards` no las alcanzaba.
  - **El techo se mide sobre lo que de verdad viaja,** después de la dieta, y del razonamiento solo cuenta el texto, no su contenido cifrado (varios KB por mensaje). Antes recortaba de más.
  - **Un tramo enorme se resume por partes** (`MAX_TRAMO_CHARS`, ~50k tokens por llamada). El primer resumen de un chat que ya era larguísimo no se manda entero.
  - **Mínimo de 8 mensajes para resumir,** y no se encola si el resumen no tiene al menos 18 mensajes pendientes (reemplazado en F10.8.1 por un mínimo en tokens: ver el addendum siguiente). Si lo reciente pesa solo, resumir de a poco no achica el contexto y cobraría cada par de turnos.
  - **`env.ts` exige `CHAT_COMPACT_AT_TOKENS` < `CHAT_HISTORY_CAP_TOKENS`:** al revés, la compactación no se dispararía nunca.
- **Fuera de alcance:** se sigue reenviando el reasoning de los mensajes recientes. Es lo que exige OpenAI, y queda acotado a lo reciente que se conserva.

**Addendum (F10.8.1 PR4, 2026-10-09) — ContextBuilder y lo reciente por tokens.**

- **Un solo lugar arma lo que ve el modelo:** `chat/context-builder.ts` (`assembleContext`, puro). `runAgentTurn` solo carga los datos y lo llama. El orden no cambia: resumen → cards vivas → dieta (cards viejas y recuerdos de memoria cortos) → techo.
- **Las cards vivas se leen de una vez** (`cardIdsForContext`: las de la lista del resumen y las de la ventana). Antes eran dos lecturas seguidas por turno.
- **Lo reciente se conserva por tokens, no por mensajes:** `KEEP_RECENT_TOKENS` = 12k estimados, con piso de 2 intercambios (`MIN_KEEP_MESSAGES` = 4). Diez mensajes podían ser 1k tokens ("ok, va") o 15k (tres carruseles); lo que importa es cuánto viaja. Mismo rango que las referencias (OpenCode conserva 40k; Codex, los mensajes recientes del usuario hasta un presupuesto).
- **El mínimo para resumir también va en tokens:** el tramo tiene que pesar ≥6k (`MIN_TRAMO_TOKENS`) y tener al menos 2 intercambios. Reemplaza a "8 mensajes / 18 pendientes". El encolado y el job aplican **la misma regla** (`compactableCut`): si no coincidieran, un chat cuyo tramo reciente pesa solo encolaría en cada turno un job que no hace nada.
- **Se mide sobre lo guardado**, con los outputs de tools completos, no sobre lo que viaja tras la dieta: es una cota alta (conserva un poco menos y compacta un poco antes), del lado seguro.
- **Resúmenes por bloques (F10.8.1 PR5).** Cada compactación agrega un bloque con solo lo nuevo de su tramo; los bloques anteriores viajan en el prompt de solo lectura, con la instrucción de no repetirlos y de decir explícito lo que cambió ("Cambió: ahora abre a las 8"). Así no se resumen resúmenes, que en cada pasada perdían detalle (referencias: _observational memory_ de Mastra, que agrega observaciones y solo reflexiona al llegar a un tope; CliffCompaction, que nunca recompacta lo ya compactado). Al modelo le llegan como "Parte 1 (hasta el 7 de octubre)…", en orden, y la lista de cards va **después** de los bloques: un bloque nuevo no cambia el texto de los anteriores, y su prefijo sigue en la caché del proveedor. Cuando hay dos bloques o más y pasan de `CONSOLIDATE_AT_TOKENS` (~6k), el mismo job los funde en uno (gana el dato más reciente); es la única vez que ese prefijo cambia entero. Se cobra junto con el resumen, en un solo asiento, aunque la consolidación no devuelva texto. Si falla, se guardan los bloques sin consolidar y se reintenta en la siguiente compactación. **Migración expand/contract:** `0050` agrega `blocks` y deja `summary` opcional, para que la app vieja no truene entre la migración y el reinicio del contenedor; la columna se borra en un release posterior. Mientras tanto la app nueva escribía en `summary` el texto de su último bloque (la vieja lo leía), y `blocksOf` tomaba como bloque más un `summary` que la vieja hubiera escrito moviendo el corte sin tocar `blocks`. F10.8.4 quitó las dos cosas. Antes, `0053` pasa a `blocks` los resúmenes que solo vivían en `summary` (los que el respaldo de lectura recuperaba), y el schema de Drizzle deja de declarar la columna: Drizzle la nombra en cada select e insert, así que con ella declarada este build tronaría cuando el `DROP COLUMN` corra antes del reinicio. El `DROP` va en el release siguiente, nunca en el mismo: `0054`, después de que Jose desplegara el que dejó de usarla. Un resumen sin ningún bloque válido se ignora: viaja el historial completo y el techo lo acota, en vez de un resumen vacío.
- **El umbral de 40k se queda.** Con caché (Luna cobra el input cacheado al 10% del normal, y nuestra tarifa a 2 de 8 unidades), el costo de un chat largo sube con el contexto promedio: con 40k el diente de sierra va de ~12k a 40k; con 700k, un mensaje cerca del tope costaría 6–19% de la cuota mensual. Además, la calidad cae con contextos largos (Chroma, _context rot_). Mastra comprime a los 30k.

**Addendum (F10.8.1, 2026-10-10) — el request lleva un solo mensaje.** La web mandaba el historial completo en cada request al stream (el `DefaultChatTransport` por default), aunque el servidor solo lee el último mensaje (`parseLastUserMessage`) y el `trigger`, y reconstruye el resto desde la base. Cada request crecía con el chat, y uno largo (cards, razonamiento cifrado) pasaba el límite de 100 kB de `express.json()` con un **413 PayloadTooLargeError**: se encontró probando la compactación con un chat sembrado. Ahora `prepareSendMessagesRequest` (`apps/web/src/lib/chat-transport.ts`, con spec) manda solo `{ trigger, messages: [último] }`, y conserva el `body` extra de `sendMessage`. Precondición compartida con el servidor: el último mensaje es el del creator (turno nuevo, o regenerar, donde el SDK ya quitó la respuesta vieja). Turnos automáticos del cliente (`sendAutomaticallyWhen`, resultados de tools del cliente) romperían esa precondición y obligan a revisar las dos puntas.

**Addendum (F10.8.2 PR1, 2026-10-11) — un mensaje se llama igual en la web y en la base, y tiene tope.**

- **El id lo pone quien primero lo conoce.** El del creator lo genera la web (uuid, `generateId` de `useChat`, con respaldo para contextos sin `crypto.randomUUID`) y el servidor lo guarda tal cual. La respuesta se guarda con el id que el SDK genera en el servidor (`generateMessageId: randomUUID`) y que viaja en el primer chunk del stream. Antes la base ponía uno nuevo a los dos, y "Regenerar" sin recargar mandaba un id que no existía: **404 "Ese mensaje no se puede reintentar."**
  - Un id que no es uuid se guarda con uno de la base, como antes (`storableMessageId`): una pestaña abierta con el bundle anterior al deploy sigue pudiendo escribir. Se puede quitar un release después.
  - Un reenvío del mismo id responde **409** "Ese mensaje ya se envió." (choque con `messages_pkey`), no un 500. El id lo elige el cliente, pero es un uuid v4: no se adivina el de otra cuenta, y RLS sigue aislando las lecturas.
- **Tope de un mensaje: 50,000 caracteres de texto** (`MAX_MESSAGE_CHARS`, en shared). El composer muestra un contador desde el 90% y no deja enviar si se pasa; el servidor responde **413** en español. Solo se aceptan partes de texto: el chat no adjunta nada todavía, y otra parte esquivaría el tope. `express.json` sube a **1 MB**, holgado sobre el tope (el texto en UTF-8 puede pesar hasta 4 bytes por carácter).
- La web muestra el mensaje de los rechazos que escribimos nosotros (400, 404, 409, 413) y, como no se guardó nada, no ofrece "Reintentar" en esos casos. Los demás (401, 500) traen el texto de Nest en inglés y caen al aviso genérico.

**Addendum (F10.8.2 PR2, 2026-10-11) — una respuesta cortada o fallida se guarda, con su estado.**

- **Antes:** un turno cortado (Detener, cerrar la pestaña, la red) llegaba a `onEnd` con `isAborted=false`, `totalUsage` rechazaba y no se guardaba nada. Al recargar, el mensaje del creator quedaba solo, el texto parcial se perdía y las cards que el turno alcanzó a crear se quedaban sin `message_id`.
- **Ahora:** `messages.status` (`complete` | `stopped` | `failed`, migración `0051`, solo expand) y la respuesta se guarda en los tres casos:
  - **Cortada** (el `AbortSignal` se disparó): `stopped`, con lo que alcanzó a escribirse. Sin cobro, como antes (ADR-012). El servidor no distingue "Detener" de cerrar la pestaña: los dos son `res.on("close")`.
  - **Falló sin usage legible:** `failed`, sin cobro.
  - **Falló a media respuesta con usage** (`finishReason: "error"`): `failed`, y se cobra lo parcial, como antes.
  - En los tres, en la misma transacción, las cards del turno se ligan a su mensaje (`linkCardsToMessage`): ya no quedan huérfanas, y "Reintentar" las borra junto con la respuesta, como cualquier regenerar. No se titula, no se indexa en memoria ni se compacta a partir de una respuesta incompleta.
- **Lo que se guarda pasa por `sanitizeInterruptedParts`** (`chat/interrupted-turn.ts`), porque vuelve a viajar al modelo:
  - fuera las tools que no terminaron (serían un tool-call sin resultado) y el razonamiento cortado;
  - fuera la metadata del proveedor: con `store`, OpenAI manda texto y tools como `item_reference` a su `itemId`, y el item de una respuesta cancelada puede no existir de su lado (400 en el turno siguiente).
- **Lo que ve el modelo** (`chat/unanswered-turns.ts`, paso del ContextBuilder después del resumen): los turnos sin respuesta completa **viajan marcados, no se quitan** (decisión de producto: si el siguiente mensaje es "para Instagram", el pedido viejo es su contexto). Una respuesta cortada o fallida lleva una nota al final ("se detuvo aquí… no la continúes a menos que te lo pida"); entre dos mensajes seguidos del creator (turnos de antes de F10.8.2, o uno que cayó con el servidor) va una respuesta sintética (`presencia-sin-respuesta-…`), así los roles siguen alternando.
- **La web recibe el estado en `metadata.status`** de `GET /chats/:id/messages` (`ChatMessageMetadata`, en shared). Solo viene si no es `complete`.
- **Detener y reintentar de inmediato.** La respuesta cortada se guarda en `onEnd`, que corre desde el `cancel` del stream: **después** de que se cumple la promesa del pipe y de que el cliente cerró la conexión. Un "Reintentar" inmediato podía leer el historial antes. `ChatService.turnsInFlight` registra cada turno desde que entra (`streamChat`/`regenerateChat`, no desde el pipe: un corte mientras se arma el turno también cuenta) hasta el final de `onEnd`. Un turno nuevo o un regenerar espera a que el anterior termine de guardarse, con tope de 10 s, **solo si su conexión ya cerró**: uno que sigue respondiendo en otra pestaña no lo frena. Es en memoria porque el chat corre en una sola instancia (`app`, ADR-020); con varias tendría que ir a la base. Si el creator corta mientras se guarda su mensaje (el `close` ya pasó), el turno se aborta de entrada en vez de correr completo para nadie.
- **Una tool que termina después del corte.** La que corría al cortar puede crear su card después de que se guardó la respuesta (en lo guardado, su tool quedó a medias y se sanea). El creator nunca la vio: al vencer la gracia de la traza (3 s) se borra (`deleteUnlinkedDrafts`, solo borradores sin mensaje) en vez de quedar huérfana.
- **Un corte antes de que el request llegue al servidor** no deja nada guardado: el mensaje solo existe en la web. Lo atiende la card de estado (PR3), que reenvía el mensaje en vez de regenerarlo.

**Addendum (F10.8.2 PR3, 2026-10-11) — la card de estado del turno, y reintentar sin respuesta guardada.**

- **Reenviar el último turno.** Un `submit-message` cuyo id ya existe como el último mensaje del creator es ese turno de nuevo, no un mensaje más (`lastTurnOf`, compartido con `regenerateChat`): se borra su respuesta con sus cards (mismas guardas que regenerar), se reemplaza el mensaje y corre el turno. Un id viejo de en medio sigue siendo **409**. Lo usa "Reintentar" cuando en pantalla no hay respuesta (un corte antes de que el request llegara no dejó nada guardado; si llegó, quedó el mensaje sin respuesta): la web reenvía con el mismo id (`sendMessage({ text, messageId })`) y el servidor resuelve los dos casos igual. Es también el camino de "Editar" (PR4).
- **El corte se escucha desde que el turno entra.** El `close` de un corte mientras se revisaba la cuota no se repite. El pipe del SDK sí lo detecta (`response.destroyed`) y suelta el stream, pero el modelo seguía generando para nadie: se guardaba una respuesta vacía como `complete`, **y se cobraba**. Se reprodujo directo contra la API, sin el proxy de Vite. Ahora:
  - `trackTurn` crea el `AbortController` y revisa `res.destroyed` al registrarse;
  - si el corte llegó antes de llamar al modelo, ni se llama: se guarda la respuesta vacía como `stopped`;
  - `onEnd` trata una conexión destruida como corte y aborta el modelo.
- **La web sabe cómo terminó el turno con `onFinish` de `useChat`.** Se cortó solo si `isAbort` y **no** llegó el `finish`: Detener justo cuando terminaba no es un corte, y el servidor la guardó completa. `isError` es un fallo. Ese estado local vale para la sesión, porque la respuesta en pantalla de un turno en vivo no trae `metadata`; al recargar manda `metadata.status`. Un mensaje del creator sin respuesta guardada se ve como "sin respuesta" (`lib/turn-status.ts`, puro, con spec).
- **Ajustes del review del PR3:**
  - Un reenvío del mismo id mientras su turno sigue respondiendo (doble clic, reintento de la red) es **409**, no un segundo turno en paralelo.
  - Un corte antes de empezar no toca nada: ni se inserta el mensaje ni se borra la respuesta de un regenerar que nadie va a recibir.
  - `closed()` cuenta también `writableFinished`: el `close` llega un tick después del `finish`.
  - **Con `finishReason`, la respuesta está completa** aunque la conexión se cerrara antes del final del pipe: se guarda `complete` y se cobra. Pasa cuando el modelo va más rápido que la entrega y Detener llega tarde. En vivo la web ve el corte; al recargar se ve completa, que es lo que de verdad se generó y se cobró.
  - En la web, un stream que termina sin `finish` (el servidor se reinició a media respuesta) cuenta como fallido, y un reintento que sale bien reinicia el "Sigue sin funcionar".

**Addendum (F10.8.2 PR4, 2026-10-11) — editar el último mensaje.** Es solo de la web: el servidor ya trata un `submit-message` con el id del último mensaje del creator como ese turno de nuevo (PR3). Editar es `sendMessage({ text, messageId })`: el SDK reemplaza el mensaje en pantalla y corta lo que venía después, y el servidor borra la respuesta vieja con sus cards y guarda el texto nuevo con el mismo id. Regenerar y editar comparten las guardas de cards (`confirmReplace` en `routes/chat.tsx`). Un mensaje de en medio no se edita.

**Addendum (F10.8.2, review de cierre, 2026-10-11).**

- **Solo se ligan las cards que la respuesta cortada muestra.** Una card cuya tool quedó a medias (el saneado la quita) ya existe pero no se ve en el chat: se borra al vencer la gracia, junto con las que terminen de crearse después. Queda un residuo conocido: una card que termina de guardarse después de los 3 s de gracia queda huérfana (resuelto en F10.9 PR1, abajo).
- **Regenerar mientras la respuesta todavía se genera** (otra pestaña) responde **409**, igual que un reenvío.
- **La compactación ve los turnos marcados** (`markUnansweredTurns` en el transcript): sin la marca, el resumen daba por contestado un pedido que se cortó.
- **Perder la red es un corte**, no un fallo: el servidor solo ve que se cerró la conexión y lo guarda como detenida, y la web lo marca igual (`isDisconnect`).
- El timer de la espera entre turnos se limpia. Sin cuota, la burbuja no ofrece Editar.
- **Diferido:** al editar el primer mensaje, el título automático no se rehace (`maybeTitle` solo titula chats con su título de nacimiento).

**Addendum (F10.9 PR1, 2026-10-17) — los pendientes de F10.8.2.**

- **La card tardía ya no queda huérfana.** La tool de cards no escribe si el turno ya se cortó (`abortSignal`), y las cards del turno viven en un colector (`chat/turn-cards.ts`), no en un arreglo suelto, para la que ya iba en camino. Al vencer la gracia, el turno cortado borra las que el creator no vio y **cierra** el colector: desde ahí, una tool que termine tarde entrega su card y se borra en cuanto llega. No es un cron: un borrador sin mensaje también existe legítimamente (el turno en curso, antes de `persistReply`; un chat borrado, `schema.ts`), y un barrido no sabría distinguirlos.
- **Editar el primer mensaje rehace el título automático.** Todo turno de `streamChat` que rehace el mensaje 0 (editado o reintentado) pide `maybeTitle(..., retitle)`, que también reemplaza un título `auto`. No se comparan textos: una edición que se cortó ya guardó el texto nuevo, y su reintento llega igual. Un título que no cambia cuesta una llamada utility de más. Uno escrito por el creator (`user`) sigue sin tocarse. Reemplazar uno `auto` se cobra contra el turno (`run`), porque el dedup del ledger ya tiene ocupada la referencia del chat con el primero; uno que seguía de nacimiento se cobra contra el chat, como siempre.
- **Un regenerar o editar rechazado ya no deja la pantalla mintiendo.** El SDK quita la respuesta (o corta lo de después) antes de mandar. Si la API rechaza antes de responder (402, 409, 413), la web vuelve a leer `GET /chats/:id/messages` y repone lo guardado (`setMessages`). El motivo sale en un toast, salvo sin cuota, donde ya lo dicen el modal y el aviso. Un error que no es un rechazo con motivo (la red, un 500) no se resincroniza: no se sabe qué guardó el servidor, y la card de estado ofrece reintentar.
- **"Continuar"** en una respuesta detenida a medias es la web mandando "Continúa", visible (como en Claude). No hay trigger nuevo: el modelo ya ve la respuesta detenida marcada (F10.8.2 PR2) y retoma desde ahí.

**Addendum (F10.9 PR3, 2026-10-18) — adjuntos en el mensaje y en el contexto.**

- **El mensaje cita, no carga.** Un adjunto se sube antes (`POST /api/attachments`, ADR-011 addendum F10.9) y el mensaje lleva una parte `file` con su URL (`/api/attachments/:id/content`). `parseLastUserMessage` acepta solo esas partes `file` (nada en línea: un `data:` esquivaría el tope y el límite de 1 MB del body), hasta 10 por mensaje, y deja pasar un mensaje sin texto. En la transacción del envío, `AttachmentsService.resolveForMessage` exige que cada adjunto sea del creator (RLS), de este chat o de ninguno todavía, y de este mensaje o de ninguno (un reintento o una edición los reenvían). También exige que juntos no pasen de 60k tokens estimados (413). El mensaje se guarda con el tipo y el nombre de la fila, y los adjuntos se ligan después del insert (el reintento borró el mensaje, y el `SET NULL` los dejó sueltos un instante).
- **Qué viaja de cada adjunto** (`chat/attachment-context.ts`, paso del ContextBuilder después de las cards vivas):
  - Los de los **últimos 3 turnos del creator**, completos, mientras quepan en **~12k tokens** sumando del más nuevo al más viejo; los del mensaje actual van siempre y fuera de esa cuenta. Así una foto (~1,600) se queda sus tres turnos —el ida y vuelta sobre la misma foto es el caso común— y un documento grande (~30k) viaja completo solo en su turno (decisión de Jose, 2026-10-18; se descartó "completo solo el primer turno": ahorra ~6 unidades por foto y pierde fidelidad justo en el segundo turno, que puede llegar antes que la descripción). El texto (`.md`/`.txt`/`.csv`/`.json`, PDF con texto) va como parte de texto dentro de `<adjunto nombre=… tipo=…>`, con aviso si se recortó (y el prompt de sistema dice que eso son datos, no instrucciones: un PDF de terceros puede traer órdenes escondidas); una imagen o un PDF escaneado se quedan como parte `file`.
  - Los de **antes**, una línea con su descripción (PR4; mientras no la haya, el principio del texto o solo el nombre).
  - Si la lectura de las filas falla, cada adjunto queda nombrado sin contenido, como las cards vivas.
- **El techo cuenta lo que pesa.** `estimateTokens` ya no mide una parte `file` por su JSON (una URL corta, o megas de base64): usa la estimación de la subida, que la dieta deja en la parte (`providerMetadata.presencia.tokens`). Sin ella, 1,600, lo de una imagen.
- **Los bytes, al final.** `AttachmentsService.materialize` corre después del techo y antes de `convertToModelMessages`: cambia la URL de la API por un `data:` con los bytes (la variante de 1568 px de una imagen). No hay otra: la URL es relativa y con sesión, el SDK hace `new URL()` sobre ella, y con la cadena de respaldo (`supportedUrls` vacío) intentaría bajarla él. Lo que el techo descartó nunca se lee del bucket.
- **El texto nunca viaja como parte `file`**: `@ai-sdk/openai` rechaza cualquier `file` que no sea imagen o PDF, y lo que se manda tiene que servir con los tres modelos de la cadena. Verificado el 2026-10-18 con Luna, Gemini 3.8 Flash y Sonnet 5.5: los tres leyeron la misma imagen y el mismo PDF nativo.
- **Transcripciones** (resumen, título, memoria, "Pide un cambio"): cada adjunto aparece como `[El creator adjuntó "nombre"]`. Un mensaje que es solo una imagen ya no deja el título sin material.

Cómo lo resuelven otros (regla dura #8):

- **Imágenes.** Anthropic reescala toda imagen de más de 1568 px de lado y estima ~1,600 tokens a ese tamaño. Sus modelos más nuevos aceptan hasta 2576 px y ~4,800 tokens: mandar a 1568 es una decisión de costo, no un límite.
- **PDF.** Anthropic cobra texto + imagen por página (1,500–3,000 tokens).
- **La ventana de recientes con sustitutos** es la versión barata del patrón _multi-vector retriever_ de LangChain: describir una vez la imagen o la tabla y usar la descripción en su lugar. Nosotros la usamos como sustituto en el contexto, sin búsqueda; ChatGPT y Claude.ai, en cambio, recuperan los archivos de una conversación larga por búsqueda.

- **Para F10.10** (anotado): en lugar de una ventana, la descripción siempre más una herramienta para volver a ver el adjunto cuando haga falta (como Claude Code relee archivos). Necesita medir cuántas veces los modelos la llaman cuando deben, y cómo cada proveedor de la cadena acepta una imagen como resultado de herramienta.

Fuentes: [Claude: vision](https://platform.claude.com/docs/en/build-with-claude/vision); [Claude PDF: tokens por página](https://fast.io/resources/claude-pdf-limit/) (secundaria, cita los docs); [LangChain multi-modal RAG (multi-vector retriever)](https://codelabs.developers.google.com/multimodal-rag-gemini).
