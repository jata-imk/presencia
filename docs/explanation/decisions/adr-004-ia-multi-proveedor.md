# ADR-004 · IA: multi-proveedor desde día 1 vía capa de orquestación

**Decisión:** Vercel AI SDK como capa provider-agnostic. Proveedores iniciales: Gemini, OpenAI, MiniMax (API compatible OpenAI). El proveedor es detalle intercambiable detrás de interfaz propia.

**Razón:** Cambiar de modelo = cambiar una línea. Protege contra rate limits, precios y calidad variable.

**Regla no negociable:** suite de regresión con ~10 prompts en registro mexicano "de barrio" contra cada modelo — el moat cultural se valida por proveedor, no se asume. Ojo: cada modelo tiene manías distintas con tool calling (Gemini estricto con schemas, MiniMax más flojo).

**Descartado:** LangChain/LangGraph — abstracción con impuestos innecesarios para un agentic loop + tools.

**Implementación (F3, 2026-07-19):** registry interno (`apps/api/src/ai/provider-registry.ts`) con ids `proveedor:modelo`. Proveedores: `google`, `openai`, `anthropic`, `deepseek` (providers oficiales del AI SDK) y `minimax`/`kimi` (vía `@ai-sdk/openai-compatible`). La tabla descriptora `PROVIDERS` es la fuente única de verdad del inventario: registro, validación de env (formato de `AI_MODEL` y presencia de API key) y suite cultural derivan de ella. Agregar un proveedor = una fila en la tabla + su key en el schema de env — pero cada modelo que compita por ser default debe pasar la suite cultural primero. Todas las keys son opcionales; solo la del proveedor de `AI_MODEL` es obligatoria (fail-fast al boot). `resolveModel(modelId?)` cae al default de la env var `AI_MODEL` — cambiar de proveedor es editar la variable y reiniciar el proceso, palanca del **operador**, no del usuario. Solo la key del proveedor default es obligatoria (fail-fast al boot en `env.ts`); proveedores sin key no se registran. El resto de la app pide modelos vía `AiService` y nunca importa un proveedor concreto.

**Puerta abierta (decidido 2026-07-19, NO construido):** el usuario final no elige modelo en V1. Si algún día se quiere selector por chat, el cambio es acotado: columna `chats.model_id` nullable + pasar ese id a `resolveModel` — esta capa no cambia. No se construye UI, columna ni catálogo hasta tener evidencia de necesidad (YAGNI).

**Suite cultural:** `pnpm --filter @presencia/api suite:cultural` (script en `apps/api/scripts/cultural-suite/`) corre los ~10 prompts contra cada modelo con el system prompt de producción y una tool mock, y genera reporte lado a lado en `docs/reference/suite-cultural/` para juicio humano (sin LLM juez — el criterio cultural es del founder).

**Addendum (F4, 2026-08-02) — el system prompt ahora se ensambla por usuario.** Hasta F3, `SYSTEM_PROMPT` era una constante idéntica para todos los tenants. F4 la reemplaza por `buildSystemPrompt(voice?: BrandVoiceForPrompt | null)` (`apps/api/src/chat/system-prompt.ts`), que agrega al prompt base un bloque `<voz_de_marca>` con los campos de `brand_voices` del usuario (mercado, nicho, registro/formalidad, modismos permitidos/prohibidos, anglicismos, temas clave, CTAs, hasta 2 ejemplos de referencia) — o cae al prompt base sin voz configurada (onboarding a medias, cuentas viejas). Sigue sin importar Nest ni DB: `BrandVoiceForPrompt` es un shape plano de `@presencia/shared`, no la fila de Drizzle, así que la suite cultural sigue probando exactamente el mismo código que producción.

La suite cultural se extiende con dos verificaciones nuevas, ambas DoD de F4 (`docs/explanation/product/presencia-configuracion-voz-de-marca.md`):

- `AI_SUITE_VOICES="id1,id2"` sobre `suite:cultural` (fixtures en `apps/api/scripts/cultural-suite/voices.ts`): corre cada prompt contra cada voz y las pone lado a lado por modelo — verifica que dos voces opuestas (de barrio vs. corporativa) suenen notoriamente distinto. Veredicto humano, sin LLM juez, mismo criterio que el resto de la suite.
- `pnpm --filter @presencia/api suite:voz-prohibida` (script nuevo, `apps/api/scripts/cultural-suite/prohibited-word.ts`): genera 20 veces el mismo prompt con una voz que prohíbe un término tentador para el modelo, cuenta ocurrencias normalizadas y reporta PASA/FALLA.

