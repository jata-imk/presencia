# ADR-030 · Canal Telegram: un tema = un chat, por el mismo turno

> **Borrador (F11).** La sonda con un bot real ya corrió (`docs/reference/telegram/2026-11-01-sonda.md` con iOS y Desktop, `-sonda-2.md` con Telegram X en un Android viejo) y sus hallazgos están aquí. El bake-off de transcripción también (`docs/reference/transcripcion/2026-11-01-bakeoff.md`). El ADR se termina en el PR de docs de F11.

**Decisión:** el bot de Telegram es otro adapter sobre el mismo chat (ADR-010). Un mensaje que llega por Telegram entra por **el mismo turno** que la web: la misma cadena de modelos con respaldo, las mismas tools (cards, `leer_enlace`, `buscar_en_web`, `ver_adjunto`), la misma traza y el mismo cobro en el ledger. Lo que cambia es solo la entrada (un update de Telegram en vez de un POST del composer) y la salida (mensajes de Telegram en vez del stream SSE).

**1 tema de Telegram = 1 chat de Presencia.** Desde el Bot API 9.3/9.4 (dic 2025 y feb 2026), el chat privado con un bot puede tener temas:

- **un tema que crea el creator → chat nuevo.** En iOS basta escribir fuera de un tema: Telegram crea uno implícito (`forum_topic_created.is_name_implicit: true`, nombrado con el principio del mensaje), y la app ya lo presenta como "Nuevo chat" / "Continuar último hilo";
- **"Continuar en Telegram" en la web → el bot crea el tema de ese chat** (`createForumTopic`);
- **el autotítulo del chat renombra el tema** (`editForumTopic`). Desktop lo muestra; **la app de iOS no**, ni reabriendo ni reiniciando (sonda, 2026-11-01). Se manda igual: es una limitación de ese cliente;
- **un mensaje sin `message_thread_id` → el último chat de Telegram de ese creator, con `/new` para empezar otro.** Solo llega de clientes sin temas (Telegram X: todo revuelto en un chat, sin tema en el update), porque iOS crea el tema implícito. Es la degradación del modelo de OpenClaw, solo para ellos. "Fuera de tema = chat nuevo" le abriría un chat por mensaje;
- **el bot nunca borra un tema:** `deleteForumTopic` borra también los mensajes del bot que había en él.

## Razón

**Por qué temas y no un chat rodante.** OpenClaw (el asistente personal de referencia de Jose) y Manus (en Telegram desde feb 2026) usan un solo hilo continuo:

