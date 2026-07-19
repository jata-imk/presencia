# ADR-005 · Cards de publicación: salida estructurada vía tool call

**Decisión:** La card NO se parsea de texto. Nace de una tool `crear_borrador_publicacion` con schema Zod por arquetipo (visual-first / guion-de-video / texto-first). El modelo llama la tool → JSON tipado → Postgres → el frontend renderiza.

**Razón:** Texto conversacional fluye como texto; contenido estructurado fluye como datos. Parsear con regex es código Hadouken esperando a nacer.

**Contexto de producto:** los tres arquetipos vienen de la jerarquía de redes (ver `docs/explanation/product/presencia-overview.md` §3): Instagram/Facebook visual-first, TikTok guion-de-video, LinkedIn/X/Threads texto-first. No existe una card universal.
