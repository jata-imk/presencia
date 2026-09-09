# ADR-019 · Repositorio público, con la receta cultural adentro

**Decisión:** el repo sigue **público** (LICENSE propietario, todos los derechos reservados), incluyendo el ensamblado del system prompt (`chat/system-prompt.ts`) y la suite de regresión cultural (`scripts/cultural-suite/`). No se mueven a un submódulo privado ni a variables de entorno.

**Razón:** el foso de Presencia es acumulativo, no textual. Un prompt se lee y se copia en una tarde; lo que no se copia es el historial que hace que el sistema conozca a un usuario en la semana 8 mejor que en la semana 1 — el ciclo Analíticas → Voz → Ritmo. Tratar el prompt como receta secreta protegería lo barato de imitar y daría una falsa sensación de ventaja sobre lo que sí importa. A cambio, el repo sirve de portafolio, que es un valor real y presente para un proyecto solo-founder pre-lanzamiento.

**Descartado:**

- **Submódulo privado para la suite y el prompt** — parte el repo en dos para proteger algo que un competidor puede reconstruir observando el output del producto. El costo de operación (dos repos, dos permisos, CI que necesita ambos) se paga desde el día uno; el beneficio es hipotético.
- **Prompt en variables de entorno** — peor: convierte texto versionado y revisable en configuración opaca, y el prompt cultural es justo lo que más conviene tener en el diff cuando cambia.
- **Repo privado completo** — pierde el uso de portafolio sin proteger nada distinto.

**Lo que esta decisión NO cubre:** secretos de verdad (API keys, tokens, el `.env`) siguen fuera del repo, como siempre. Y si algún día el diferenciador se vuelve un modelo entrenado o un dataset propio, esto se reevalúa — la lógica de arriba depende de que la receta sea reproducible por observación, y un artefacto entrenado no lo es.

**Contexto:** discutido el 2026-09-08 al revisar Postiz como competidor (self-hosted AGPL con generación por IA, mismo Chat + Calendario). La conclusión de esa revisión es la que sostiene este ADR: Chat y Calendario son el precio de entrada, no el diferenciador, así que publicarlos no regala nada que no estuviera ya disponible.
