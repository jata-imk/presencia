# ADR-025 · Generación de imágenes: un adapter, dos generadores

**Decisión:** las imágenes se generan detrás de una interfaz propia, `ImageProvider` (`apps/api/src/images/image-provider.ts`), implementada sobre `generateImage` del Vercel AI SDK (`AiSdkImageProvider`). Hay dos generadores configurados por entorno:

- **`AI_MODEL_IMAGE`**, el de siempre. Default: `google:gemini-3.1-flash-image`.
- **`AI_MODEL_IMAGE_ALT`**, el de "Probar con otro generador", opcional y sin default. En este despliegue es `openai:gpt-image-1.5`.

Además, `IMAGE_PROVIDER=fake` cambia los dos por `FakeImageProvider`, que dibuja un PNG liso sin red y es lo que usan los tests y conviene en dev.

## Razón

**Mismo patrón que el texto (ADR-004) y la publicación (ADR-009).** El resto de la app pide "una imagen 4:5 de esto" y no sabe quién la dibuja. Cambiar de proveedor es cambiar una variable y reiniciar, no tocar la card. El precio de un generador se mueve cada trimestre, y en septiembre de 2026 los que había al empezar la fase ya no estaban: Imagen 4 está apagado en la Gemini API y `gemini-2.5-flash-image` se apaga el 2 de octubre.

**Por qué Gemini 3.1 Flash Image de default.** Se decidió con un bake-off, no con la tabla de precios (`docs/reference/bakeoff-imagenes/2026-09-27-reporte.md`): 8 prompts como los escribiría el chat para un creator del sureste más 2 ediciones, contra tres modelos.

- Es el que mejor entiende el lugar: el Paseo de Montejo sale reconocible y la marquesita es una marquesita.
- Edita con imagen de referencia de forma fiel.
- Entrega la proporción exacta (4:5 = 928×1152).
- Escribe bien texto en español cuando se le pide.
- Cuesta $0.067 por imagen a 1K y tarda ~10 s.
- La key de Google ya existe por el chat y las tendencias.

**Por qué no Flash Lite, aunque cuesta la mitad y tarda 3 s.** Metió marcas de terceros (frascos de Nutella con el logo, letreros) aunque el prompt pedía "sin texto ni logotipos". Una imagen que el creator publica con la marca de otro es un riesgo de derechos que el producto no puede correr para ahorrar tres centavos.

**Por qué un segundo generador y no uno solo.** Lo pidió el founder. Cuando una imagen no convence, regenerar con el mismo modelo tiende a dar la misma mirada; otro modelo da otra.

`gpt-image-1.5` en calidad media cuesta ~$0.034–0.05 y tarda ~15 s. Da una luz más dramática y respeta mejor el "sin logos". Tiene dos límites:

- **Escribe mal el texto** ("MAKIES DE 2X1").
- **Solo conoce tres tamaños**, así que 4:5 sale 2:3 (1024×1536) y hay que recortarlo.

Es opcional y sin default a propósito: exigir la key de un segundo proveedor para arrancar la API sería caro para nada, y sin ella el botón simplemente no aparece.

## Contrato

- **Una llamada = una imagen.** Las dos variantes de la card son dos llamadas en paralelo, no `n: 2`. Gemini no acepta `n` (el SDK lanza), y además cada imagen se cobra y se guarda por separado: si una de las dos falla, la otra no se pierde con ella.
- **Proporciones de la app, no del proveedor.** `IMAGE_ASPECT_RATIOS` = `1:1`, `4:5`, `16:9`.
  - Google las recibe tal cual (`aspectRatio`).
  - OpenAI las recibe traducidas a tamaño (`1024x1024`, `1024x1536`, `1536x1024`).
  - El adapter **no recorta**: decidir qué parte de la imagen sobra es del producto, y lo hace quien la guarda (F10 PR3).
- **Editar es generar con una imagen de referencia** (`reference`): `prompt.images` del SDK. Gemini y OpenAI la aceptan. No hay máscara ni inpainting: ninguna iteración de F10 la pide.
- **Calidad fija en OpenAI.** Se pide `quality: "medium"` explícito, porque el default `auto` elige en la práctica la calidad alta, que cuesta ~4× lo tarifado.
- **Bloqueo ≠ error.** Que el proveedor se niegue a dibujar vuelve como `kind: "blocked"`: no se reintenta, no se cobra, y al usuario se le dice qué pedir distinto.
  - Gemini se niega sin error: responde sin imagen (`NoImageGeneratedError` del SDK). Pero también responde sin imagen cuando contesta solo con texto o corta antes de tiempo, así que **solo cuenta como bloqueo si el proveedor lo marca**: `promptFeedback.blockReason`, o alguna `safetyRatings[].blocked`. Sin esa señal es una falla reintentable. El usage de esa respuesta se conserva con un middleware, porque Gemini cobra la entrada aunque no dibuje.
  - OpenAI se niega con un 400 `moderation_blocked`.
  - Cualquier otra falla (red, 5xx, key) **lanza**: es del sistema, no del contenido.
- **Telemetría.** Cada llamada deja su fila en `ai_usage_events` vía `AiUsageService.registrar()`, con tarea `image_generate` o `image_edit` y la columna nueva `images_count`. Ver el addendum F10 de ADR-004.
- **Cobro por imagen**, tarifa fija igual para los dos generadores. Ver el addendum F10 de ADR-012.

## Consecuencias

- **Todas las imágenes de Gemini llevan SynthID**, una marca de agua invisible. No afecta la publicación, y es lo honesto sobre contenido generado.
- **Texto dentro de la imagen.** El estilo por defecto pide "sin texto, letras ni logotipos" y el texto vive en el caption. El bake-off mostró que Gemini sí escribe bien cuando se le pide, así que si el creator lo pide explícitamente, se le deja. Plantillas con overlay propio quedan fuera de F10.
- **Personas reales.** Ningún proveedor genera de forma confiable a personas específicas, y los dos pueden negarse. Eso se ve como un estado de la card, no como un error.
- **Revisar cuando:**
  - cambie la tabla de precios de alguno de los dos;
  - Flash Lite deje de meter marcas (volver a correr `pnpm --filter @presencia/api bakeoff:imagenes`);
  - o aparezca demanda de texto en imagen con plantillas.
