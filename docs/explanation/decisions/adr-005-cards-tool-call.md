# ADR-005 · Cards de publicación: salida estructurada vía tool call

**Decisión:** La card NO se parsea de texto. Nace de una tool `crear_borrador_publicacion` con schema Zod por arquetipo (visual-first / guion-de-video / texto-first). El modelo llama la tool → JSON tipado → Postgres → el frontend renderiza.

**Razón:** Texto conversacional fluye como texto; contenido estructurado fluye como datos. Parsear con regex es código Hadouken esperando a nacer.

**Contexto de producto:** los tres arquetipos vienen de la jerarquía de redes (ver `docs/explanation/product/presencia-overview.md` §3): Instagram/Facebook visual-first, TikTok/YouTube guion-de-video, LinkedIn/X/Threads texto-first. No existe una card universal.

**Implementación (F3, 2026-07-21):** no es una sola tool `crear_borrador_publicacion` con `cardContentSchema` (discriminatedUnion) como inputSchema. Medido con keys reales contra Gemini 3.5 Flash, Claude Haiku 4.5 y DeepSeek V4 Flash (`docs/reference/suite-cultural/2026-07-22-reporte.md`), los 3 proveedores generan tool calls con input inválido en la mayoría de los intentos contra ese schema — el modelo tiene que elegir la rama correcta de contenido Y no mezclar campos de otras ramas, y falla eso consistentemente.

En su lugar, **3 tools separadas, una por arquetipo**: `crear_borrador_visual` (Instagram/Facebook), `crear_borrador_video` (TikTok/YouTube), `crear_borrador_texto` (LinkedIn/Threads/X). El modelo no llena un objeto con reglas condicionales — elige cuál tool llamar, y esa elección es la inferencia del arquetipo. Cada tool reusa tal cual el schema de contenido existente (`visualFirstContentSchema`, `videoScriptContentSchema`, `textFirstContentSchema` en `packages/shared/src/publication.ts`), solo omitiendo `archetype` (lo determina la tool que corrió) y `assetIds` (adjuntar assets de Biblioteca es posterior a F3, siempre `[]`) — sin capa de reconciliación entre lo que ve el modelo y lo que se persiste.

Si `execute()` truena (input incoherente, ej. Zod rechaza un campo requerido), el error sube al modelo como tool-error part y puede reintentar dentro de los steps que quedan (`stopWhen: stepCountIs(5)` en `chat.service.ts`) — nunca se descarta silenciosamente ni se inserta una card parcial.
