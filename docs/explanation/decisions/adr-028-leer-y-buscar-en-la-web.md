# ADR-028 · Leer y buscar en la web con tools propias

**Decisión:** el Chat lee enlaces y busca en la web con **dos tools propias** sobre el AI SDK, `leer_enlace` y `buscar_en_web`, que funcionan igual con cualquier modelo de la cadena. No usa las tools nativas de los proveedores (`url_context` y `google_search` de Gemini, `web_fetch` y `web_search` de Anthropic, `web_search` de OpenAI).

- **Leer** es nuestro: el servidor descarga la página detrás de una guardia SSRF, extrae el texto legible y lo guarda.
- **Buscar** va detrás de una interfaz `SearchProvider`, como la publicación (ADR-009): un adapter con el servicio que ganó el bake-off, **Brave** (addendum de abajo), sin respaldo.

Se construye en F10.10 en siete PRs. Este ADR fija las decisiones; los detalles que cambien al implementarlas van como addenda aquí y en ADR-006 (contexto), ADR-011 (tabla) y ADR-012 (cobro).

## Razón

**Las nativas no sobreviven al respaldo.** El chat corre una cadena (Luna → Gemini 3.8 → Sonnet 5.5, ADR-004), y `fallback.ts` fija el modelo en el primer output. Una tool nativa existe solo para su proveedor:

- si responde el respaldo, la tool desaparece a media conversación;
- cada una tiene su propia forma: fuentes, estados y costo distintos;
- en Gemini, la búsqueda no siempre se combina con function tools, y el chat depende de las tools de cards.

Una tool propia es la misma en los tres modelos, y la suite cultural la prueba igual en los tres.

**Las nativas tampoco son baratas.** En la prueba de humo del bake-off (2026-10-25, una consulta), la búsqueda nativa de Anthropic costó $0.116, porque los resultados entran como tokens de entrada. La de Gemini costó $0.031 y la de OpenAI $0.011. Una API de búsqueda cuesta de $0.001 a $0.008 por consulta (fuentes secundarias, se confirma en el bake-off). Las nativas se quedan en el bake-off como referencia de calidad, para saber cuánto se deja en la mesa.

