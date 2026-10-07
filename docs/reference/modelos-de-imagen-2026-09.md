# Modelos de generación de imagen — panorama al 2026-09-30

Investigación para decidir el generador principal y los de respaldo (backlog "Modelo principal + fallbacks por capacidad"). Criterio de Jose: **balance calidad/precio**; la velocidad importa poco (la generación es asíncrona, ADR-025).

> Esto es un panorama de mercado, no una decisión. El ranking público mide gustos globales en inglés. Nuestro criterio es otro: lugares y comida del sureste reconocibles, texto en español bien escrito, **sin logotipos de terceros**, proporción exacta (4:5) y edición fiel con referencia. La decisión sale de nuestro bake-off (`scripts/image-bakeoff`), como la de ADR-025.

## Precios verificados (1K, por imagen, sin batch)

| Proveedor         | Modelo (id)                                        | Precio                                           | Calidad (Elo AA, T2I) | Notas                                                                                                                                                                    |
| ----------------- | -------------------------------------------------- | ------------------------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Google            | Nano Banana 2 · `gemini-3.1-flash-image`           | **$0.067** (0.5K $0.045 · 2K $0.101 · 4K $0.151) | 1125                  | **El principal hoy.** GA. Batch: $0.034. **Medido por nosotros: ~$0.095 una 4:5** (cobra por tokens, y la 4:5 tiene más píxeles que el 1K cuadrado).                     |
| Google            | Nano Banana 2 Lite · `gemini-3.1-flash-lite-image` | $0.0336                                          | 1096                  | GA, ~4 s. Lo descartamos en el bake-off de F10 porque metió marcas de terceros (Nutella). Más débil con texto chico.                                                     |
| Google            | Nano Banana Pro · `gemini-3-pro-image`             | $0.134                                           | 1101                  | El doble que NB2 y por debajo en el ranking: sin razón para usarlo.                                                                                                      |
| Google            | Nano Banana · `gemini-2.5-flash-image`             | $0.039                                           | —                     | **Se apaga el 2026-10-02.**                                                                                                                                              |
| Google            | Imagen 4 (fast/std/ultra)                          | —                                                | —                     | **Apagado desde el 2026-08-17** en la Gemini API.                                                                                                                        |
| OpenAI            | `gpt-image-2` (high)                               | ~$0.211                                          | 1172                  | Tokens: $8/M entrada de imagen, $30/M salida. En medium ~$0.053 (1024²); nuestro alternativo a 1024×1280 salió ~$0.045. Tarda 30–39 s.                                   |
| OpenAI            | `gpt-image-2.5-flare` / `-sunburst` (max)          | ~$0.211                                          | 1190 / 1197           | Salieron el 2026-09-08. #1 y #2 del ranking, pero en su nivel más caro. Los niveles bajos no están publicados por imagen (calculadora por tokens): **hay que medirlos**. |
| OpenAI            | `gpt-image-1.5` (high)                             | ~$0.133                                          | 1107                  | Sigue soportado en nuestro adapter (con recorte).                                                                                                                        |
| OpenAI            | `gpt-image-1-mini` (medium)                        | ~$0.011                                          | —                     | Barato, calidad menor.                                                                                                                                                   |
| xAI               | Grok Imagine Image 2.0 · `grok-imagine-image-2.0`  | **$0.04** (docs; blogs: $0.06 en 1K medium)      | **1155**              | Salió el 2026-08-07. Por encima de NB2 en el ranking y más barato. Texto bueno en frases cortas; NB2 le gana en tipografía fina.                                         |
| xAI               | `grok-imagine-image` / `-quality`                  | $0.02 / $0.05                                    | — / 1045              | Generación anterior.                                                                                                                                                     |
| Meta              | Muse Image                                         | **$0.01**                                        | 1114                  | Salió el 2026-07-07. Precio plano (incluye su búsqueda web interna). Por API de Meta, fal y OpenRouter.                                                                  |
| Microsoft         | MAI-Image-2.6                                      | ~$0.039                                          | **1150**              | Preview en Azure Foundry (también en OpenRouter). Flash: ~$0.0195, Elo 1105.                                                                                             |
| Alibaba           | Qwen-Image-3.0 / Pro                               | $0.03 / $0.04                                    | 1075 / 1089           |                                                                                                                                                                          |
| ByteDance         | Seedream 5.0 Pro                                   | ~$0.09                                           | 1081                  |                                                                                                                                                                          |
| Black Forest Labs | FLUX.2 [flex]                                      | ~$0.06                                           | 1028                  | Proveedor oficial del AI SDK.                                                                                                                                            |

