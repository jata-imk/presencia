# Cómo trabajar con IA en este repo

Este repo está optimizado para desarrollo asistido por agentes (Claude Code). El "RAG" del proyecto es deliberadamente simple: documentación bien estructurada (Diátaxis) + búsqueda léxica nativa del agente. Sin vector DB hasta que la doc lo pida.

## Convenciones

1. **`CLAUDE.md` es el índice.** Todo agente empieza ahí. Si agregas un área nueva de docs, actualiza su tabla.
2. **Diátaxis decide dónde va cada doc:**
   - _Tutorial_ — aprender haciendo, paso a paso, para alguien nuevo.
   - _How-to_ — receta para lograr una tarea concreta (levantar entorno, deploy).
   - _Reference_ — descripción exacta de un contrato (modelo de datos, API, tokens).
   - _Explanation_ — el porqué: producto (lore docs) y decisiones (ADRs).
3. **Cambio de arquitectura ⇒ ADR actualizado en el mismo PR.** Si la decisión reemplaza a otra, nuevo ADR que la marca como reemplazada; no se borra historia.
4. **Notion es gestión, el repo es verdad técnica.** Tareas y roadmap en Notion; contratos y decisiones aquí.

## MCPs del proyecto

| MCP        | Estado                                               | Uso                                                                                           |
| ---------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Notion     | Conectado                                            | Roadmap F0–F13, notas de producto                                                             |
| GitHub     | Vía `gh` CLI (instalar: `winget install GitHub.cli`) | PRs, issues, CI                                                                               |
| Playwright | Pendiente (agregar en F1 cuando exista UI)           | Tests e2e y verificación visual. `claude mcp add playwright -- npx -y @playwright/mcp@latest` |

## Suite de regresión cultural (desde F3)

~10 prompts en registro mexicano "de barrio" versionados en el repo, corridos contra cada proveedor de IA (ADR-004). El moat cultural se valida por proveedor, no se asume.
