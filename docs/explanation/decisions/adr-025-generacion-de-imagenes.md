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

## Addendum (2026-09-27, F10 PR3) — generar desde la card

- **El prompt que viaja se compone** (`images/image-prompt.ts`): lo que escribió el chat o el usuario, más el nicho de su Voz de marca, más el estilo por defecto **condicionado** ("si la descripción no pide otro estilo: fotografía natural…, sin texto ni logotipos"). Si el usuario pide "estilo ilustración", manda lo que escribió. La fila de `image_generations` guarda el prompt compuesto, no solo el del usuario.
- **El recorte a la proporción pedida vive en `images/image-fit.ts`**, fuera del adapter como decía el contrato: centrado y sin reescalar, con 2% de tolerancia. gpt-image 1024×1536 sale 1024×1280 para 4:5; Gemini (928×1152) pasa sin tocarse. El PNG recortado de gpt-image pesa ~3.3 MB, bajo el tope de 10 MB de publicación.
- **Medido con los generadores reales** (card de Facebook, 4:5, dos variantes en paralelo): Gemini cerró el trabajo en 26 s y gpt-image en 37 s, de click a card actualizada.
- **Para probar la card sin gastar:** `IMAGE_PROVIDER=fake` con `IMAGE_FAKE_DELAY_MS` (p. ej. 6000) deja ver y medir el estado "generando"; un prompt con `[bloquear]` simula la negativa del proveedor.

## Addendum (2026-09-28, F10 PR4) — editar e historial

- **Editar es la misma cola y el mismo candado que generar**, con `kind: "edit"`, **una** imagen y la elegida como referencia (`reference` del contrato, leída del storage en el worker). La fila guarda `instruction` y `parent_asset_id`, y la telemetría va como `image_edit`. Se cobra una imagen, a la misma tarifa (ADR-012).
- **El prompt de una edición dice qué NO cambiar** (`composeEditPrompt`): "conserva la composición, el encuadre y el sujeto; sin texto ni logotipos nuevos". Sin esa cola los generadores rehacen la escena entera.
- **La proporción de una edición es la de su imagen de partida**, llevada a la más cercana que usa la red (`nearestAspect`): una foto subida en 3:2 se edita como 16:9 o 1:1, no se deforma a 4:5.
- **Historial por card** (`GET /cards/:id/images`): todos los assets de la card con su origen (`assets` ⟕ `image_generations`), de la más vieja a la más nueva. Es lo mismo que Biblioteca (F12) va a necesitar para el linaje.
- **Texto alternativo** en `assets.metadata.alt`: las generadas nacen con la descripción de la card; una edición hereda el de su imagen de partida; `PATCH /assets/:id` lo cambia. Mandarlo a las redes sigue diferido.

## Addendum (2026-09-29, QA de F10 en prod)

- **El generador alternativo pasa a `openai:gpt-image-2`.** En el QA, gpt-image-1.5 entregó 2:3 para una card 4:5, y el recorte, junto con un prompt de "5 diapositivas", dejó una imagen cortada. gpt-image-2 acepta tamaños libres: el adapter le pide la proporción exacta (`EXACT_OPENAI_SIZES`: 1024×1280, 1536×864) y no hay recorte. En el mini bake-off (`docs/reference/bakeoff-imagenes/2026-09-29-0458-reporte-parcial.md`):
  - escribió exacto el texto que 1.5 fallaba;
  - cuesta ~$0.045 por imagen contra ~$0.064;
  - la contra: tarda 30–39 s contra 15–22 s.
    gpt-image-1.5 sigue soportado con recorte.
- **Encuadre seguro en todos los prompts** (`SAFE_FRAMING`): nada importante en los bordes, margen alrededor del sujeto y del texto, lo importante al centro. Así, si algo se recorta, es fondo.
- **El copy del bloqueo ya no promete una regla que no existe.** Decía "el generador no permite logos ni marcas", y el QA mostró que sí los dibuja. Ahora: "El generador se negó a crear esta imagen (suele pasar con personas reales o contenido sensible)". Qué publica el creator, logos incluidos, es decisión suya; el estilo por defecto igual pide "sin logotipos".
- **UI:**
  - **"Cambiar prompt"** en una card que ya tiene imagen: abre el mismo composer de una card vacía y genera desde cero. Las anteriores se quedan en versiones.
  - **"Ajustar esta imagen"** lleva la miniatura de la elegida, para que se vea sobre cuál se aplica.
  - **Se quitó el atajo "Sin gente".**
