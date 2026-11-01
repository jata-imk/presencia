# ADR-030 · Canal Telegram: un tema = un chat, por el mismo turno

> **Borrador (F11, PR1).** Lo que depende de piezas del Bot API todavía no probadas en un cliente real queda marcado como _por confirmar en la sonda_. La sonda (`docs/reference/telegram/`) y el bake-off de transcripción (`docs/reference/transcripcion/`) lo cierran, y este ADR se termina en el PR de docs de F11.

**Decisión:** el bot de Telegram es otro adapter sobre el mismo chat (ADR-010). Un mensaje que llega por Telegram entra por **el mismo turno** que la web: la misma cadena de modelos con respaldo, las mismas tools (cards, `leer_enlace`, `buscar_en_web`, `ver_adjunto`), la misma traza y el mismo cobro en el ledger. Lo que cambia es solo la entrada (un update de Telegram en vez de un POST del composer) y la salida (mensajes de Telegram en vez del stream SSE).

**1 tema de Telegram = 1 chat de Presencia.** Desde el Bot API 9.3/9.4 (dic 2025 y feb 2026), el chat privado con un bot puede tener temas:

- un tema que crea el creator → chat nuevo;
- "Continuar en Telegram" en la web → el bot crea el tema de ese chat (`createForumTopic`);
- el autotítulo del chat renombra el tema (`editForumTopic`; un tema sin nombre llega con `is_name_implicit`).

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
- **La respuesta final:** el rich message (`sendRichMessage`, 10.1) acepta markdown compatible con GFM: encabezados, listas, tablas, bloques plegables (`<details>`) y botones (`<tg-button>`), hasta 32,768 caracteres. El markdown del modelo viaja casi sin convertir.
- _Por confirmar en la sonda:_ que Android, iOS y Desktop pinten todo esto bien.

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
- _Por confirmar en el bake-off:_ la calidad con audio real de Mérida.

## Riesgo anotado: otros canales no tienen estas capacidades

Pedido de Jose (2026-11-01). Los temas, los drafts con detener y el rich son de Telegram:

- **WhatsApp:** no los tiene. Además, desde el 2026-01-15 Meta prohíbe en su Business API los asistentes de IA de propósito general, y así sacó a ChatGPT, Copilot y Perplexity.
- **Discord y Slack:** tienen hilos, pero otra forma de streamear y de dar formato.

Un segundo canal daría un flujo distinto en cada lugar. Por eso:

- **lo compartido es el turno, no la forma de mostrarlo:** el runner del turno no sabe de canales, y cada adapter decide cómo pinta pasos, drafts, cards y errores;
- **no se construye una abstracción de "capacidades de canal"** para canales que no existen (YAGNI): se escribe cuando llegue el segundo, con este ADR como punto de partida;
- **WhatsApp necesita un ADR propio** que revise primero la política de Meta;
- **la app móvil queda priorizada para después del MVP:** es la única superficie donde la experiencia no depende de lo que permita un tercero.

## Descartado

- **Chat rodante + `/nuevo` (+ corte diario o por inactividad):** ver arriba.
- **Un chat nuevo por mensaje o por día, sin temas:** no deja seguir una conversación.
- **Long polling en producción:** ADR-010 ya eligió webhook, que no deja un proceso consultando a Telegram. El polling queda solo para dev, con un bot aparte: un bot no puede tener las dos cosas a la vez, y la laptop no tiene URL pública.
- **Correr el turno en un job de pg-boss:** el candado de turnos (`turnsInFlight`, ADR-006) vive en memoria del proceso `app`. Un turno de Telegram en el worker no se serializaría contra uno web en el mismo chat.
- **Guardar el audio:** se guarda la transcripción; el audio se queda en Telegram.
- **Chat SDK de Vercel:** ver arriba.