Ninguna entra a CI (el workflow no corre `pnpm test`; 20+ llamadas pagadas por push sería peor) — son comandos manuales con reporte versionado, igual que la suite original.

**Addendum (F4.5, 2026-08-09) — instrumentación de usage.** Cada llamada a `streamText` queda registrada: `AiService.resolve(modelId?)` (`apps/api/src/ai/ai.service.ts`) devuelve el modelo junto con su identidad ya parseada (`{ model, id, provider, modelName }`) — una sola llamada, así la telemetría nunca puede reportar un proveedor/modelo distinto del que de verdad ejecutó el turno. `runAgentTurn` (`chat.service.ts`) captura `totalUsage` y `steps` en su propio `try/catch` dentro de `onEnd` — un fallo al registrar usage nunca tumba el mensaje del usuario — y persiste una fila por turno en `ai_usage_events` (append-only, RLS + `REVOKE UPDATE, DELETE` al rol de la API; ver `docs/reference/modelo-de-datos.md`). Se guarda el crudo del proveedor (`provider_raw`: usage y `providerMetadata` por step, más `finishReason`), no una unidad derivada — la normalización a créditos facturables es trabajo de F5. Hueco conocido: un turno abortado no se mide (ver ADR-006 addendum F3 PR3 sobre tokens quemados en cancelación).

El enum `ai_task_kind` (`chat`, `chat_title`, `history_compaction`, `post_adapt`, `voice_distill`, `analytics_narration`) ya nace completo en `ai_usage_events` — es la parte cara de cambiar después — aunque hoy solo `chat` tiene call site real. El routing por tarea (`MODEL_BY_TASK`, env vars por tier) llega en el siguiente addendum.

**Addendum (F4.5, 2026-08-09) — routing por tarea, cierra el "Pendiente" de arriba.** `MODEL_BY_TASK` (`provider-registry.ts`, al lado de `PROVIDERS`) mapea cada `AiTaskKind` a un tier de env var: `AI_MODEL_CHAT` (creativo, el moat cultural — no se abarata), `AI_MODEL_UTILITY` (modelo chico: titular de chat, compactar historial, narrar analíticas) y `AI_MODEL_ADAPT` (creativo acotado/utility pesado: adaptar posts entre redes, destilar ejemplos a voz de marca). Cada var sin setear cae a `AI_MODEL`, con el mismo fail-fast de `env.ts` que ya existía para `AI_MODEL` (helper `validateModelEnv` extraído del `superRefine`, reusado 4 veces). `AiService.resolveForTask(task)` es el único punto de lectura: consulta `MODEL_BY_TASK[task]` y delega en `resolve()`. El call site sigue declarando su tarea explícitamente (`this.aiService.resolveForTask("chat")` en `chat.service.ts`) — nunca se infiere con un clasificador previo: eso sería meter un LLM para decidir qué LLM usar, pagado en latencia justo en el primer token. Hoy solo `chat` tiene call site real; las otras 5 tareas del enum quedan enrutadas (con fallback a `AI_MODEL`) sin consumidor — índice de cada una y dónde encaja en producto: tarea de Notion "Backlog · Consumidores pendientes de MODEL_BY_TASK".

**Addendum (F9.8, 2026-09-27) — un solo punto de registro, y tendencias adentro.** Registrar usage deja de ser algo que cada llamador arma a mano: `AiUsageService.registrar()` (`apps/api/src/ai/ai-usage.service.ts`) recibe el `ResolvedModel`, el `usage` del SDK y el crudo, arma la fila y **nunca lanza** — su propio `runWithTenant` y su propio `try/catch`, la misma garantía que antes repetía cada call site. Chat y narración se migraron a él. Olvidarlo seguía siendo posible (el helper no se invoca solo), pero ya no hay que reconstruir la fila para cumplir. Así se había escapado el caso que motivó el cambio: las dos llamadas de tendencias pasaron F9 y F9.6 sin dejar fila. Ahora son dos tareas del enum, `trends_search` y `trends_structure`, y `ai_usage_events` gana `search_queries` (el fee por consulta del grounding es la parte cara y no es un token; `null` = la llamada no busca). **`trends_search` no está en `MODEL_BY_TASK`**: el tipo `RoutedTaskKind` la excluye, así que `resolveForTask("trends_search")` no compila. Sigue anclada a `AI_MODEL_TRENDS` con su propio default porque pide una capacidad —grounding—, no un tier. `trends_structure` sí se enruta, a `AI_MODEL_UTILITY`, como antes pero ahora declarando su tarea. Del lado del cobro, `TokenBilledTaskKind` (`credits/rate-card.ts`) deja fuera a las dos: las tendencias se cobran con tarifa fija o las absorbe el negocio (ADR-024), y tener fila en la telemetría no las vuelve cobrables por token.

