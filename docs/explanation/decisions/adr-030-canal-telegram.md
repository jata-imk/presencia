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
  - Si el Telegram ya está en otra cuenta, el bot pide `/disconnect`, y el código no se gasta. Desde el PR7a también se anota en la fila (`link_error`) para que la web lo diga.
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
  - **Detenida o fallida:** la nota con **"Reintentar"** (callback `retry:<id del mensaje>` → `regenerateChat`), en el chat de ese mensaje y no en el del lugar: tras `/new`, o con el chat borrado en la web, el lugar ya es de otro chat. El botón se quita al tocarlo.
- **El HTML se arma desde los tokens de `marked`, nunca pegando strings:** cada etiqueta que se abre se cierra, también con el markdown a medias de un draft. Así:
  - lo que Telegram no tiene se traduce: un encabezado es negritas, una lista son viñetas;
  - una tabla de hasta 40 columnas de ancho va en `<pre>` alineada, y una más ancha se vuelve una lista por fila (como `markdown.tables` de OpenClaw);
  - lo largo se corta por bloques en mensajes de hasta 4,096; un bloque que no cabe pierde el formato solo él;
  - si Telegram rechaza el HTML de todos modos, el mismo texto va sin formato.
- **En fila por tema, en memoria:**
  - Dos mensajes del mismo tema se contestan uno tras otro, y temas distintos corren en paralelo. Con más de 3 en espera, el bot pide calma.
  - **El handler nunca espera el turno:** con polling, grammY atiende un update a la vez, y esperar ahí detendría todo, también el botón de detener. **Tampoco lanza:** lo que corre sin que el bot lo espere no puede rechazar suelto (Node mataría el proceso `app`, con la web y el SSE), así que un fallo de la base se le dice al creator y se registra (revisión del PR4). Es el mismo criterio de OpenClaw (una cola por sesión) y del Chat SDK de Vercel (el turno fuera del handler del webhook).
- **Errores antes del turno** (las excepciones de Nest, por status): 402 → sin cuota, con el enlace a Plan; 409 → "estoy terminando otra respuesta"; 404 → el chat ya no existe, o esa respuesta ya no se puede reintentar.
- **Apéndice del canal en el prompt** (`channelInstruction`, `chat/system-prompt.ts`): respuestas más cortas, formato simple, sin botones de la web, y que los borradores llegan con un botón para abrirlos en Presencia. Va después de la voz y antes de la fecha de hoy (addendum F11 PR4 de ADR-006).
- **`@grammyjs/auto-retry`:** un 429 o un 5xx pasajero de Telegram se reintenta solo, con tope corto.
- **Updates que se piden:** `message`, `callback_query` (Reintentar) y `stopped_message_generation` (detener).
- **Fotos y archivos desde el PR5,** y notas de voz desde el PR6 (secciones siguientes).
- **La web ve el chat nacer:** el aviso en vivo de un chat que la pestaña no conoce lo suma a Recientes (antes se ignoraba). Verificado: el chat de un tema apareció con su título automático en una pestaña abierta antes de crearse.

## Fotos, álbumes y documentos (F11 PR5)

- **Entran como un adjunto de la web.** El bot baja el archivo (`getFile`, `telegram/telegram-files.ts`) y lo sube con `AttachmentsService.upload` (F10.9): las mismas validaciones por contenido, el mismo storage, las mismas partes `file` en el mensaje y el mismo `ver_adjunto` después. El caption es el texto del mensaje, y va después de los archivos, como en el composer.
- **Qué entra:** una foto (el tamaño más grande que trae; `processAttachment` la achica), y un documento PDF, de imagen o `.md/.txt/.csv/.json`.
  - Un documento se revisa por nombre y tipo **antes de bajarlo**: un `.docx` de 19 MB no se baja para rechazarlo.
  - Una foto HEIC mandada "como archivo" recibe "mándala como foto" (como foto, Telegram la convierte a JPEG).
  - Video, sticker, ubicación… reciben "eso todavía no lo leo", sin cobro.
