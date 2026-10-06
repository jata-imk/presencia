# Modelos de texto, video y música — panorama al 2026-10-05

Investigación de F10.7 (modelo principal + respaldos por capacidad). Imagen tiene su propio panorama: `modelos-de-imagen-2026-09.md`.

> Esto es un panorama de mercado, no una decisión. En texto, un modelo entra al chat solo si pasa la suite cultural (ADR-004); el veredicto vive en `docs/reference/suite-cultural/`. Video y música no son de V1 todavía: quedan aquí para la fase de video (después de F10.8).

## Correcciones a lo que se daba por hecho

- **"GPT Luna 6.1" no existe.** Los modelos son `gpt-6-luna` (salió el 2026-09-22) y `gpt-5.6-luna`. El único "6.1" es `gpt-6.1-sol`.
- **Sora 2 ya no está en la API**: OpenAI quitó la Videos API y los `sora-2*` el 2026-09-24, sin reemplazo.
- **MiniMax Music no acepta clientes nuevos** desde el 2026-08-20. **Suno no tiene API pública** (solo una lista de socios).
- **Claude Haiku 4.5** se puede retirar desde el 2026-10-15. Salió de la suite y del `.env.example`.
- **`gpt-image-1.5`** se apaga el 2026-12-01.

## Texto

Precio por millón de tokens (entrada / caché / salida).

| Modelo (id)                   | Precio                                                           | Contexto | Esfuerzo                                   | Índice AA          | Arena en español | Notas                                                                                           |
| ----------------------------- | ---------------------------------------------------------------- | -------- | ------------------------------------------ | ------------------ | ---------------- | ----------------------------------------------------------------------------------------------- |
| `openai:gpt-5.6-terra`        | $2 / $0.20 / $12                                                 | 1.05M    | none … max, default medium                 | 42 (max)           | fuera del top 20 | El de dev hoy. Referencia de la suite.                                                          |
| `openai:gpt-6-luna`           | **$0.10 / $0.01 / $0.50**                                        | 1.05M    | none … max, default medium                 | 38 (max), 22 (low) | fuera del top 20 | Las tools van por Responses API (la que usamos); por Chat Completions solo con esfuerzo `none`. |
| `google:gemini-3.8-flash`     | $0.75 / $0.075 / $3.75 (desde 2027-01-01: $1.50 / $0.15 / $7.50) | 1M       | low, medium (default), high; sin `minimal` | 41 (high)          | #19              | GA desde 2026-09-02. 243 tok/s.                                                                 |
| `anthropic:claude-sonnet-5-5` | $2 / $0.20 / $10                                                 | 1M       | low … xhigh/max (adaptive)                 | 56 (max)           | fuera del top 20 | El más caro de los respaldos; solo correría si caen OpenAI y Google a la vez.                   |
| `deepseek:deepseek-v4-pro`    | $0.66 / $0.022 / $1.98 fuera de pico; **el doble en pico**       | 1M       | thinking on/off; low/high/max              | 36                 | #56              | **Descartado** como respaldo del chat: ver abajo.                                               |

**Por qué DeepSeek V4 Pro no entra a la cadena del chat:**

- La hora pico (01:00–04:00 y 06:00–10:00 UTC) es **19:00–22:00 y 00:00–04:00 en Mérida**: justo la noche en que trabajan los creators, al doble de precio.
- Los datos se procesan en la República Popular China, lo que pediría declararlo en el aviso de privacidad (LFPDPPP).
- Con thinking y tools exige que se le regrese el `reasoning_content` de todos los turnos anteriores, o responde 400. Como respaldo a mitad de un chat que hizo OpenAI, esos turnos no lo traen: truena justo cuando hace falta.

**Esfuerzo de razonamiento.** Los tokens de razonamiento se cobran como salida, así que más esfuerzo es más caro y más lento. Desde F10.7 se elige por modelo en el `.env` (`openai:gpt-6-luna@high`) y la rate card v2 cobra al creator solo la salida visible (ADR-012). Medido en la suite cultural del 2026-10-06 (13 prompts sin historial): Luna@high costó **$0.0003 por turno** contra $0.0077 de Terra@medium (~25×), pensando el 32% de su salida, con el primer token visible a 3.3 s de mediana (peor caso 6.7 s). El chat pasó a Luna@high con Gemini 3.8@medium y Sonnet 5.5 de respaldo (ADR-004).