**Addendum (F9.7, 2026-09-27) — `voice_preview`.** El "Ver ejemplo de tu voz" de Configuración es una tarea propia, no `chat`: no vive en una conversación, y mezclarla con los turnos ensuciaría la métrica con la que se calibra el chat. Pero enruta al **tier del chat** (`AI_MODEL_CHAT`) y usa el mismo `buildSystemPrompt`, porque lo que el usuario prueba es si el chat va a sonar a él; un modelo más barato respondería otra pregunta. Registra su fila con `AiUsageService` y cobra por tokens (ADR-012).

**Decisión evaluada y descartada por ahora (2026-08-02), no para siempre:** dentro del turno de chat se usa un solo modelo, aunque el usuario esté en lluvia de ideas. La alternativa —convertir la tool en sub-agente: modelo barato conversa y junta el brief, la tool llama por dentro al modelo caro para escribir la card— es arquitectónicamente superior y probablemente el destino final, pero cambia el `inputSchema` de `CARD_ARCHETYPE_TOOLS` de contenido completo a brief, agrega un round-trip y complica el streaming de la card. No se paga esa complejidad sin datos de usage que la justifiquen — los datos ya existen desde el addendum de instrumentación de arriba, pero hace falta volumen real (no pruebas manuales) para que el número sea honesto. Gatillo concreto para reabrir y análisis completo: tarea de Notion "Backlog · Sub-agente para turnos de chat (modelo barato + caro)".

**Addendum (F10, 2026-09-27) — modelos de imagen.** El mismo inventario de proveedores resuelve también modelos de imagen: `createImageModelResolver` (`provider-registry.ts`) comparte con `createModelResolver` el armado del registry y el chequeo de key, y devuelve `registry.imageModel(id)`. Las tareas `image_generate` e `image_edit` entran al enum y, como `trends_search`, **no** están en `MODEL_BY_TASK`: `RoutedTaskKind` las excluye, porque un tier de texto no dibuja. Se anclan a `AI_MODEL_IMAGE` (default propio, `DEFAULT_IMAGE_MODEL_ID`, validado fail-fast en `env.ts`) y a `AI_MODEL_IMAGE_ALT` (opcional). `ai_usage_events` gana `images_count` (`null` = la llamada no dibuja), y `AiUsageService.registrar()` acepta el usage corto de un modelo de imagen. Qué generador y por qué: ADR-025.

**Addendum (F10.7 PR1, 2026-10-05) — el SDK de la API, a una sola generación del spec.** `ai` pasa de 7.0.31 a 7.0.127 y los proveedores a sus versiones sobre `@ai-sdk/provider@4.0.21`. Antes convivían dos: `@ai-sdk/openai@3` y `openai-compatible@2` seguían en el spec v3, y por eso la opción `reasoning` de `ai` se ignoraba para OpenAI sin avisar. F10.7 la necesita para el esfuerzo por modelo, y `@ai-sdk/xai` (imágenes, PR4) entra sobre la misma generación.

