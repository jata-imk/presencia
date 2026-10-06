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

## Addendum (2026-09-29, F10.6 PR1) — estilos visuales

El QA de F10 dejó ver que el estilo lo decidía el chat: el `.describe` de `imagePrompt` pedía "qué se ve, dónde y con qué luz", y el modelo rellenaba con paletas y técnicas que nadie pidió ("acentos neón"). Ahora el estilo es del creator.

- **Catálogo único** en `packages/shared/src/image-styles.ts` (`IMAGE_STYLES`): 7 estilos (Fotográfico natural, Ilustración, Minimalista, Neobrutalismo, Bento grid, Glassmorfismo, Material) con nombre, descripción y "funciona bien para" (lo que ve el creator, del diseño de Claude Design) y el texto que se le pide al generador. Configuración, el chip del panel y la API leen del mismo arreglo.
- **Dónde vive:** `brand_voices.image_style` (null = Fotográfico natural). Se guarda con el PATCH de la Voz de marca que ya existía. No entra al prompt del chat.
- **El chat describe el qué.** Los `.describe` de `imagePrompt` piden sujeto, escena y composición, sin estilo, técnica, paleta ni luz. `composeImagePrompt(description, voice, style?)` agrega el estilo **condicionado**, como antes: "salvo que la descripción pida otro". Si el creator escribe "estilo acuarela", manda lo que escribió.
- **El estilo abre el prompt** y la descripción va después, marcada como "qué se ve". Con el estilo al final, Gemini lo perdía contra la escena: "un café en el centro de Mérida" salía foto aunque se pidiera minimalista o 3D. Lo mostraron las imágenes de ejemplo, no un test.
- **"Sin texto ni logotipos" se separó del estilo** (`NO_TEXT_NO_LOGOS`) y va con todos. Antes estaba pegado al texto de la foto, así que cambiar de estilo lo habría perdido.
- **Estilo por imagen:** `POST /cards/:id/images` acepta `style` y el job lo guarda (`CardImageJob.style`). Sin `style`, se usa el de la voz. El chip "Estilo: X" del composer (F10.6 PR2) arranca en el estilo del último trabajo de la card o, si no hay, en el de la voz (`ImagesConfigDto.defaultStyle`), y lo manda siempre: "Regenerar" repite el estilo de la imagen aunque el default cambie después. Cambiar el chip no genera nada; aplica al siguiente click.
- **3D se sacó de V1** (estaba en el diseño). Con Gemini 3.1 Flash Image, las escenas de comida o de lugar salían como foto en tres versiones del texto, y en una hasta escribió "MÉRIDA" en la taza. Con persona y producto sí funcionaba, pero la galería no puede prometer un estilo que sale a veces. Vuelve cuando un generador lo entregue. Un `"3d"` ya guardado se lee como null (Fotográfico).
- **Ejemplos de la galería:** 28 imágenes fijas (7 estilos × escena base, comida, persona y producto) en `apps/web/public/assets/estilos/`, generadas **una vez** con el prompt compuesto real por `scripts/image-bakeoff/estilos.ts` (~$1.75 con Gemini 3.1 Flash Image). Si se cambia el texto de un estilo, se regeneran sus cuatro (`IMAGE_ESTILOS=neo pnpm --filter @presencia/api estilos:imagenes`): la galería tiene que mostrar lo que el creator va a obtener. Cada imagen deja su prompt exacto, el modelo y la fecha en `assets/estilos/manifest.json` (versionado), y el original en tamaño completo en `scripts/image-bakeoff/out/estilos/` (gitignored). Los originales de la primera tanda no se guardaron.

## Addendum (2026-09-30, F10.6 PR3) — carrusel: modelo y API

