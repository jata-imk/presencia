# Prueba en vivo de F11 — 2026-11-05

El canal Telegram de punta a punta, con el bot de dev (`@presencia_dev_bot`), el cel de Jose y la cuenta `dev@presencia.local`. La API corrió en local con la búsqueda real (`WEB_SEARCH_PROVIDER=brave`) y con cada caída fingida (`AI_FALLBACK_SIMULATE`). Alcance decidido por Jose: el checklist completo con el modelo principal, y con los respaldos solo el flujo del gym (ADR-030, "Prueba en vivo").

Lo que vio Jose está en el checklist. Lo que registró la base está en las tablas de cada bloque: `ai_usage_events`, `credit_ledger` y `messages`, consultados después de cada bloque.

## Bloque 1 — Luna (sin simular), checklist completo

Todo pasó (Jose, 2026-11-05).

| #   | Paso                                                                                                                                                          | Resultado |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1   | Desconectar desde la web y volver a conectar (QR o enlace); la página cambia sola                                                                             | ✅        |
| 2   | Nota de voz en un tema nuevo → 3 ideas → "hazme un post de LinkedIn de la segunda" → card con botón; en la web, el chat con su ícono, la card y "Nota de voz" | ✅        |
| 3   | Foto con caption, álbum y PDF                                                                                                                                 | ✅        |
| 4   | Un link y una búsqueda, con Fuentes                                                                                                                           | ✅        |
| 5   | `ver_adjunto` después de 4+ turnos (pendiente desde el PR5)                                                                                                   | ✅        |
| 6   | Dos temas en paralelo                                                                                                                                         | ✅        |
| 7   | "Continuar en Telegram" desde la web                                                                                                                          | ✅        |
| 8   | Detener a media respuesta → "detenida" en la web                                                                                                              | ✅        |
| 9   | Sin cuota (asiento `adjustment` que dejó la cuenta en 0): aviso con el link a Plan, en Telegram y en la web, sin cobro                                        | ✅        |
| 10  | Reintentar                                                                                                                                                    | ✅        |
| 11  | `/disconnect` desde Telegram, y volver a conectar                                                                                                             | ✅        |

Lo que registró la base:

| `task_kind`      | Modelo                   | `fallback_from` | Eventos  |
| ---------------- | ------------------------ | --------------- | -------- |
| `chat`           | `gpt-6-luna`             | —               | 18       |
| `chat_title`     | `gpt-6-luna`             | —               | 5        |
| `content_digest` | `gpt-6-luna`             | —               | 8        |
| `web_search`     | `web-search`             | —               | 5        |
| `transcription`  | `whisper-large-v3-turbo` | —               | 1 (36 s) |

| Asiento               | Cuántos | Total                                                                               |
| --------------------- | ------- | ----------------------------------------------------------------------------------- |
| `chat_message`        | 18      | −1,040                                                                              |
| `web_search`          | 5       | −375                                                                                |
| `audio_transcription` | 1       | −10                                                                                 |
| `adjustment`          | 2       | 0 (−19,674 para el paso 9, +19,674 al terminar: el ledger no se borra, se compensa) |

17 turnos por Telegram (`channel = 'telegram'`, uno de ellos nota de voz) y 1 por la web.

## Bloque 2 — los respaldos

| Caída fingida          | Flujo                                                                                                             | Respondió                                                                                                                            | Resultado |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| `openai`               | Nota de voz → 3 ideas → post de LinkedIn → card                                                                   | `gemini-3.8-flash`, con `fallback_from = openai:gpt-6-luna` (los turnos del chat y el título)                                        | ✅        |
| `openai,google`        | En el mismo tema de Gemini (un historial que escribieron Luna y Gemini): nota de voz → post para Instagram → card | `claude-sonnet-5-5`, con `fallback_from = openai:gpt-6-luna`                                                                         | ✅        |
| `groq` (transcripción) | Una nota de voz                                                                                                   | `gpt-4o-mini-transcribe`, con `fallback_from = groq:whisper-large-v3-turbo` (21 s); el eco "🎤 Escuché" igual y el mismo cobro (−10) | ✅        |

Sonnet siguió sin errores una conversación que Luna y Gemini habían escrito: cambiar de proveedor a media conversación no rompe el turno.

## Lo que queda

Nada del checklist. El veredicto de registro de la suite cultural (`docs/reference/suite-cultural/2026-11-05-reporte-telegram.md`) queda para Jose.
