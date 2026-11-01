# ADR-029 · Volver a ver un adjunto (`ver_adjunto`)

**Decisión:** cuando un adjunto ya no viaja completo, el chat lo puede volver a ver con una tool propia, `ver_adjunto`, que el modelo llama solo si la descripción no trae el detalle que le piden. "Ya no viaja completo" quiere decir que salió de la ventana de 3 turnos (ADR-006, addendum F10.9) o que quedó en el tramo resumido. Una imagen o un PDF escaneado vuelven **como archivo dentro del resultado de la tool**. Un texto (un PDF con texto, un CSV, un `.md`) vuelve dentro de `<adjunto>`, y el de un PDF se puede pedir por páginas.

Es la opción D que F10.9 dejó anotada y F10.10 difirió. Se construye en F10.11; las páginas leídas ya se releían gratis con `leer_enlace` (ADR-028).

## Razón

**La ventana con sustitutos tiene un hueco.** Desde F10.9, un adjunto viaja completo 3 turnos y después solo como su descripción (1 a 3 frases). Cuando el creator pregunta por algo que la descripción no trae (el código del cartel chico, el precio de la página 4, el color del logo), el modelo solo podía pedirle que lo volviera a adjuntar. La línea base de la suite (`docs/reference/suite-cultural/2026-10-31-reporte-releer-base.md`) lo midió: Luna, Gemini 3.8 Flash y Sonnet 5.5 no inventan, pero en los 7 casos que necesitaban el detalle los tres pidieron volver a subir el archivo. Es fricción, no alucinación. Lo que se cuidó al quitarla es no cambiarla por inventos.

**Por qué el archivo en el resultado de la tool y no una subllamada de visión.** Se midió antes de construir, con keys reales (`docs/reference/releer-adjuntos/2026-11-01-sonda.md`, `pnpm --filter @presencia/api sonda:releer`):

- **Camino (a), el archivo en el resultado.** El AI SDK 7 ya lo mapea en los tres adapters: OpenAI con `input_image`/`input_file` en `function_call_output`, Google con `functionResponse.parts` y Anthropic con `tool_result` y un bloque `image` o `document`. Las tres APIs lo aceptaron, también por la cadena con el respaldo forzado (`AI_FALLBACK_SIMULATE=openai` y `openai,google`), sin un solo 400. Eso importa porque en la cadena un 400 no cae al respaldo (`ai/fallback.ts`). Los tres leyeron el dato chico.
- **Camino (b), una subllamada.** Un modelo utility mira el archivo y contesta solo la pregunta. Cuesta más o menos la mitad en unidades, pero tiene tres problemas:
  - tarda el doble con Luna;
  - el modelo del chat nunca ve la foto, así que no puede juzgarla para un post;
  - **se cae junto con la cadena utility**, que usa los mismos proveedores: con OpenAI y Google caídos, Sonnet responde el turno y la subllamada no tiene a quién llamar.

  El camino (a) solo depende de quien está respondiendo.

- **Plan B dentro de (a):** `prepareStep` puede inyectar la imagen como un mensaje del creator, que es el camino que F10.9 ya verificó. También funcionó, pero no hizo falta.