Fuentes: [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna.md) · [GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra.md) · [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing) · [Gemini latest model](https://ai.google.dev/gemini-api/docs/latest-model) · [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing) · [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing) · [DeepSeek thinking mode](https://api-docs.deepseek.com/guides/thinking_mode) · [DeepSeek privacy policy](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html) · [Arena, español](https://arena.ai/leaderboard/text/spanish) (2026-10-02) · [Artificial Analysis](https://artificialanalysis.ai/leaderboards/models).

## Video (para la fase de video, no V1 todavía)

El overview §8 dice que V1 no genera video; Jose decidió (2026-10-05) que entra en una fase propia después de F10.8, y esa fase es la que cambia el §8. Un clip de 8 s cuesta lo que 10–25 imágenes, así que el cobro es la primera pregunta de esa fase.

| Modelo                                 | Precio                                                  | Imagen→video (AA) | Notas                                                                                                                         |
| -------------------------------------- | ------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| MiniMax `MiniMax-H3-Max`               | $0.05/s 480P, $0.08/s 768P                              | **#1 (1195)**     | Ya hay key de MiniMax. 9:16 por su API: no verificado. Sin proveedor en el AI SDK (fal/replicate solo tienen modelos viejos). |
| Google `gemini-omni-1.1-flash`         | ~$0.10/s a 720p (salida $17.50/M tokens)                | #3 (1178)         | GA, con audio. Google lo recomienda como default de video.                                                                    |
| xAI `grok-imagine-video-1.5`           | $0.08/s (terceros: 480p $0.08, 720p $0.14, 1080p $0.25) | #8 (1098)         | 1–15 s, 9:16, audio nativo, asíncrono. Proveedor del AI SDK (`xai.video()`).                                                  |
| Google `veo-3.1-lite-generate-preview` | $0.05/s 720p, $0.08/s 1080p                             | #14 (1071)        | Preview. El más barato.                                                                                                       |
| Google `veo-3.1-fast-generate-preview` | $0.10/s 720p, $0.12/s 1080p                             | #11 (1082)        | Preview, y más caro y peor que H3-Max: no conviene como respaldo.                                                             |
| Runway `gen4.5`                        | $0.12/s                                                 | —                 |                                                                                                                               |
| OpenAI Sora 2                          | —                                                       | —                 | Apagado el 2026-09-24.                                                                                                        |

**Propuesta para esa fase** (a validar con un bake-off propio, como el de imagen): MiniMax-H3-Max de principal, `grok-imagine-video-1.5` y Veo 3.1 Lite de respaldo — tres proveedores distintos. El AI SDK tiene `experimental_generateVideo` (v7, con polling) y `createProviderRegistry` ya expone `videoModel()`.

Fuentes: [xAI video](https://docs.x.ai/docs/models/grok-imagine-video-1.5) · [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing) · [Gemini video](https://ai.google.dev/gemini-api/docs/video) · [MiniMax pricing](https://platform.minimax.io/docs/guides/pricing-paygo) · [Runway pricing](https://docs.dev.runwayml.com/guides/pricing/) · [OpenAI deprecations](https://developers.openai.com/api/docs/deprecations) · [AA imagen→video](https://artificialanalysis.ai/video/leaderboard/image-to-video) · [AI SDK video](https://ai-sdk.dev/docs/ai-sdk-core/video-generation).

## Música (sin fase todavía)

Lo que importa aquí no es el precio sino la **licencia comercial**: el creator la publica en redes.

| Opción                     | Estado y precio                                     | Uso comercial                                                                         |
| -------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| ElevenLabs Music           | $0.15/min; los planes incluyen minutos              | Sí, desde el plan Starter.                                                            |
| Google Lyria (`lyria-3.5`) | $0.08 por canción                                   | Bajo los términos de la Gemini API, sin licencia específica publicada; marca SynthID. |
| Stability Stable Audio     | Créditos de $0.01; precio por canción no verificado | Plan Pro con derechos comerciales (fuente secundaria).                                |
| MiniMax Music              | Cerrado a clientes nuevos                           | —                                                                                     |
| Suno                       | Sin API pública                                     | —                                                                                     |

Fuentes: [ElevenLabs API pricing](https://elevenlabs.io/pricing/api) · [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing) · [MiniMax music](https://platform.minimax.io/docs/guides/music-generation).