- **20 MB:** es lo que el Bot API deja bajar a un bot (el tope de la web es 25 MB). Si Telegram dice que pesa más, ni se pide; si no lo dice, la bajada se corta al pasarse. El aviso: "súbelo desde la web". La URL de bajada lleva el token del bot, así que nunca va a un log ni a un error.
- **Un álbum es un mensaje.** Telegram manda un update por foto con el mismo `media_group_id`. La primera abre una ventana de 1.5 s (antes de cualquier `await`: con webhook las demás llegan en paralelo), toma su lugar en la fila del tema y resuelve al creator una sola vez (a quien no está conectado, un aviso por álbum, no diez). Las siguientes se suman y reinician la ventana; con 10 (el máximo de Telegram, y `ATTACHMENTS_PER_MESSAGE`) se cierra al instante. Las fotos se nombran `foto-1.jpg`, `foto-2.jpg`… para que el modelo y `ver_adjunto` las distingan.
- **Un archivo que falla se salta con aviso y el resto sigue,** como el chip con error que se quita en la web. Los avisos salen antes de la respuesta. Si ninguno entró, no hay turno ni cobro, aunque traiga caption: el caption hablaba de ese archivo ("resúmelo"), y solo el modelo no tendría qué leer.
- **Se suben sin chat** (`chatId: null`) y el turno los liga al enviar, como en la pantalla de chat nuevo de la web. Si todos fallan, no queda un chat vacío; los que se quedan sin mensaje los borra el barrido de adjuntos al día.
- **Mientras baja:** el draft dice _Leyendo tus archivos…_ con el botón de detener, que ya sirve, y el turno sigue en el mismo draft. Se refresca cada 20 s (un draft dura 30) y el turno no arranca hasta que el último llegó: si no, podía caer encima del _Pensando…_ (revisión del PR5). Detener en ese momento no guarda nada: "Lo detuviste antes de que empezara". Se bajan de 3 en 3, en el orden en que llegaron.
- **El lugar en la fila se toma antes de cualquier `await`**, también para el texto (revisión del PR5): saber de quién es el mensaje va dentro de la fila. Antes, una foto y el texto que la sigue, o dos textos seguidos, podían contestarse al revés según qué búsqueda volviera primero.
- **Un audio** (no nota de voz) se transcribe igual que una nota de voz (PR6). Dentro de un álbum recibe "mándamelos de uno en uno".
- **Aceptado, sin arreglo:** un "detener" justo mientras se crea el chat (una transacción de milisegundos) deja ese chat vacío; y una foto de un álbum que llegue más de 1.5 s después de la anterior abre otro mensaje. Con webhook, Telegram manda el álbum junto y solo reenvía lo que no aceptamos con un 200.
- **Foto sin caption y el texto aparte son dos turnos** (decisión de Jose, 2026-11-02): cada mensaje de Telegram es uno, igual que en la web. Se descartó esperar unos segundos un texto que acompañe a la foto: retrasaría toda foto sin caption.
- **413** (los archivos del mensaje pasan del presupuesto de 60k tokens, F10.9): "mándamelos en mensajes separados".

## Notas de voz y audios (F11 PR6)

- **La transcripción es el texto del mensaje del creator,** por el mismo turno:
  - el título, la memoria y la compactación la leen sin cambios;
  - `messages.voice_seconds` (migración `0061`) guarda cuánto duraba, y la web la recibe como `metadata.voice` y pinta "Nota de voz · 0:42" (PR7a);
  - el caption de un audio va después de la transcripción.
  - **El audio no se guarda.**
- **Qué entra:** `voice` y `audio` sueltos (`voiceOf`, `telegram/telegram-files.ts`).
  - Telegram manda un mp3 o un m4a como `audio`, con duración.
  - Un audio "como archivo" sigue el camino de los archivos y recibe su aviso.
  - La video-nota y el video no se leen.
