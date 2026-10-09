# Cómo trabajar con IA en este repo

Este repo está optimizado para desarrollo asistido por agentes (Claude Code, Codex, Cursor, Gemini CLI: todos leen `AGENTS.md`). El "RAG" **de la documentación** es deliberadamente simple: docs bien estructuradas (Diátaxis) + búsqueda léxica nativa del agente, sin índice vectorial para los docs. (El producto sí usa pgvector, para la memoria entre chats del creator; eso es otra cosa, ver ADR-004 addendum F10.8.)

## Convenciones

1. **`AGENTS.md` es el índice.** Todo agente empieza ahí (`CLAUDE.md` solo apunta a él, para que Claude Code, Codex, Cursor y Gemini CLI lean la misma fuente). Si agregas un área nueva de docs, actualiza su tabla.
2. **Diátaxis decide dónde va cada doc:**
   - _Tutorial_ — aprender haciendo, paso a paso, para alguien nuevo.
   - _How-to_ — receta para lograr una tarea concreta (levantar entorno, deploy).
   - _Reference_ — descripción exacta de un contrato (modelo de datos, API, tokens).
   - _Explanation_ — el porqué: producto (lore docs) y decisiones (ADRs).
3. **Cambio de arquitectura ⇒ ADR actualizado en el mismo PR.** Si la decisión reemplaza a otra, nuevo ADR que la marca como reemplazada; no se borra historia.
4. **Notion es gestión, el repo es verdad técnica.** Tareas y roadmap en Notion; contratos y decisiones aquí.

## MCPs del proyecto

| MCP           | Estado                                       | Uso                                                                               |
| ------------- | -------------------------------------------- | --------------------------------------------------------------------------------- |
| Notion        | Conectado                                    | Roadmap F0–F13, backlog (Smart List: Someday), notas de producto                  |
| GitHub        | `gh` CLI con sesión, y MCP oficial de GitHub | PRs, issues y CI (`gh pr create`, `gh pr checks --watch`, `gh pr merge --squash`) |
| Playwright    | Conectado                                    | Tests e2e y verificación visual                                                   |
| Claude Design | Conectado, global (`-s user`)                | Ver sección "Claude Design" abajo                                                 |

## Claude Design

Cada módulo de producto (Chat, Voz de marca, Onboarding, Calendario, Ritmo, ...) es un **proyecto separado** en [claude.ai/design](https://claude.ai/design), no un solo design system. El MCP `claude-design` (`https://api.anthropic.com/v1/design/mcp`, registrado global vía `claude mcp add --transport http claude-design https://api.anthropic.com/v1/design/mcp -s user`) da acceso de lectura/escritura a esos proyectos: `list_projects`, `read_file`, `write_files`, `render_preview`, entre otros.

**Requiere `/design consent` una vez por sesión/máquina** — el agente no puede otorgarlo, hay que correrlo a mano antes de que las llamadas al MCP funcionen.

**Política de reconciliación (decidida 2026-08-09, ver tarea F13 en Notion):** cada módulo hace su pase de Claude Design (tokens + componentes + gaps de campos) **en su propio PR**, cuando ese módulo se construye — no antes (el diseño puede ir adelantado a la fase, como pasa hoy con partes de Chat) ni en un batch al final. Si un módulo se construyó con UI cruda, la reconciliación es un PR chico aparte. Cada tarea de fase en Notion trae su nota de qué proyecto de Claude Design le corresponde revisar, o si el módulo todavía no tiene diseño (Analíticas, Biblioteca) y hay que pedírselo a Jose antes de construir su UI.

Los archivos son formato `.dc.html` (HTML entity-escaped, con lógica embebida en `<script type="text/x-dc">`) — léelos completos antes de resumir; algunos superan el límite de tokens de una sola respuesta del MCP y se cachean localmente para leer en chunks con el tool `Read`.

## Suite de regresión cultural

Prompts en registro mexicano "de barrio" versionados en `apps/api/scripts/cultural-suite/`, corridos contra cada modelo candidato (ADR-004): `pnpm --filter @presencia/api suite:cultural` (registro y calidad) y `suite:voz-prohibida` (palabras que la Voz de marca prohíbe). Los reportes viven en `docs/reference/suite-cultural/`. El moat cultural se valida por modelo, no se asume: un modelo entra a la cadena del chat solo si pasa la suite (así se eligió Luna en F10.7).