- **OpenClaw:** una sesión `main` que va rodando, compartida por todos los canales de DM. `/new` o `/reset` la reinician, y hay cortes opcionales a las 4:00 a.m. (`session.reset.atHour`) o por inactividad (`idleMinutes`). [docs.openclaw.ai/session](https://docs.openclaw.ai/session)
- **Manus:** las tareas se orquestan dentro del mismo hilo.

Para un asistente sin lista de chats eso basta. Presencia sí la tiene: título, carpetas, fijados, y cada chat es un tema con sus cards. Con un hilo rodante, el paso del overview que dice "lo retoma en la web" se rompe: queda un chat eterno con las cards de semanas mezcladas. Jose descartó las variantes con corte automático (2026-11-01) por tres razones:

1. desde Telegram no podría elegir un chat que ya existe en la web;
2. no podría llevar dos conversaciones a la vez;
3. en Telegram siempre vería un solo chat eterno, aunque por detrás se partiera.

Los temas resuelven las tres.

**Streaming y "detener" nativos.** Las piezas de Telegram que reemplazan a sus equivalentes del canal web:

- **El texto que se va escribiendo:** `sendMessageDraft` (9.3; abierto a todos los bots desde la 9.5) y `sendRichMessageDraft` (10.1). La spec cruda dice que el draft es una vista previa efímera de 30 s y que al final se manda el mensaje completo.
- **Detener:** `can_stop` (10.3) muestra el botón, y el update `stopped_message_generation` es el "detener" de la web. Se guarda `stopped` igual (ADR-006).
- **La respuesta final va en HTML** (`sendMessage` con `parse_mode: "HTML"`), no como rich message (decisión de Jose, 2026-11-01). El rich (`sendRichMessage`, 10.1) acepta markdown con tablas, `<details>` y botones, y en iOS y Desktop se ve bien. Pero en un cliente viejo (Telegram X) sale **"Mensaje no compatible"** en lugar de la respuesta, y la API no dice qué cliente usa cada quien. El HTML se vio en los tres:
  - el markdown del modelo se convierte a HTML;
  - las tablas chicas van en `<pre>` alineado y las anchas como lista;
  - el "🎤 Escuché" va en `<blockquote expandable>`;
  - los botones son inline keyboard;
  - lo largo se parte en mensajes de 4,096.
- **Degradación:** los temas, el draft y el detener no existen en Telegram X, pero ahí simplemente no aparecen: el creator recibe la respuesta final igual. El rich es lo único que rompía.
- **Drafts con cuidado:** en la sonda, mandar cada 350 ms dio `429`, y un parcial con una etiqueta abierta (`<details>` cortado) dio `RICH_MESSAGE_CONTENT_REQUIRED`. El draft se espacia (~1 por segundo) y nunca se manda con una etiqueta HTML a medias.
- **Threaded Mode tiene un cargo extra solo sobre las compras con Telegram Stars** (BotFather). Presencia no vende por Stars: no aplica.

**Por qué no un framework de canales.** El Chat SDK de Vercel tiene un adapter de Telegram (`@chat-adapter/telegram`), pero:

- streamea con "publicar y editar" en vez de drafts;
- trata Telegram como conversación a nivel de canal, sin hilos (`lockScope: "channel"`, [guía](https://vercel.com/kb/guide/the-complete-guide-to-chat-sdk)).

Es el mínimo común entre plataformas: perderíamos justo los temas, los drafts y el detener. Se usa grammY (ADR-010) como cliente del Bot API.

**Transcripción de notas de voz.**

- OpenClaw prueba primero el modelo que responde, si acepta audio. Si no, sigue las keys en orden Groq → OpenAI → … y usa una CLI local solo sin keys ([docs.openclaw.ai/audio](https://docs.openclaw.ai/audio)).
- Aquí el audio no puede ir directo al modelo del chat: Sonnet, el último eslabón de la cadena, no acepta audio.
- Y la transcripción tiene que quedar como texto del mensaje: se ve en la web, entra a la memoria y la compactación la resume.
- Por eso es un paso propio, antes del turno.
- **Cadena:** `groq:whisper-large-v3-turbo` (~$0.0007/min, mínimo de 10 s por llamada), con `openai:gpt-4o-mini-transcribe` de respaldo ($0.003/min).
- **Whisper local en el VPS:** descartado. Son 4 vCores sin GPU compartidos con Postgres y la app; tarda más o menos lo que dura el audio, para ahorrar centavos al mes.
- **Bake-off con 9 notas reales de Jose** (6 guiones con lugares mayas, marcas, precios, anglicismos y muletillas, y 3 improvisadas, una con música fuerte y otra de más de 2 minutos):
  - **Groq:** WER 7.2% y 4.11 de 5 a ciegas; inventó un "¡Gracias!" al final de una nota (la alucinación de Whisper con el silencio); 0.7 s.
  - **OpenAI mini:** WER 5.2–5.7% y 4.67 de 5; no inventó nada; 1.5–2.3 s.
  - Los errores de los dos son sobre todo nombres propios.
- **Jose eligió Groq de principal**, con el texto tal cual y sin filtro de silencio. El público paga en pesos, y ~$1.40 al mes por creator intensivo pesa a esa escala. La diferencia de calidad es chica y el modelo del chat entiende igual. Claude recomendaba lo contrario por la alucinación; queda anotado por si los "¡Gracias!" llegan a molestar en la prueba en vivo. El filtro (`no_speech_prob` de los segmentos) es la salida si pasa.

## Vincular la cuenta (F11 PR3)

- **Deep link con código de un solo uso.**
  1. Configuración genera `https://t.me/<bot>?start=<código>` (`POST /api/telegram/link`).
  2. Telegram le muestra al creator "Iniciar", y el bot recibe `/start <código>` del usuario de Telegram que lo abrió. Es el único momento en que se sabe que esa cuenta de Telegram es de esa cuenta de Presencia.
  - **El código:** 32 bytes al azar en base64url (43 caracteres, dentro del límite de 64 de `start`). Vive 15 minutos y se usa una vez.
  - **Se guarda su sha256, nunca en claro:** quien lea la base no puede vincular su Telegram a otra cuenta.
  - **Un enlace nuevo invalida el anterior,** y nunca pisa un vínculo activo: la condición va en el mismo `ON CONFLICT`. Con una lectura previa, un `/start` canjeado entre la lectura y la escritura quedaba desconectado sin aviso (revisión del PR3).
  - **El vencimiento lo decide también Postgres** (`link_token_expires_at > now()` en el `UPDATE` que activa), no solo el reloj de la app.
  - **Al canjearlo, el hash se queda en la fila activa.** Así, reabrir el mismo enlace contesta "ya conectado". Si un Telegram ya conectado abre un código de otra cuenta, recibe "ese enlace ya no sirve": decirle "ya conectado" haría creer al dueño de ese código que se conectó.
- **Una fila por usuario y canal en `channel_links`** (migración 0059), que pasa por pendiente → activa → revocada y vuelve a pendiente al reconectar.
  - **Un Telegram activo en una sola cuenta,** con índice único parcial sobre las activas: una revocada no bloquea volver a vincular.
  - Si el Telegram ya está en otra cuenta, el bot pide `/disconnect`, y el código no se gasta.
  - Dos `/start` simultáneos con el mismo código canjean una sola vez: el `UPDATE` exige que la fila siga pendiente con ese hash.
- **Leer sin tenant con la policy `worker_scan`,** no con funciones `SECURITY DEFINER` como decía el plan. Es el patrón que el repo ya usa y prueba (0017, 0055).
  - El bot no sabe de quién es un update hasta buscarlo: `external_id` → `user_id` y hash del código → `user_id`.
  - Lee en modo barrido (`runWorkerScan`): solo `SELECT`, solo filas pendientes o activas, nunca revocadas.
  - Toda escritura vuelve a entrar con el tenant. `rls.spec.ts` lo prueba.
- **Desconectar:** desde la web (`DELETE /api/telegram/link`, y el bot avisa en Telegram) o con `/disconnect`. Los chats y sus mensajes se quedan: son la historia canónica.
- **Comandos en inglés** (`/start`, `/help`, `/disconnect` y, desde el PR4, `/new`) por convención (decisión de Jose, 2026-11-02). Su descripción en el menú de Telegram y todo lo que el bot contesta va en español.
- **El webhook** (`POST /api/telegram/webhook`, público):
  - compara el `X-Telegram-Bot-Api-Secret-Token` en tiempo constante;
  - contesta 200 en cuanto acepta el update y lo atiende después.
- **Sin tabla de updates para deduplicar,** que el plan proponía. Telegram solo reenvía lo que no aceptamos, y aceptamos antes de atender. Un `update_id` repetido por una respuesta perdida en la red lo frena un recuerdo en memoria de los últimos 500. Lo que no se aceptó, Telegram lo vuelve a mandar.
- **Los avisos de servicio no se contestan.** Telegram también manda como `message` cosas que nadie escribió: "tema creado", "mensaje fijado"… En iOS, escribir fuera de un tema manda dos updates: el aviso `forum_topic_created` y el mensaje. En la prueba en vivo del PR3 el bot contestó los dos, y la respuesta salió doble. Ahora solo se contesta lo que trae contenido del creator (`telegram-message.ts`). Es una lista de lo que sí se contesta, así que un aviso nuevo del Bot API se queda sin respuesta. Desde el PR4, el chat se crea con el primer mensaje real del tema, no con el aviso.
- **El bot vive solo en el proceso `app`** (TelegramModule no está en el worker): el turno se serializa con el candado en memoria de ese proceso. Sin `TELEGRAM_BOT_TOKEN` el canal está apagado y la API arranca igual. Si Telegram falla al arrancar (`init`, `setWebhook`, o el polling se cae con un 409), se reintenta solo a los 5 s, 15 s, 1 min y luego cada 5 min. El menú de comandos es cosmético y no frena el arranque. Apagar el módulo corta un arranque a medias, para que un reload de `tsx watch` no deje un polling huérfano. `env.ts` exige el secret en modo webhook y prohíbe el polling en producción.

## Conversar por Telegram (F11 PR4)

- **Un mensaje de texto entra por el turno de la web** (`ChatService.streamChat`), con `channel: "telegram"` y la zona del creator leída de la base (`users.timezone`; Telegram no trae sesión). La entrega la hace `TelegramSink` (`telegram/telegram-sink.ts`), el `TurnSink` del canal (addendum F11 PR2 de ADR-006).
- **Qué chat recibe** (`telegram_threads`, migración 0060):
  - El primer mensaje de un tema crea el chat; los siguientes caen en él.
  - Un tema con nombre puesto por el creator (`forum_topic_created.is_name_implicit` falso) le da su título al chat, como un renombre: el automático ya no lo toca ni se cobra, y el tema no se renombra. El aviso de "tema creado" llega antes que el mensaje y se recuerda 10 minutos.
  - Sin tema (Telegram X): el chat de la fila sin tema, hasta que `/new` la borra. Dentro de un tema, `/new` explica que basta con abrir otro.
  - Borrar el chat en la web suelta su tema: el siguiente mensaje empieza uno nuevo.
- **El título renombra el tema** (`editForumTopic`). `ChatEvents` (`chat/chat-events.ts`) avisa en el mismo proceso cuando se guarda un título: el automático renombra solo si el tema no tiene nombre del creator, y el que se escribe en la web, siempre.
- **Cómo se ve:**
  - **Mientras corre:** un draft con botón de detener (`sendMessageDraft` + `can_stop`). Empieza en _Pensando…_: con texto vacío Telegram pone su indicador, que en iOS es un globo sin texto durante todo el arranque del modelo (prueba en vivo). Luego muestra el texto o, si todavía no hay, la línea del paso ("Buscando 'café en Mérida'…", "Creando borrador para Instagram…"), con las mismas palabras que la lista de pasos de la web.
    - Se refresca una vez por segundo como mucho, sin encimar envíos, y se reenvía antes de 20 s porque un draft dura 30.
  - **Al terminar:** la respuesta en mensajes HTML (`telegram/telegram-html.ts`), las **fuentes** al final (la misma `webSources` de la web, movida a `packages/shared`), un mensaje por card con su red y el texto recortado, y el botón **"Abrir en Presencia"**.
    - Telegram rechaza un botón de URL a `localhost` o a una IP, así que en dev el enlace va en el texto.
  - **Detenida o fallida:** la nota con **"Reintentar"** (callback `retry:<id del mensaje>` → `regenerateChat`). El botón se quita al tocarlo.
- **El HTML se arma desde los tokens de `marked`, nunca pegando strings:** cada etiqueta que se abre se cierra, también con el markdown a medias de un draft. Así:
  - lo que Telegram no tiene se traduce: un encabezado es negritas, una lista son viñetas;
  - una tabla de hasta 40 columnas de ancho va en `<pre>` alineada, y una más ancha se vuelve una lista por fila (como `markdown.tables` de OpenClaw);
  - lo largo se corta por bloques en mensajes de hasta 4,096; un bloque que no cabe pierde el formato solo él;
  - si Telegram rechaza el HTML de todos modos, el mismo texto va sin formato.
- **En fila por tema, en memoria:**
  - Dos mensajes del mismo tema se contestan uno tras otro, y temas distintos corren en paralelo. Con más de 3 en espera, el bot pide calma.
  - **El handler nunca espera el turno:** con polling, grammY atiende un update a la vez, y esperar ahí detendría todo, también el botón de detener. Es el mismo criterio de OpenClaw (una cola por sesión) y del Chat SDK de Vercel (el turno fuera del handler del webhook).
- **Errores antes del turno** (las excepciones de Nest, por status): 402 → sin cuota, con el enlace a Plan; 409 → "estoy terminando otra respuesta"; 404 → el chat ya no existe, o esa respuesta ya no se puede reintentar.
- **Apéndice del canal en el prompt** (`channelInstruction`, `chat/system-prompt.ts`): respuestas más cortas, formato simple, sin botones de la web, y que los borradores llegan con un botón para abrirlos en Presencia. Va después de la voz y antes de la fecha de hoy (addendum F11 PR4 de ADR-006).
- **`@grammyjs/auto-retry`:** un 429 o un 5xx pasajero de Telegram se reintenta solo, con tope corto.
- **Updates que se piden:** `message`, `callback_query` (Reintentar) y `stopped_message_generation` (detener).
- **Por ahora, solo texto.** Una foto, un archivo o una nota de voz reciben "por ahora solo leo texto" (PR5 y PR6).
- **La web ve el chat nacer:** el aviso en vivo de un chat que la pestaña no conoce lo suma a Recientes (antes se ignoraba). Verificado: el chat de un tema apareció con su título automático en una pestaña abierta antes de crearse.

## Riesgo anotado: otros canales no tienen estas capacidades

Pedido de Jose (2026-11-01). Los temas, los drafts con detener y el rich son de Telegram:

- **WhatsApp:** no los tiene. Además, desde el 2026-01-15 Meta prohíbe en su Business API los asistentes de IA de propósito general, y así sacó a ChatGPT, Copilot y Perplexity.
- **Discord y Slack:** tienen hilos, pero otra forma de streamear y de dar formato.
- **Dentro del mismo Telegram ya pasa:** Telegram X no tiene temas, drafts ni rich. Por eso la respuesta va en HTML, que es lo que todos los clientes ven.

Un segundo canal daría un flujo distinto en cada lugar. Por eso:

- **lo compartido es el turno, no la forma de mostrarlo:** el turno no sabe de canales (`TurnSink`, F11 PR2; addendum de ADR-006), y cada adapter decide cómo pinta pasos, drafts, cards y errores;
- **no se construye una abstracción de "capacidades de canal"** para canales que no existen (YAGNI): se escribe cuando llegue el segundo, con este ADR como punto de partida;
- **WhatsApp necesita un ADR propio** que revise primero la política de Meta;
- **la app móvil queda priorizada para después del MVP:** es la única superficie donde la experiencia no depende de lo que permita un tercero.

## Descartado

- **Chat rodante + `/new` (+ corte diario o por inactividad):** ver arriba.
- **Un chat nuevo por mensaje o por día, sin temas:** no deja seguir una conversación.
- **Long polling en producción:** ADR-010 ya eligió webhook, que no deja un proceso consultando a Telegram. El polling queda solo para dev, con un bot aparte: un bot no puede tener las dos cosas a la vez, y la laptop no tiene URL pública.
- **Correr el turno en un job de pg-boss:** el candado de turnos (`turnsInFlight`, ADR-006) vive en memoria del proceso `app`. Un turno de Telegram en el worker no se serializaría contra uno web en el mismo chat.
- **Guardar el audio:** se guarda la transcripción; el audio se queda en Telegram.
- **Chat SDK de Vercel:** ver arriba.
- **Rich message para la respuesta final:** "Mensaje no compatible" en clientes viejos; ver arriba.