**Cómo lo resolvieron ellos (regla dura #8).** Ningún modelo "lee links" por sí solo: siempre es una herramienta que descarga, convierte a texto y mete el texto al contexto como tokens de entrada. Verificado el 2026-09-24 en la página de Notion "Backlog · El Chat lee enlaces":

| Quién                  | Herramienta                                                                                                             | Lo que tomamos                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Google                 | `url_context`: hasta 20 URLs por request, solo páginas públicas, `url_retrieval_status` por URL (`…_ERROR`, `…_UNSAFE`) | Un **estado por lectura** que el modelo y la UI entienden, en vez de un error genérico       |
| Anthropic              | `web_fetch`: `max_content_tokens`, `allowed_domains`/`blocked_domains`, `max_uses` por request                          | **Tope de tokens por página**, **tope de usos por turno** y una lista de dominios            |
| OpenAI                 | `web_search` con acciones `open_page` y `find_in_page`                                                                  | Buscar y leer son pasos distintos y encadenables: buscar da links y leer abre el que importa |
| Jina Reader, Firecrawl | Una URL entra y sale markdown limpio; algunos renderizan JavaScript                                                     | No por ahora (abajo), pero es la salida si muchas páginas salen vacías                       |

**Por qué el fetch es nuestro y no un servicio reader.** Cuesta $0 por página, el PDF ya lo resuelve `processPdf` de F10.9 (`attachment-content.ts`), y la mayoría de lo que pega un creator (notas, la página de un negocio, un blog) es HTML servido. Un reader resolvería las SPA a cambio de un proveedor más y su costo. Si la suite muestra muchas páginas vacías, se agrega como segundo camino; no antes (regla #6).

**Por qué la búsqueda sí es un servicio.** Indexar la web no es algo que construyamos. Lo que se elige es calidad en español de México y precio, y eso lo decide el bake-off, no la tabla de precios.

## Contrato

**Tools** (schemas Zod en `packages/shared`, ADR-005):

- `leer_enlace({ url })` devuelve una **referencia**: `{ readId, url, titulo, dominio, estado, truncado }`. El texto de la página lo recibe el modelo vía `toModelOutput`, dentro de `<pagina …>…</pagina>` y escapado igual que `<adjunto>`. Así el texto no viaja al navegador en el stream ni en cada carga del chat.
- `buscar_en_web({ consulta })` devuelve 5 resultados `{ titulo, url, dominio, fragmento, fecha? }` y un `searchId`. Los fragmentos son chicos y van en la parte del mensaje.

**Estados de una lectura:** `ok`, `requiere_sesion`, `no_encontrada`, `no_legible`, `bloqueada`, `tiempo`, `muy_grande`, `tipo_no_soportado` y `no_disponible` (un 5xx, un 429 o una conexión caída). Viven en `WEB_READ_STATUSES` (`packages/shared/src/web.ts`). Con cualquiera que no sea `ok`, el modelo dice que no pudo leerla y pide el texto. Nunca inventa el contenido.

**Topes** (constantes en código, se ajustan con la suite):

| Qué                                  | Tope                                    |
| ------------------------------------ | --------------------------------------- |
| Lecturas por turno                   | 3                                       |
| Búsquedas por turno                  | 2                                       |
| Texto de una página que ve el modelo | ~6k tokens, con la nota "leí el inicio" |
| Texto guardado de una página         | 60k caracteres                          |
| Descarga                             | 2 MB, 10 s, 5 redirects                 |

Al llegar al tope, la tool devuelve `estado: "limite"` y el modelo lo dice. No lanza un error.

**Seguridad (SSRF)** en `apps/api/src/web/safe-fetch.ts`:

- solo `http` y `https` en los puertos 80 y 443;
- se resuelve el DNS y se rechazan las IPs privadas, loopback, link-local (incluye `169.254.169.254`, los metadatos del VPS), CGNAT, multicast, IPv4 mapeada en IPv6 y las formas decimal u octal;
- la conexión va **a la IP ya validada**, no a un segundo lookup, contra DNS rebinding: el `lookup` de `https.request` devuelve esa IP, y el certificado TLS se sigue validando contra el nombre;
- los redirects se siguen a mano y se validan en cada salto, también los de `<meta http-equiv="refresh">` (hay sitios que redirigen así: poresto.net);
- sin cookies ni credenciales;
- se lee en stream con corte por bytes y una allowlist de content-type (HTML, XHTML, texto, PDF).

Instagram, TikTok, Facebook, Threads y X no muestran contenido sin sesión: devuelven `requiere_sesion` sin hacer la petición, también si se llega a ellas por un redirect (un `bit.ly` que lleva a un reel).

**Extracción** en `apps/api/src/web/extract.ts`:

- el HTML pasa por Readability (el modo lectura de Firefox) sobre linkedom, un DOM sin navegador;
- el charset sale del header o de un `<meta>`, porque hay sitios mexicanos que siguen en ISO-8859-1;
- si no queda cuerpo (una SPA) se usa la descripción `og:`, y si tampoco hay, `no_legible`;
- el PDF va por el mismo camino que un PDF adjunto (`processAttachment`).

**Inyección de prompt.** La página es texto de un tercero. Entra como dato delimitado, y el prompt de sistema dice que lo que viene dentro de `<pagina>` es dato y no instrucciones: la misma lección del prompt en capas de las tendencias (ADR-024).

**Guardado.** Las páginas leídas viven en su propia tabla, `web_reads`, como los adjuntos (`message_attachments`): texto, título y descripción, también de las que fallaron (sin texto, con su estado). Volver a leer la misma URL en el mismo chat no la descarga ni la cobra otra vez; desde otro chat del mismo creator, tampoco si tiene menos de 24 h. Eso hace de releer una página algo gratis; la herramienta para releer adjuntos (opción D) va en su propia fase. A diferencia de un adjunto, una lectura **no tiene `message_id`**: la referencia vive en la parte del mensaje (`readId`), y las filas mueren con su chat. El texto llega al modelo por `toModelOutput`, en el turno en que se lee y en los siguientes (`convertToModelMessages` recibe las tools).

**Contexto** (`chat/web-read-context.ts`). Las páginas usan la misma ventana que los adjuntos (los últimos 3 turnos del creator), con un **presupuesto propio** de 12k tokens: dentro van completas las que quepan, de la más nueva a la más vieja, contando cada una como máximo lo que ve el modelo (~6k). Fuera viaja una línea con su título, dominio y descripción (`content_digest`, igual que un adjunto, pedida solo cuando la página está por salir de la ventana; `web/web-read-digest.service.ts`) y la indicación de que releerla es gratis. En el resumen de la compactación y en la memoria entre chats la página es solo una línea con su dominio: el título también lo escribió un tercero. Un presupuesto compartido con los adjuntos obligaría a ordenar los dos tipos en una sola cuenta; queda propio hasta que la suite muestre que hace falta. La dieta **le pega el texto a la parte antes del techo** (`capHistory`): el techo cuenta su tamaño real, y las filas se cargan de una sola vez junto a las de los adjuntos. `toModelOutput` solo le da forma. El texto de una página **no** entra a la memoria entre chats (pgvector): la memoria es lo que se habló, y guardar páginas la ensucia y deja persistir una inyección.

**Cobro** (ADR-012):

- leer no tiene fee propio, porque el texto ya se cobra como tokens de entrada del turno;
- la descripción se cobra como `content_digest`;
- cada búsqueda lleva una tarifa fija, calibrada contra el precio del servicio elegido (75 unidades con Brave; addendum de abajo).

## Consecuencias

- **La seguridad de la descarga es nuestra.** Es código que hay que mantener y probar: cada caso SSRF lleva su test.
- **Las SPA salen vacías** con un fetch simple. Se reporta como `no_legible` y el modelo pide el texto, igual que con Instagram.
- **La búsqueda depende de un proveedor más**, con su key y su tier. Sin respaldo, igual que los embeddings: si se cae, la tool devuelve un error y el modelo contesta sin la web, diciéndolo.
- **Telegram (F11)** recibe links igual que fotos: usa las mismas tools, porque el canal es un adapter sobre el mismo chat (ADR-010).
- **Revisar cuando:**
  - una nativa baje de precio y gane la combinación con function tools en los tres proveedores;
  - la suite muestre muchas páginas vacías (agregar un reader);
  - o cambie el precio del servicio de búsqueda elegido (volver a correr `pnpm --filter @presencia/api bakeoff:busqueda`).

## Addendum (F10.10 PR5, 2026-10-27) — el buscador es Brave

**Cómo se eligió.** Dos galerías a ciegas, calificadas por Jose (`docs/reference/bakeoff-busqueda/2026-10-27-015404-*`), con 17 consultas: precios, horarios y noticias de Mérida, marketing en México y un post de nicho.

- **Resultados crudos** (lo que recibe el modelo): Brave y Exa empatan arriba de las APIs (4.35); en precios gana Brave (4.25). Serper (4.06) y Tavily (3.94) traen resultados viejos o de Facebook justo en precios, y Tavily no trajo nada en 2 consultas.
- **Respuesta final** (Luna escribiendo con los resultados de cada uno, lo que vería el creator): Brave 4.47, Exa y Serper 4.29, Tavily 4.00. En precios, Brave 4.75.
- **Las nativas**, como referencia: la de OpenAI sacó 4.81 porque abre las páginas por su cuenta y trae el precio del día. En Presencia lo mismo lo hace la cadena buscar → `leer_enlace`; en vivo, "¿cuánto cuesta hoy el Tren Maya?" buscó, abrió el portal oficial y la nota de tarifas de octubre de 2026 y contestó con las vigentes, citadas.

Brave además es el más rápido (0.7 s de mediana) y cuesta $5 por mil búsquedas. Exa queda como segunda opción: cambiar es escribir su adapter y una variable.

**Contrato.**

- `WEB_SEARCH_PROVIDER` = `brave` (exige `BRAVE_SEARCH_API_KEY`) o `fake` (default, un resultado de mentira que dice serlo, para dev y tests), como `PUBLISHING_PROVIDER`.
- Brave con `country=MX`, `search_lang=es` y los fragmentos extra: 5 resultados con título, URL, dominio, fragmento de hasta 600 caracteres y fecha si la trae. Sin etiquetas ni entidades.
- La tool `buscar_en_web` (`web/web-search.tool.ts`) guarda los resultados completos en la parte del mensaje: son chicos, y son las fuentes que pinta la UI. El modelo los recibe dentro de `<resultados>`, escapados. Tope de 2 búsquedas por turno; la misma consulta dos veces en un paso se busca una vez.
- **Cobro:** `flat.web_search` = 75 unidades por búsqueda (con la relación unidades/dólar de una imagen y del refresco de tendencias). Se cobra al recibir la respuesta del buscador, aunque traiga cero resultados o el turno se corte después: ya se pagó. Un buscador caído no cobra; la tool contesta `no_disponible` y el modelo lo dice. Cada búsqueda deja su fila en `ai_usage_events` (`task_kind = web_search`, `brave:web-search`, `search_queries = 1`), y `pnpm gasto` la valúa con `model-prices.ts`.
- **Contexto:** las búsquedas de turnos anteriores viajan con cada fragmento cortado a 200 caracteres (`trimWebSearchOutputsForModel`), como los recuerdos de la memoria. El resumen y la memoria entre chats las nombran con su consulta, que escribió el modelo y no un tercero.
- **"Buscar en la web" del menú ＋** manda `webSearch: true` en el body del stream (también al reintentar); `prepareStep` fuerza `toolChoice` a `buscar_en_web` solo en el paso 0. Lo demás del turno queda libre. Si la cadena del chat tiene un Anthropic con razonamiento (`@esfuerzo`), no se fuerza: Anthropic rechaza un tool_choice forzado con thinking y ese 400 tumbaría el turno, así que el paso 0 lleva una instrucción en el prompt de sistema (`web/force-search.ts`).
- **Pasos por turno:** `MAX_AGENT_STEPS` pasó de 5 a 7, el peor caso que permiten los topes (2 búsquedas + 3 lecturas + la card + el texto de cierre). Lo que acota el costo son los topes de cada tool, no ese número.
- **En producción no se acepta el buscador `fake`:** cobraría como reales unos resultados de mentira. `env.ts` lo rechaza al arrancar.
- **Prompt:** buscar cuando la respuesta depende de algo que cambia o es reciente, o cuando lo pide el usuario; no para un post de su propio negocio ni para ideas generales. Si el fragmento no trae el dato, abrir la página con `leer_enlace`. Citar cada dato que cambia con un enlace markdown (en el chat, no dentro de la publicación) y nunca inventar un precio, un horario o una fecha.

## Addendum (F10.10 PR6, 2026-10-28): lo que ve el creator

Diseño en Claude Design ("Chat Web.html"). La UI sale solo de los outputs de las tools que ya guarda el mensaje; no hay partes `source-url` ni un endpoint nuevo.

- **Una sola lista de pasos** (`lib/turn-steps.ts`, `Steps.tsx`): búsquedas, lecturas y borradores en el orden en que pasaron (decisión de Jose, 2026-10-28). Antes los borradores tenían su lista y la web iba aparte. El resumen al plegar cuenta cada tipo ("Busqué 1 vez, leí 2 páginas y creé 1 borrador"). Un solo paso de la web no tiene lista: el encabezado es el paso mismo, con su dominio o su consulta. El Detener tiene su propio encabezado; el tope también, salvo que haya salido un borrador. Lo que no se pudo leer lleva el motivo con un ícono neutro; el rojo queda para un borrador que falló.
- **Fuentes** (`lib/web-sources.ts`, `WebSources.tsx`): las páginas leídas (con marca si fue a medias) y los resultados de búsqueda que el texto cita con su URL. Si no se leyó ni se citó nada, entran todos los resultados, porque algo salió de ahí. Lo que no se pudo leer no es fuente. La fecha ISO de Brave se pinta como día ("12 jun 2026"); el modelo la sigue recibiendo completa.
- **El chip** (`Composer.tsx`): "Buscar en la web" del ＋ vive en el estado de la pantalla y viaja como `body.webSearch` solo con el siguiente envío, también desde la pantalla de nuevo chat (`initialWebSearch`). Regenerar desde la UI no lo reenvía: el flag no se guarda con el mensaje.