Elo: leaderboard de Artificial Analysis (AA-Image-T2I v2.0), consultado el 2026-09-30.

## Lo que se lee de la tabla

1. **Nano Banana 2 sigue siendo defendible**, pero ya no está en la frontera calidad/precio. Por menos dinero hay modelos con Elo más alto (Grok Imagine 2.0, MAI-Image-2.6) o casi igual (Muse Image, a una séptima parte del precio).
2. **OpenAI tiene la mejor calidad, pero cara** en los niveles que la ganan. Como alternativo tiene sentido `gpt-image-2` en medium (el de hoy) o `gpt-image-2.5-flare` en un nivel medio, **si** la medición da un precio cercano.
3. **Hay que dejar Nano Banana Pro e Imagen 4:** uno no gana nada y el otro ya no existe.

## Recomendación para el bake-off (backlog de fallbacks)

Correr el bake-off de ADR-025 (mismos 8 prompts del sureste + 2 ediciones, más el caso "sin logotipos" y un texto en español) contra:

| Candidato                                   | Por qué                                                                                                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Grok Imagine Image 2.0** (xAI)            | El que Jose quería probar. Mejor Elo que NB2 y más barato. Proveedor de AI SDK (`@ai-sdk/xai`): entra al `provider-registry` sin adapter nuevo.                  |
| **Muse Image** (Meta, vía fal u OpenRouter) | El mejor precio por calidad de la tabla (Elo 1114 a $0.01). Si pasa nuestro criterio, es el candidato natural a principal para imágenes de volumen (carruseles). |
| **MAI-Image-2.6** (Microsoft)               | Elo 1150 a ~$0.039. Más fricción de alta (Azure Foundry, preview). Probarlo por OpenRouter antes de pensar en Azure.                                             |
| Nano Banana 2 (control)                     | El principal de hoy, para comparar.                                                                                                                              |

La edición con referencia ("más cálida", "sin gente") y el respeto a "sin logotipos" pesan más que el Elo: ahí se cayó Flash Lite en F10.

Para el bake-off conviene el **batch** de Google cuando se pueda ($0.034 en vez de $0.067): los scripts no necesitan respuesta inmediata.

## Fuentes