- **`content.slides` junto a `assetIds`, no en su lugar.** Cada slide es `{ id, imagePrompt?, assetId? }`, en orden; `assetIds` se deriva al escribir. Publicar y las vistas previas siguen leyendo `assetIds`. Una imagen suelta es un carrusel de uno (`slidesOf`, con un id fijo), así "agregar slide" conserva la imagen que ya estaba como portada, y quitar slides hasta dejar uno vuelve a imagen suelta.
- **Un trabajo, varios slides.** La card sigue teniendo un solo trabajo de imagen a la vez (el candado de F10). En vez de una espera por slide, un trabajo trae una fila de `image_generations` por imagen, cada una con su `slide_id`, y al cerrar cada slide recibe la primera imagen que salió para él (`finishImageJob` aplica `placeImage` sobre la fila bloqueada). Cada fila apunta a su slide por id, incluso la imagen suelta (`FIRST_SLIDE_ID`): si la card se vuelve carrusel o se reordena mientras genera, la imagen igual llega a su slide. Mientras corre un trabajo no se puede quitar ningún slide, porque quitar uno puede devolver la card a imagen suelta y la imagen, ya cobrada, se quedaría sin lugar. Agregar y reordenar sí se permiten: no cambian ids. Subir o elegir a un slide que no existe es 404.
- **Cobro:** la portada genera dos variantes (4.7%) y cualquier otro slide una (2.3%), por decisión del founder. Se cobra por imagen entregada, como siempre.
- **El prompt es del slide.** En un carrusel, "Generar" exige `slideIds` y cada imagen usa el `imagePrompt` de su slide (se edita con `PATCH /cards/:id/slides/:slideId`). El estilo es uno por trabajo.
- **Endpoints:** `POST /cards/:id/slides` (con tope por red, `NETWORK_MAX_IMAGES`), `PATCH /cards/:id/slides/:slideId`, `DELETE /cards/:id/slides/:slideId` y `PATCH /cards/:id/slides/order` (una permutación completa; si el carrusel cambió en otra pestaña, 409). Subir (`?slideId=`), elegir (`slideId`) y ajustar (`slideId`) apuntan a un slide; sin él, a la portada.
- **Las versiones de texto no incluyen `slides`**, igual que no incluyen `assetIds`: restaurar el texto no cambia imágenes que costaron cuota.
- **Pendiente:** los topes por red se confirman contra los openapi de PostFast y Upload-Post al publicar (PR6); las tools del chat no ven `slides` hasta PR5.

## Addendum (2026-09-30, F10.6 PR4a) — el carrusel en el panel y el recorte

- **Una proporción por carrusel** (`content.slidesAspect`, "Recorte: 4:5 / 1:1"): Instagram recorta todo el carrusel a la del primer slide, así que se elige una para todos. En un carrusel, generar usa esa y no la del body.
- **Recortar hace copias, siempre desde la original:** `PATCH /cards/:id/slides/aspect` recorta al centro (`fitToAspect`) las imágenes que no están en la proporción y pone la copia en su slide. Cada copia guarda de dónde salió (`assets.metadata.croppedFrom`), y un recorte posterior parte de ESA original: 4:5 → 1:1 → 4:5 regresa a la original en vez de cortar dos veces. Lo que ya se ve en la proporción no se copia. No mientras corre un trabajo de imagen (se revisa otra vez con la card bloqueada). El recorte libre arrastrando queda en backlog.
- **Todo lo que entra a un carrusel respeta su proporción:** al volverse carrusel, la proporción sale de la imagen que ya tenía (la portada), no de la primera de la red. Subir a un slide guarda la original y coloca una copia recortada. "Ajustar" y los slides que genera el worker usan la proporción que el carrusel tenga en ese momento.
- **El panel reutiliza las piezas de imagen de siempre.** El slide elegido muestra el composer, las versiones, "Ajustar" y el texto alternativo, con acciones apuntadas a ese slide (`CarouselActions.mediaFor`). El precio que anuncia es el del slide: 4.7% la portada, 2.3% los demás. Mientras otro slide genera, los demás esperan (la card tiene un trabajo a la vez).
- **Reordenar:** arrastrar con mouse, o las flechas del slide elegido (teclado y touch, donde el drag de HTML5 no existe).
- **"Generar las que faltan":** los slides con prompt y sin imagen, en un solo trabajo, con el precio sumado a la vista antes del click.

## Addendum (2026-09-30, F10.6 PR4b) — vistas previas con varias imágenes

La vista previa acomoda las imágenes como cada red (`PreviewMedia`): Instagram de una en una, con flechas, puntos y "1/5", en un hueco fijo con la proporción del carrusel y las demás precargadas; Facebook y LinkedIn con una grande y el resto en fila ("+N" en la última visible); X en mosaico de hasta 4 en un marco 16:9; Threads en una tira que se desliza. Fiel en disposición, no en píxeles. La card compacta del chat marca "1/5" en la miniatura de un carrusel.