- **Versiones con al menos un día publicadas.** pnpm 11 trae `minimumReleaseAge` por defecto y, al instalar algo más nuevo, lo agrega solo a `minimumReleaseAgeExclude` — eso apaga la protección contra un paquete comprometido recién publicado. No se acepta la excepción: se elige la tanda anterior (7.0.127 en vez de 7.0.128, publicada ese mismo día).
- **La web NO sube** (`ai@7.0.31`, `@ai-sdk/react@4.0.34`). `@ai-sdk/react` 4.0.1xx agregó `chat.stop()` al desmontar `useChat`, y cambia dos cosas que funcionan hoy: el prompt inicial de un chat nuevo se aborta en dev (StrictMode desmonta en falso justo después del efecto que lo manda, y la guarda de un solo envío ya no lo repite), y en prod salir del chat a media respuesta abortaría el turno — el servidor no lo guarda ni lo cobra, y la respuesta desaparece. Antes el stream seguía en segundo plano y la respuesta estaba ahí al volver. Subirla pide pasarle a `useChat` un `Chat` propio por chat (fuera del componente), y eso es una tarea aparte. Verificado en el navegador que el cliente 7.0.31 lee bien el stream del servidor 7.0.127: chat con card, segundo turno con razonamiento de Responses en el historial, y "Pide un cambio".
- **`pipeUIMessageStreamToResponse` ahora devuelve una promesa.** No se espera (los headers ya salieron; un rechazo no tiene a quién responder) y su rechazo solo se registra.

**Addendum (F10.7 PR2, 2026-10-06) — esfuerzo de razonamiento por modelo, y el chat pasa a `gpt-6-luna@high`.**

- **Sintaxis.** Cualquier variable de modelo de texto acepta `@esfuerzo`: `AI_MODEL_CHAT=openai:gpt-6-luna@high`.
  - El vocabulario es el de la opción `reasoning` del AI SDK: `none | minimal | low | medium | high | xhigh`. No incluye `max`: el SDK no lo expone y no lo queremos, porque el creator paga la salida.
  - Sin `@`, corre el default del proveedor.
  - Se separa con `@` porque el primer `:` ya es del id, y OpenRouter usa `:` dentro del nombre (`:free`).
  - Lo decide el operador en el `.env`, por modelo y no por tier: en la cadena del PR3, cada respaldo lleva su propio esfuerzo.
- **Dónde vive.** `parseModelEntry()` (`provider-registry.ts`) separa y valida el esfuerzo. `withReasoning()` lo pega al modelo resuelto con un middleware que solo llena el hueco: si una llamada pide su propio `reasoning`, gana la llamada. Ningún call site cambió.
  - `env.ts` truena al boot con un nivel que no existe, y con `@` en las variables de imagen (un generador no razona).
- **Sin tabla propia de niveles por modelo.** Cada proveedor del SDK ya traduce el nivel (OpenAI `reasoningEffort`, Gemini `thinkingLevel`, Anthropic `effort`/presupuesto). Si el modelo no tiene ese nivel, usa el más cercano y avisa en el log: Gemini 3.8 no tiene `minimal` y pasa a `low`. Una tabla nuestra copiaría eso y envejecería sola.
  - Requisito: el PR1 subió los proveedores al spec v4. Antes, `@ai-sdk/openai@3` ignoraba la opción.
- **Suite cultural.**
  - Acepta la misma sintaxis en `AI_SUITE_MODELS`.
  - Corre con `streamText`, como el chat, y reporta el primer token visible, los tokens de razonamiento y el costo por turno.
  - Haiku 4.5 salió de los defaults: Anthropic puede retirarlo desde el 2026-10-15.
- **Veredicto (Jose, 2026-10-06, `docs/reference/suite-cultural/2026-10-06-reporte.md`).**
  - **El chat pasa de `gpt-5.6-terra` a `gpt-6-luna@high`.** No vosea, crea la card en 6/6, y la voz prohibida da 0/20. Sale a $0.0003 por turno contra $0.0077 de Terra. El primer token visible tarda 3.3 s de mediana y 6.7 s en el peor caso.
  - Suena algo más neutro que Terra, que mete más modismos.
  - `xhigh` no gana lo que cuesta en espera: el peor caso pasa los 8 s.
  - Respaldos del chat, en orden: `google:gemini-3.8-flash@medium` (el más lento, 6.6 s de mediana, aceptable en una caída) y `anthropic:claude-sonnet-5-5` (el más rápido y el más caro, solo si caen OpenAI y Google).
  - DeepSeek V4 Pro queda fuera: precio doble en la noche de México, datos en China, y un 400 por `reasoning_content` en un historial que hizo otro proveedor. Panorama completo: `docs/reference/modelos-2026-10.md`.
  - "Ese nivel no se abarata" sigue en pie: se cambió el modelo porque pasó la suite, no por precio.

