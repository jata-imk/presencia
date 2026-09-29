# Bake-off de generadores de imagen — 2026-09-29

Generado por `apps/api/scripts/image-bakeoff/run.ts` (ADR-025). Las imágenes quedan en
`apps/api/scripts/image-bakeoff/out/` (no versionadas).

| Modelo               | Prompt             | Latencia | Tokens in / out | Peso    | Notas |
| -------------------- | ------------------ | -------- | --------------- | ------- | ----- |
| openai:gpt-image-2   | marquesitas        | 37.1 s   | 67 / 1510       | 2012 KB |       |
| openai:gpt-image-2   | x-cenote           | 29.9 s   | 61 / 1078       | 2644 KB |       |
| openai:gpt-image-2   | texto-en-imagen    | 39.1 s   | 44 / 1756       | 2487 KB |       |
| openai:gpt-image-2   | marquesitas-calida | 34.0 s   | 1307 / 1510     | 2029 KB |       |
| openai:gpt-image-1.5 | marquesitas        | 21.6 s   | 67 / 2070       | 2613 KB |       |
| openai:gpt-image-1.5 | x-cenote           | 19.0 s   | 61 / 1990       | 3593 KB |       |
| openai:gpt-image-1.5 | texto-en-imagen    | 14.8 s   | 44 / 1482       | 2134 KB |       |
| openai:gpt-image-1.5 | marquesitas-calida | 18.8 s   | 376 / 1966      | 2424 KB |       |

## Juicio — gpt-image-2 contra gpt-image-1.5 (QA de F10, 2026-09-29)

Motivo: en el QA de prod, gpt-image-1.5 entregó 2:3 para una card 4:5 y el recorte (más un prompt de "5 diapositivas") dejó una imagen cortada.

|                      | gpt-image-2                                               | gpt-image-1.5               |
| -------------------- | --------------------------------------------------------- | --------------------------- |
| Proporción           | **Exacta**: 1024×1280 (4:5), 1536×864 (16:9); sin recorte | 2:3 y 3:2; hay que recortar |
| Texto pedido         | **Exacto**: "MARTES DE 2X1 EN TACOS DE COCHINITA"         | Falla ("MAKIES")            |
| Escena (marquesitas) | Correcta y con sentido de lugar                           | Genérica                    |
| Costo aprox.         | ~1,500 tokens de salida × $30/M ≈ **$0.045**/imagen       | ~2,000 × $32/M ≈ $0.064     |
| Latencia             | **30–39 s**                                               | 15–22 s                     |

**Decisión:** el generador alternativo pasa a `openai:gpt-image-2` (`AI_MODEL_IMAGE_ALT`). Mejor, más barato y sin recorte; la contra es la latencia, que queda dentro del corte de 5 min y del "10 a 60 segundos" que anuncia la card. El adapter pide el tamaño exacto a gpt-image-2 (`EXACT_OPENAI_SIZES`); gpt-image-1.5 sigue soportado con recorte.

## Prompts

- **marquesitas** (4:5): Un puesto de marquesitas en el Paseo de Montejo de Mérida al atardecer, con el vendedor preparando una marquesita con queso de bola. Fotografía natural y realista, luz cálida, ambientada en México. Sin texto, letras ni logotipos dentro de la imagen.
- **x-cenote** (16:9): Cenote de Yucatán visto desde arriba con agua turquesa y raíces colgando, una persona flotando. Fotografía natural y realista, luz cálida, ambientada en México. Sin texto, letras ni logotipos dentro de la imagen.
- **texto-en-imagen** (1:1): Cartel de promoción de una taquería que diga exactamente 'MARTES DE 2X1 EN TACOS DE COCHINITA', estilo cartel pintado a mano mexicano.
- **marquesitas-calida** (4:5, edita marquesitas): Hazla más cálida y quita a las personas del fondo; conserva el puesto y la composición.