- [Gemini API · Pricing](https://ai.google.dev/gemini-api/docs/pricing) (oficial: NB2, NB2 Lite, NB Pro, NB 2.5 y batch)
- [Imagen 4 · Gemini API](https://ai.google.dev/gemini-api/docs/models/imagen) · [Imagen 4 shutdown (Aug 17)](https://byteiota.com/imagen-4-shutdown-august-17-migrate-to-gemini-image-api-now/)
- [xAI API Pricing](https://docs.x.ai/developers/pricing) (oficial) · [Grok Imagine Image 2.0 review](https://www.piclumen.com/blog/grok-imagine-image-2-0-review/) · [Grok Imagine 2.0 vs NB2](https://melies.co/compare/grok-imagine-image-2-vs-nano-banana-2)
- [OpenAI API Pricing](https://developers.openai.com/api/docs/pricing) (tarifas por token) · [GPT Image 2 pricing](https://www.aifreeapi.com/en/posts/openai-image-generation-api-pricing) · [GPT-Image-2.5 API](https://apimaster.ai/blog/gpt-image-2-5-api-pricing-2026)
- [Artificial Analysis · Text to Image Leaderboard](https://artificialanalysis.ai/image/leaderboard/text-to-image)
- [Meta Muse Image](https://dev.meta.ai/models/muse-image) · [Muse Image en OpenRouter](https://openrouter.ai/meta/muse-image)
- [MAI-Image-2.6](https://microsoft.ai/news/pushing-the-quality-cost-frontier-with-mai-image-2-6/) · [MAI-Image-2.6 en OpenRouter](https://openrouter.ai/microsoft/mai-image-2.6)
- [Nano Banana 2 Lite vs NB2](https://blog.segmind.com/nano-banana-2-vs-nano-banana-2-lite-when-is-lite-enough/)
- [AI SDK · Black Forest Labs](https://ai-sdk.dev/providers/ai-sdk-providers/black-forest-labs) · [Grok Imagine en Vercel AI Gateway](https://vercel.com/changelog/grok-imagine-image-2-0-preview-now-available-on-vercel-ai-gateway)

## Actualización 2026-10-06 (F10.7)

Lo que cambió o se verificó al implementar los proveedores, con la spec de máquina en mano:

- **Grok Imagine 2.0 (xAI)** entra como proveedor `xai` (`@ai-sdk/xai`). Resolución `1k`/`2k`. **No tiene 4:5**: se le pide 3:4 y `image-fit` recorta ~6% de arriba y de abajo (`apps/api/src/images/image-models.ts`). xAI lo publica a $0.04; Artificial Analysis lo mide en $0.06 a 1K. El bake-off dice cuál es.
- **Muse y MAI-Image-2.6 por OpenRouter** entran como proveedor `openrouter`, con adapter propio (`apps/api/src/ai/openrouter-images.ts`). `@openrouter/ai-sdk-provider` no tiene modelos de imagen, y su API es `POST /api/v1/images`, no `/images/generations`.
  - Ids: `meta/muse-image` y `microsoft/mai-image-2.6`.
  - MAI tampoco tiene 4:5 (sus proporciones son 1:1, 4:3, 3:4, 16:9, 9:16, 3:2 y 2:3), y genera una imagen por llamada.
  - Muse no publica parámetros: lo que entregue se recorta.
  - La respuesta trae `usage.cost` en dólares, que queda en el crudo de `ai_usage_events`.
- **Nuevos en el ranking desde el 2026-09-30:** `gpt-image-2.5-flare` y `-sunburst` encabezan generación y edición en Artificial Analysis, medidos en su nivel máximo (~$0.21). `MAI-Image-2.6-Flash` ($0.0195, Elo 1106) es la opción barata de Microsoft. Ninguno entra a este bake-off, por decisión de Jose.
- **Visto en la prueba del script:** Nano Banana 2, el de hoy, dibujó "NUTELLA" en un carrito de marquesitas aunque el prompt compuesto pide "sin logotipos". Es el mismo riesgo que descalificó a Flash Lite en F10. El bake-off lo mide en los cinco con un prompt dedicado (`tiendita-sin-logos`).

Fuentes: [OpenRouter OpenAPI](https://openrouter.ai/openapi.json) (`createImages`) · [OpenRouter catálogo de imágenes](https://openrouter.ai/api/v1/images/models) · [AI SDK xAI](https://ai-sdk.dev/providers/ai-sdk-providers/xai) · [Artificial Analysis](https://artificialanalysis.ai/image/leaderboard/text-to-image).

## Resultado del bake-off (2026-10-07)

| Modelo               | Promedio a ciegas                   | Bloqueos | Costo por imagen (medido) | Latencia mediana |
| -------------------- | ----------------------------------- | -------- | ------------------------- | ---------------- |
| Nano Banana 2        | 4.15 (20 imágenes)                  | 0        | $0.095                    | 9 s              |
| gpt-image-2 (medium) | 4.10 (20 imágenes)                  | 0        | $0.047                    | 33 s             |
| Muse                 | 3.15 (20 imágenes)                  | 0        | $0.010                    | 19 s             |
| Grok Imagine 2.0     | 2.92 (12, contando bloqueos como 1) | 3 de 22  | $0.040                    | 17 s             |
| MAI-Image 2.6        | 1.83 (12, contando bloqueos como 1) | 12 de 22 | $0.037                    | 26 s             |

- **Elegido:** `openai:gpt-image-2` primero y Nano Banana 2 después. La decisión y sus razones están en el addendum del 2026-10-07 de ADR-025; las calificaciones y las notas, en `bakeoff-imagenes/2026-10-07-*`.
- **El ranking público no predijo nuestro caso.** Grok y MAI llegaban con buen Elo, pero Grok bloquea personas en el gym y en el agua, y MAI bloquea la palabra "Mérida" (filtro `DallEBlockList` de Azure).