**Addendum (F10.7 PR3, 2026-10-06) — la cadena de respaldo de texto.**

- **Configuración.** Cada variable de modelo de texto es una cadena: `AI_MODEL_CHAT=openai:gpt-6-luna@high,google:gemini-3.8-flash@medium,anthropic:claude-sonnet-5-5`.
  - El primero es el principal; los demás son los respaldos, en orden, cada uno con su esfuerzo.
  - `parseModelChain()` rechaza una cadena vacía o el mismo modelo dos veces: un modelo repetido se cae junto con el primero.
  - `env.ts` exige la key de **cada** eslabón, porque un respaldo sin key se descubriría el día que cae el principal.
  - `AI_MODEL_TRENDS` solo acepta modelos de Google, también en los respaldos: necesita grounding.
  - Las variables de imagen siguen siendo de un solo modelo hasta su propia cadena.
- **Dónde vive.** `createFallbackChain()` (`ai/fallback.ts`) es un `LanguageModelV4` más. `streamText`/`generateText` no saben que existe, y ningún call site cambió.
  - `AiService.resolve()` arma una cadena nueva por llamada. Su `ResolvedModel` reporta el modelo que **corrió**: `id`, `provider`, `modelName`, más `fallbackFrom` y `attempts`. Por eso no se reutiliza entre llamadas.
- **Cuándo cae** (`isFallbackError`): 5xx, 408, 409, 429, 402, cuota agotada (`insufficient_quota` en el cuerpo), red y nuestro timeout. Es el `isRetryable` del SDK, más el saldo.
  - **Nunca** con un 400 (bloqueo de contenido, request mal armado), un 401/403 (una key mal puesta se arregla, no se esconde) ni un aborto del usuario.
  - Antes de cambiar de modelo, un reintento en el mismo: un 503 suelto no merece cambiar de voz. Después de nuestro timeout no se reintenta: ya se esperó el plazo entero.
  - Si cae toda la cadena, `FallbackExhaustedError` no es reintentable: el SDK no la repite entera. Por eso los call sites no necesitan `maxRetries: 0`.
- **Solo antes de la primera salida.** El wrapper lee el stream hasta el primer texto, razonamiento o tool:
  - un error que llega antes (algunos proveedores responden 200 y mandan el 5xx adentro) cuenta como caída;
  - uno que llega después no, porque cambiar de modelo a la mitad pegaría dos voces en una respuesta.
  - OpenAI 4.x ya convierte su error temprano en un `APICallError`. La lectura es para que no dependa de cada proveedor.
- **Timeouts.** 60 s hasta la primera salida de un stream (el peor caso medido es ~15 s) y 120 s para una llamada sin stream (la más lenta medida es ~31 s, `post_adapt`).
- **Un turno, un modelo.** Un turno con tool calls son varios pasos, y cada uno vuelve a llamar al modelo. Una vez que un eslabón respondió, la llamada queda **fija** en él. Los pasos siguientes no vuelven a esperar al principal caído, y si el fijo se cae a mitad del turno, el error sube en vez de saltar al siguiente: el turno es de un solo modelo, en voz y en usage.
  - Se encontró en el navegador: sin esto, el segundo paso volvía a esperar al principal caído, y si había regresado, un turno mezclaba las dos voces. El caso inverso (el principal responde el primer paso y se cae en el segundo, y el turno seguía con el respaldo) lo encontró el `/code-review`.
- **Historial mixto.** Probado en el navegador con un chat cuyos turnos previos eran de Luna (Responses, con partes de razonamiento y tool calls):
  - **Gemini** lo acepta. El SDK detecta las tool calls sin `thoughtSignature` y pone el centinela que documenta Google, sin 400.
  - **Sonnet** también. Descarta las partes de razonamiento ajenas, con un aviso en el log.
  - Gemini, como respaldo, escribió un post de X por arriba de los 280 caracteres. El panel lo marca y ofrece recortar.
- **Registro.** La migración `0045` agrega `ai_usage_events.fallback_from` (el principal pedido; `null` si respondió él). `provider` y `model` son siempre el que corrió, y `provider_raw.attempts` guarda cada intento fallido con su status y su error.
- **Para probarlo en dev:** `AI_FALLBACK_SIMULATE=openai` (o `openai,google`) finge caídos esos proveedores con un 503, sin llamarlos. `env.ts` lo rechaza en producción.