## Addendum (2026-09-30) — lo que de verdad cuesta una imagen, y el panorama

- **Una imagen 4:5 de Gemini 3.1 Flash Image cuesta ~$0.095, no $0.067.** Google cobra por tokens de salida ($60/M), y la 4:5 (928×1152) sale en ~1,580 tokens contra los 1,120 del 1K cuadrado de su tabla. Lo midió `pnpm --filter @presencia/api gasto` sobre `ai_usage_events` (ver `docs/how-to/ver-el-gasto-en-modelos.md`). Los precios viven en `apps/api/src/ai/model-prices.ts`.
- **Panorama de modelos al 2026-09-30:** `docs/reference/modelos-de-imagen-2026-09.md`. Nano Banana 2 ya no está en la frontera calidad/precio. Grok Imagine Image 2.0, MAI-Image-2.6 y Muse Image entran al próximo bake-off (backlog "Modelo principal + fallbacks").

## Addendum (2026-10-04, F10.6.1 PR3) — versiones por slide

En el recorrido de F10.6, cada slide mostraba "Versiones · 18": la tira traía todas las imágenes de la card, de todos los slides, y no se sabía cuáles eran de cuál. Ahora cada imagen guarda su slide (`assets.slide_id`, migración 0044) y la tira de un slide muestra solo las suyas.

- **Por id del slide, no por posición.** El id no cambia al reordenar ni al volverse carrusel (la imagen suelta ya era `FIRST_SLIDE_ID`), así que mover un slide a portada se lleva su historial. Se descartó filtrar por posición: reordenar habría cambiado de quién es cada versión.
- **Dónde se anota.** Lo generado y lo editado copian el `slide_id` de su fila de `image_generations`, que ya lo tenía desde F10.6 PR3. Lo subido lleva el slide al que se subió; sin slide, la portada. Un recorte lleva el slide de la imagen que reemplaza, y su original, el mismo.
- **Lo de antes.** El backfill llena lo que se puede deducir: desde las generaciones, desde dónde está puesta hoy cada imagen, y entre recorte y original. Lo que queda es historial de imagen suelta de antes de F10.6, y va a `FIRST_SLIDE_ID`, el id que esa imagen conserva al volverse carrusel; en un carrusel que nació carrusel, a su portada de entonces. Se ancla a un **id**, no a "la portada de hoy": la primera versión de esta regla dejaba el null y lo asignaba a la posición 0, y reordenar le pasaba el historial de la imagen original a otro slide (lo encontró el `/code-review`). Nada desaparece de la vista.
- **Siempre la imagen actual.** Aunque no sea "del slide" (alguien la eligió de otro lado), la tira la incluye para poder marcarla como la elegida.
- **Un recorte no es una versión nueva (F10.6.2).** Una imagen y sus recortes de proporción (`croppedFrom`, que el DTO ya expone) ocupan una sola miniatura: la que el slide tiene ahora; si no, la más reciente en la proporción del carrusel (el DTO trae `width`/`height`; elegir una versión no recorta, así que una de otra proporción quedaría mal puesta); si no, la más reciente. Antes, cambiar 4:5 ↔ 1:1 sumaba una versión por slide.
- La regla vive en `versionsOfSlide` (web, con su test) y la API solo agrega `slideId` a `CardImageVersionDto`: el historial completo de la card sigue disponible para Biblioteca (F12).

## Addendum (2026-10-05, F10.7 PR1) — una respuesta sin imagen no se repite

Desde `ai` 7.0.1xx, `generateImage` vuelve a llamar al modelo cuando responde sin imagen, salvo que el proveedor la marque `isRetryable: false` (Google lo hace solo con su filtro de contenido). Eso habría cambiado dos reglas de este ADR sin decidirlo: un bloqueo que Gemini no marca como filtro se cobraría hasta tres veces, y la respuesta vacía sin señal —que es del usuario reintentar— la repetiría el adapter. El middleware que ya guardaba el usage marca toda respuesta sin imagen como no reintentable. Los errores de API (red, 5xx) siguen con los reintentos del SDK, como antes; F10.7 los reemplaza por la cadena de respaldo.