- **Antes de bajar nada,** con lo que trae el update:
  - más de 10 minutos (`MAX_VOICE_SECONDS`) → aviso;
  - más de 20 MB → aviso;
  - sin cuota para la nota más el turno → el aviso de Plan.
  - Ninguno de los tres cobra.
- **Mientras escucha:** el draft _Escuchando tu nota…_ con el botón de detener, que corta la transcripción. El turno sigue en el mismo draft, como con los archivos.
- **El eco va aparte y al instante** (decisión de Jose, 2026-11-03): `<blockquote expandable>🎤 Escuché: …</blockquote>` en cuanto termina la transcripción, antes de que el modelo empiece. Es el `echoTranscript` de OpenClaw.
  - Se ve si oyó mal un nombre sin esperar la respuesta.
  - Se recorta a 3,500 caracteres; la transcripción completa se guarda igual.
- **Sin texto** (una nota en silencio): "no alcancé a oír nada", sin chat ni turno. Se cobra igual: el proveedor ya facturó.
- **El modelo sabe que puede venir de voz:** el apéndice del canal dice que muchos mensajes son transcripciones con muletillas y nombres mal oídos. Le pide entender la intención y preguntar cómo se escribe un nombre que importa para el borrador.
  - Es una línea fija, para no romper el caché.
  - No hay marcador por mensaje en el contexto (regla dura #8: no hizo falta tocar `context-builder`).
- **Límites del plan gratis de Groq** (revisados el 2026-11-03):
  - 20 llamadas por minuto, 2,000 al día, 7,200 s de audio por hora y 28,800 s por día, para toda la cuenta;
  - 25 MB por archivo, que no aplica: Telegram corta en 20;
  - pasarse da 429, que la cadena trata como caída: responde OpenAI y el plan gratis no factura.
  - Si `fallback_from = 'groq:…'` empieza a salir seguido en `ai_usage_events`, toca el plan Developer de Groq.
- **La respuesta va en un draft nuevo, no en el de _Escuchando tu nota…_** (prueba en vivo, 2026-11-04). Un draft se queda donde nació: con el mismo id, la respuesta se escribía arriba del eco, la final salía abajo, y por un momento se veía dos veces. Con otro id nace debajo del eco.
- **Prueba en vivo con Groq** (2026-11-04, iOS):
  - cobro y traza bien: −10 por minuto iniciado, −20 una nota de 61 s, `audio_seconds` en cada fila;
  - detener mientras escucha contesta "Lo detuviste antes de que empezara". Si Groq ya había contestado, la nota se cobra, como está decidido;
  - un MP3 viejo y ruidoso de 61 s salió incompleto: es Whisper con audio de mala calidad, no un recorte nuestro (el eco no se recortó);
  - **una nota en silencio de 5 s salió "Thank you."** (en inglés: sin idioma fijo, Whisper lo adivina), y el modelo la contestó. Jose mantuvo la decisión del bake-off: el texto tal cual, sin el filtro de `no_speech_prob`. Si se reconsidera, el filtro va solo para Groq: `gpt-4o-mini-transcribe` no acepta `verbose_json`, y su 400 no saltaría al respaldo.
- **Una nota de voz en el general no abre tema:** iOS solo crea el tema implícito con un mensaje de texto. La nota llega sin `message_thread_id` y cae en el chat sin tema, como en Telegram X, y `/new` lo corta. Se deja así (decisión de Jose, 2026-11-04): si el bot abriera un tema, la nota quedaría en el general y la respuesta en el tema.
- **Revisión del PR6 (`/code-review medium`):**
  - **arreglado:**
    - el detener de _Escuchando tu nota…_, que sigue a la vista unos segundos, ahora detiene el turno (antes no hacía nada);
    - el detener también corta la bajada del audio y la pausa antes de un reintento;
    - reintentar una nota desde la web con el mismo texto conserva `voice_seconds` (editarla la vuelve texto escrito).
  - **Aceptado: la duración de un `audio` la pone quien lo manda.** Un mp3 que dice durar 30 s y dura una hora pasa el tope de 10 minutos y cobra un minuto. Eso cuesta centavos de Groq, y el turno se sigue cobrando por tokens. Lo que sí se cierra es que entre al turno un texto que la web rechazaría: una transcripción de más de 50k caracteres (`MAX_MESSAGE_CHARS`) recibe el aviso de nota larga.
  - **Aceptado: cobrada y sin mensaje.** Si después de transcribir falla crear el chat, la cuota se acabó por un turno web en ese instante, o borraron el chat, la nota queda cobrada y el texto solo vive en el eco. Son carreras de milisegundos; el eco deja ver lo que se dijo para reenviarlo.
- Cadena, respaldo y cobro: addendum F11 PR6 de ADR-004 y de ADR-012.

## La web: Configuración y notas de voz (F11 PR7a)

Diseño en Claude Design, proyecto "Presencia - Chat", `Chat Telegram.html`.

- **Configuración → Canales conectados** tiene dos secciones: "Chatear desde" (Telegram) arriba de "Redes para publicar" (PostFast). Hablar con Presencia y publicar por ti son cosas distintas.
  - Sin bot en el servidor (`state: "unavailable"`), la sección de Telegram no se pinta.
  - El estado lo dice `GET /api/telegram/link`, que ahora trae también `botUsername` para el "Abrir Telegram" de una cuenta conectada (`null` mientras el bot no termina de arrancar).
- **"Ya conectada a otro perfil" llega a la web** (decisión de Jose, 2026-11-04). Antes solo lo decía el bot, y la web seguía en "Esperando" hasta que el enlace vencía.
  - `channel_links.link_error` (migración `0062`, enum `channel_link_error`) se anota cuando el canje da `taken`, y el estado sale como `taken`. Un CHECK lo deja solo en filas pendientes.
  - Se anota con el tenant del dueño del código (la policy de siempre) y solo si la fila sigue pendiente con ESE hash: un enlace regenerado mientras tanto no hereda el aviso. Si anotarlo falla, el bot contesta igual.
  - El código sigue sin gastarse: si el creator desconecta allá y reabre el mismo enlace, conecta. Por eso la web sigue preguntando mientras el enlace no vence.
  - Se queda aunque el enlace venza (regenerar sin desconectar allá fallaría igual). Generar otro enlace, conectar o desconectar lo limpian.
- **La web se entera sola:** nadie le avisa cuando el creator toca Iniciar, así que pregunta cada 3 s mientras el enlace está `waiting` o `taken`, no ha vencido y la pestaña está visible (`use-telegram-link.ts`). Al volver a la pestaña pregunta de inmediato. La cuenta regresiva es local y marca vencido sin esperar al servidor.
- **El enlace (con el código) vive solo en memoria** (`telegram-link-store.ts`), nunca en `localStorage`: quien lo tenga conecta su Telegram a esta cuenta. Tras recargar con un enlace pendiente, la web ya no lo tiene (el servidor solo guarda su hash): la tarjeta sigue esperando, sin QR ni "Abrir Telegram", y ofrece "Generar otro". No lo regenera sola: mataría un enlace que el creator quizá está por confirmar en el cel.
- **El deep link es un `<a>`**, no un `window.open` después de un `await` (el navegador lo bloquea). El QR (`qrcode.react`) usa tokens fijos en los dos temas (`--qr-*`): un QR invertido no lo leen todas las cámaras. En el cel va escondido tras "¿Telegram está en otro dispositivo? Mostrar QR".
- **La nota de voz en el chat:** "Nota de voz · 0:42" arriba del texto, dentro de la burbuja, con la etiqueta del canal. **Sin botón para escucharla** (decisión de Jose): el audio no se guarda.
  - `toUIMessage` manda `metadata.channel` cuando el mensaje no llegó por la web.
  - Reintentar desde la web un mensaje con el mismo texto conserva su canal, además de `voice_seconds`: lo escribió (o lo dijo) por Telegram.
- `seed:dev` siembra el chat "Nota de voz desde Telegram" en "Estados del turno", para ver la etiqueta sin bot.

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