**Addendum (F10.7, review de la fase, 2026-10-06) — lo que encontró el `/code-review` del rango completo.**

- **Un error dentro del stream sin `isRetryable`** (un objeto con `type: "server_error"` u `overloaded_error`) no contaba como caída. Ahora, si no trae `isRetryable`, se juzga por su status (408, 409, 429 o 5xx) o por su tipo (`STREAM_OUTAGE`).
- **`supportedUrls` con respaldos.** Con más de un eslabón, la cadena no deja pasar ninguna URL cruda: el SDK las descarga y manda los bytes. Si no, decidía lo que acepta el principal, y un respaldo que no acepta esa URL respondía 400 justo durante la caída.
- **El error de un respaldo conserva lo que pasó antes**, igual que en la cadena de imagen.
- **Deuda anotada:** la cadena de texto y la de imagen comparten reglas, errores y helpers (`ai/fallback.ts`), pero cada una tiene su propio loop. La de texto fija el modelo a mitad del turno y lee el stream; la de imagen tiene presupuesto total. Unirlos en un loop genérico se dejó para cuando haya un tercer consumidor (video). Mientras tanto, un cambio de regla va en `isFallbackError` y aplica a los dos.

**Addendum (F10.8 PR4, 2026-10-08) — embeddings para la memoria entre chats.**

- **Un solo modelo, sin cadena.** `AI_MODEL_EMBEDDING` acepta un único modelo, sin `@esfuerzo` (`env.ts` lo valida con `single: true`). Los vectores de dos modelos no se pueden comparar: un respaldo escribiría vectores que la búsqueda nunca encontraría, o al revés. Si el proveedor se cae, el intercambio no se indexa y `pnpm memoria:reindexar` lo recupera después; la búsqueda devuelve vacío y el chat sigue sin memoria (nunca tumba el turno).
- **El modelo: `google:gemini-embedding-001` a 1536 dimensiones** (`DEFAULT_EMBEDDING_MODEL_ID`, `EMBEDDING_DIMENSIONS`). Jose pidió "el que tenga más calidad y se mantenga mejor a futuro". Prueba difícil en español (16 temas del mismo puesto de marquesitas, 12 búsquedas indirectas), primer resultado correcto:

  | Modelo                          | Acierta 1º |
  | ------------------------------- | ---------- |
  | `google:gemini-embedding-001`   | 12/12      |
  | `openai:text-embedding-3-large` | 12/12      |
  | `google:gemini-embedding-2`     | 10/12      |
  | `openai:text-embedding-3-small` | 9/12       |

  Gemini empata con el large a menor precio ($0.15/M) y le gana a su sucesor en esta prueba. 1536 queda por debajo del límite de 2000 dimensiones del índice HNSW de pgvector. Con Google se manda `taskType` (`RETRIEVAL_DOCUMENT` al indexar, `RETRIEVAL_QUERY` al buscar): el mismo texto produce vectores distintos según el papel, y emparejarlos mejora la búsqueda.

- **Tokens estimados.** El SDK no reporta el usage de los embeddings de Google: `ai_usage_events` guarda ~4 caracteres por token y `provider_raw.estimado = true`. Alcanza para la telemetría (`pnpm gasto`); un creator muy activo gasta ~$0.07 al mes.
- **No se cobra.** Un intercambio son ~500 tokens: menos de una unidad del ledger. `memory_index` y `memory_search` están en `AI_TASK_KINDS` para el registro, pero fuera de `RoutedTaskKind` (no pasan por `resolveForTask`) y de la tarifa por tokens.
- **Umbral de similitud `MIN_SIMILARITY = 0.62`** (`chat/memory.ts`). La búsqueda siempre devuelve "los 5 más cercanos", aunque nada se parezca. Calibrado sobre los chats de dev: lo relacionado sacó 0.72–0.78; lo que no tenía nada que ver nunca pasó de 0.58. **Cambiar de modelo obliga a recalibrar** y a reindexar: cada fila guarda su `model`, la búsqueda filtra por el vigente y `memoria:reindexar -- --modelo-nuevo` borra los vectores del modelo anterior y arma la memoria de nuevo.