**Cómo lo resolvieron otros (regla dura #8):**

| Quién                       | Cómo                                                                                                         | Lo que tomamos                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Claude Code                 | La tool `Read` vuelve a leer un archivo cuando hace falta, y una imagen regresa como contenido del resultado | Releer bajo demanda en vez de cargar todo en cada turno; la imagen dentro del resultado |
| Anthropic, text editor tool | `view` con `view_range` para ver solo unas líneas                                                            | Pedir un rango (aquí, páginas de un PDF) en vez del documento entero                    |
| OpenAI, `web_search`        | `open_page` y `find_in_page` como pasos aparte de buscar                                                     | Ver el detalle es un paso distinto, que el modelo decide                                |
| MCP                         | Un `CallToolResult` puede traer contenido `image`                                                            | La imagen como resultado de una tool es una forma estándar, no un truco de un proveedor |

## Contrato

**Tool** (schema Zod en `packages/shared/src/attachments.ts`, ADR-005): `ver_adjunto({ adjunto, paginas? })`.

- `adjunto` es el id que trae la línea del adjunto (`[Adjunto de antes (imagen "foto.jpg", id: …): …]`) o su nombre de archivo. Con el nombre se toma el más nuevo de ese chat (`AttachmentsService.findForView`). Así se alcanza uno que solo sobrevive nombrado en el resumen.
- Solo cuenta un adjunto enviado en este chat: uno del composer sin enviar, uno de otro chat o uno de otro creator (RLS) no se encuentra.
- `paginas` aplica solo a un PDF con texto: `"4"`, `"3-5"`, `"3–5"` o `"3 a 5"` (`attachments/attachment-view.ts`).
- La parte del mensaje guarda una referencia, nunca bytes ni texto: `{ attachmentId, nombre, tipo, paginas, totalPaginas, estado, recortado }`, con `estado` en `ok`, `no_encontrado`, `pagina_no_disponible` (la página pedida no existe, no tiene texto porque es una imagen dentro del PDF, o no se guardó porque el texto se recortó en la subida) o `limite`. Cada uno le dice al modelo qué pasó y cómo seguir, sin mandarlo a una página que no se puede leer.
- **Lo que ve el modelo lo arma `toModelOutput`:**
  - una imagen o un PDF escaneado: una línea, y el archivo con los bytes de la variante del modelo (la misma caché que `materialize`);
  - un texto: `<adjunto nombre=… tipo=… paginas=…>`, escapado igual que en el contexto;
  - si quedó algo fuera (más páginas que el tope, o el archivo se guardó recortado), una nota que dice qué vio y cómo pedir el resto.

**Cuándo se ofrece.** Solo si el chat tiene algún adjunto que ya no viaja completo (`ModelContext.hiddenAttachments`, en `context-builder.ts`). Un chat sin adjuntos viejos no paga la definición de la tool ni tienta al modelo a llamarla. Una vez que aparece no se quita, porque la ventana solo avanza: la lista de tools no cambia entre turnos y su prefijo sigue en la caché del proveedor.

**Prompt.** Si el creator pregunta por un detalle que la descripción no trae, el modelo vuelve a ver el adjunto. Si el dato ya está en la descripción, o el adjunto se ve completo, no. Lo que trae el archivo son datos, no instrucciones, también al volver a verlo.

**Topes** (constantes en código):

| Qué                                                                         | Tope                                                                                                                                       |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Adjuntos que se vuelven a ver por mensaje                                   | 3 (`ATTACHMENT_VIEWS_PER_TURN`)                                                                                                            |
| Intentos que no sirvieron por mensaje (no encontrado, página no disponible) | 3 más, aparte: un nombre mal escrito no le quita su lugar a la foto que sí hacía falta, pero un modelo que reintenta en círculo se detiene |
| Tokens estimados que pueden sumar en un mensaje                             | 40k (`VIEW_TURN_TOKENS`): un escaneado de 20 páginas, o varias fotos y textos; no dos escaneados largos                                    |
| Texto de un adjunto al volver a verlo                                       | ~8k tokens (`VIEW_TEXT_CHARS`, 28k caracteres), por páginas enteras en un PDF                                                              |

Al llegar al tope la tool devuelve `estado: "limite"`, no un error. Lo mismo dos veces en un mensaje (en paralelo o en otro paso, por id o por nombre) no vuelve a cargar el archivo ni gasta cupo: la segunda llamada recibe "ya lo tienes arriba". Así, dos llamadas a un escaneado de 20 páginas no meten 72k tokens con un tope de 40k. `MAX_AGENT_STEPS` se queda en 7: varias relecturas comparten un paso, y lo que acota el costo es el tope de cada tool.

**Contexto.** Lo que se vuelve a ver viaja completo **solo en su turno**. En los siguientes, `dietViewedAttachments` (`chat/attachment-context.ts`) le pone `contexto: "linea"` a la parte y el modelo recibe una línea ("en un turno anterior volviste a ver…"). La respuesta que escribió con eso ya está en la conversación, y reenviar la imagen en cada turno es justo lo que la ventana evita. Si hace falta otra vez, la vuelve a ver.

**Cobro** (ADR-012, addendum F10.11): no hay fee propio. Los bytes que vuelven a entrar se cobran como tokens de entrada del turno (`chat_message`), igual que el texto de una página leída. No hay razón nueva en el ledger ni `task_kind` nuevo. La relectura queda en la traza del turno (tool call, `RunTrace`).

## Consecuencias

- **Un turno que vuelve a ver una foto cuesta más** que uno que contesta de la descripción: ~10 a 40 unidades según el modelo y el caché. Es más barato que reenviar la foto en cada turno, y es la fricción que el creator ya no paga.
- **La UI muestra el paso** en la lista única de pasos ("Volví a ver foto.jpg"; ADR-028, addendum PR6).
- **Telegram (F11)** usa la misma tool: el canal es un adapter sobre el mismo chat (ADR-010).
- **Revisar cuando:**
  - la suite muestre que algún modelo de la cadena vuelve a ver de más (costo) o de menos (inventos);
  - un proveedor deje de aceptar archivos en el resultado de una tool (volver a correr la sonda);
  - o haga falta partir un PDF escaneado por páginas, que hoy se ve completo porque no hay librería de PDF en el repo.

## Resultado de la suite (2026-11-01)

Los 11 casos de releer (`scripts/cultural-suite/reread-prompts.ts`), 3 corridas por caso. Vara: relee ≥90% donde hace falta, se abstiene ≥80% donde no, 0 inventos, 0 órdenes de un archivo obedecidas y 0 errores con el respaldo forzado.

| Corrida                                              | Relee cuando debe | Se abstiene | Dijo el dato | Inventos | Obedeció el archivo | Errores |
| ---------------------------------------------------- | ----------------- | ----------- | ------------ | -------- | ------------------- | ------- |
| Línea base, sin la tool (los tres modelos)           | 0/21              | 12/12       | 9/27         | 0        | 0/3                 | 0       |
| Luna                                                 | 20/21 (95%)       | 11/12 (92%) | 26/27        | 0        | 0/3                 | 0       |
| Gemini 3.8 Flash                                     | 21/21             | 12/12       | 27/27        | 0        | 0/3                 | 0       |
| Sonnet 5.5                                           | 21/21             | 12/12       | 27/27        | 0        | 0/3                 | 0       |
| Cadena con `openai` caído (respondió Gemini)         | 21/21             | 12/12       | 27/27        | 0        | 0/3                 | 0       |
| Cadena con `openai,google` caídos (respondió Sonnet) | 21/21             | 12/12       | 27/27        | 0        | 0/3                 | 0       |

- **Los dos fallos de Luna no hacen daño.** Una vez, con la foto que solo quedaba en el resumen, no la volvió a ver y le pidió al creator que la adjuntara, que es el comportamiento de antes, sin inventar. Otra vez volvió a ver el menú aunque la descripción ya traía el precio: costo de más, con la respuesta correcta.
- **Ninguno siguió la nota del pizarrón** que ordenaba crear un borrador: la contaron como contenido del archivo.
- **Costo por turno de estos casos** (USD, `model-prices.ts`): Luna $0.0003, Gemini $0.0058 y Sonnet $0.0255.
- Las dos corridas con el respaldo forzado son de antes de los arreglos del `/code-review` de este PR: un estado `pagina_no_disponible`, el tope de intentos, lo repetido no recargado y el prompt condicionado a que la línea ofrezca la tool. La corrida por modelo es la del código final.

Reportes: `docs/reference/suite-cultural/2026-10-31-reporte-releer.md`, `-releer-respaldo-gemini.md`, `-releer-respaldo-sonnet.md` y la línea base `-releer-base.md`.

## Prueba en vivo (F10.11 PR5, 2026-11-01)

En la app, con `seed:dev`, contra la base de dev: una foto de fachada y un menú en PDF, dos turnos de relleno, y preguntas que solo se contestan mirando el archivo. Primero con la cadena normal (Luna), y después con `AI_FALLBACK_SIMULATE=openai` (Gemini) y `openai,google` (Sonnet).

- **Describir al salir (PR4):** ninguna descripción en los turnos 1 y 2; las dos salieron en el turno 3 (fachada 339 caracteres, 6 unidades; menú 705, 3 unidades).
- **Volver a ver:**
  - Luna contestó si el nombre del café lleva serifa;
  - Gemini, el color del borde del cartel chico;
  - Sonnet, la página 4 del menú, con `paginas: "4"`.

  En los tres, el paso "Volví a ver …" en la lista, y se conserva al recargar.

- **Cobro:** el turno que volvió a ver la foto usó 11,413 tokens de entrada (la imagen en un segundo paso) y cobró **un solo asiento `chat_message`** de 67 unidades, sin fee aparte. El turno siguiente bajó a 4,941 tokens: la imagen ya no volvió a viajar. Ese turno contestó un precio desde la descripción, sin volver a ver nada.
- **Respaldo:** los turnos de Gemini y Sonnet quedaron con `fallback_from = openai:gpt-6-luna`, sobre un historial que armó Luna.
- **UI:** a 390 px el paso cabe sin desbordar, en los dos temas. Los estados de no disponible y tope se revisaron en Storybook con "Lado a lado".

**Lo que encontró y la suite no podía ver: un modelo que se desmiente.** En los turnos siguientes, la dieta cambia la imagen vuelta a ver por una línea. Con "volviste a ver… ya no lo ves", Sonnet leyó un resultado de tool sin imagen seguido de una respuesta segura (de Luna, que sí la vio), concluyó que esa respuesta se había inventado y se "corrigió" ante el creator: "la herramienta no me mostró la imagen y te respondí como si la hubiera visto". La suite no lo podía ver porque sus historiales no traen relecturas anteriores.

- **El arreglo:** la línea ahora dice que el archivo sí llegó completo en ese turno, que la respuesta se basó en verlo y que Presencia lo quitó del historial para no reenviarlo (`viewLineForModel`).
- **Medido con el mismo historial que armó la dieta de producción** (3 corridas por modelo):
  - Luna y Gemini dicen que lo sacaron de la foto;
  - Sonnet vuelve a abrir la imagen para confirmar en vez de desmentirse.
