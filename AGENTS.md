# Presencia — Guía del proyecto

## Qué es

Presencia es un SaaS conversacional para creators mexicanos: un asistente de contenido que genera, adapta, programa y analiza publicaciones para redes sociales manteniendo la voz del creator. El diferenciador NO es el multi-canal ni la programación (commodity vía PostFast): es la **profundidad cultural** — habla español mexicano (tutea, nunca "vos/querés"), conoce el mercado y el registro del usuario. Beachhead: Mérida/sureste de México.

V1: web app (React) + bot de Telegram, 5 módulos (Chats, Calendario, Ritmo, Analíticas, Biblioteca) + Configuración con Voz de marca. Monetización por créditos (ledger). Producto solo-founder (Jose): decisiones bien razonadas > opciones sin criterio; si algo parece mal pensado, dilo.

## Mapa de documentación (Diátaxis)

| Dónde                         | Qué hay                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `docs/explanation/product/`   | Lore docs: overview (leer primero), chat, calendario, ritmo, configuración/voz de marca |
| `docs/explanation/decisions/` | ADRs 001–013 — fuente de verdad de arquitectura                                         |
| `docs/reference/`             | Contratos: modelo de datos + RLS, infraestructura, design tokens, (futuro) API          |
| `docs/how-to/`                | Recetas operativas: entorno, trabajar con IA, (futuro) deploy y backups                 |
| `docs/tutorials/`             | Vacío hasta que exista código que recorrer                                              |

La gestión de proyecto (roadmap F0–F13) vive en Notion (página "Presencia"). La verdad técnica vive en este repo.

## Stack (ver ADRs para el porqué)

- **Monorepo:** pnpm workspaces + Turborepo. `apps/web` (React + Vite + TS), `apps/api` (NestJS), `packages/shared` (schemas Zod).
- **Datos:** Postgres, multi-tenant por `user_id` + RLS (ADR-003). Jobs con pg-boss (ADR-008).
- **IA:** Vercel AI SDK multi-proveedor — Gemini/OpenAI/MiniMax (ADR-004). Cards por tool call con schema Zod por arquetipo (ADR-005). Streaming por SSE (ADR-006).
- **Auth:** Better Auth, UI propia (ADR-007).
- **Publicación:** PostFast detrás de interfaz `PublishingProvider` (ADR-009). Telegram con grammY detrás de adapter de canal (ADR-010).
- **Infra:** Docker Compose (caddy/app/worker/postgres), Contabo VDS + Object Storage S3 (ADR-011). Dev/prod parity: staging corre el mismo compose que prod.

## Reglas duras (no negociables)

1. **Registro cultural:** todo copy de producto en español mexicano neutro-profesional. Tutear. Nunca "vos/querés".
2. **Tokens, no hex:** ningún color/espaciado hardcodeado en componentes; siempre design tokens (CSS variables / theme de Tailwind).
3. **PostFast es plomería:** nunca llamar su API directo desde lógica de negocio; siempre a través del adapter.
4. **Créditos = ledger:** nunca un contador simple; todo movimiento es un asiento transaccional (ADR-012).
5. **Una sola fuente de verdad por concepto:** voz de marca, conversación canónica, ledger. Los canales (web/Telegram) son adapters sobre el mismo store.
6. **YAGNI:** nada de infra "por si acaso". La lista de lo que NO va en V1 está en el overview §8 — respetarla.
7. **Cambio de arquitectura ⇒ actualizar su ADR** en el mismo PR.

## Convenciones

- Conventional Commits (commitlint lo exige). Código y nombres en inglés; docs de producto en español.
- **GitHub Flow desde F3:** rama por feature → PR contra `main` → CI verde → squash merge. No commitear directo a `main`.
- **NestJS: inyección con `@Inject(X)` explícito** en todo constructor. El runner dev (tsx/esbuild) no emite `emitDecoratorMetadata`, así que Nest no puede inferir tipos: sin el decorator, la dependencia llega `undefined` en dev (y explota en el primer request).
- `pnpm lint && pnpm typecheck` deben pasar antes de commit (husky lo fuerza vía lint-staged).
- Tests con vitest: `pnpm --filter @presencia/api test`. El test de RLS necesita la DB alcanzable (túnel al VPS o compose local) y conecta como `presencia_app`. Bajo carga (dev server + queries manuales compitiendo por el túnel) un fallo aislado de RLS por timeout es esperable: repetir antes de perseguirlo como regresión.
- **Cuenta de dev:** `pnpm --filter @presencia/api seed:dev` crea `dev@presencia.local` / `presencia-dev-1234`, ya verificada y con onboarding cerrado, más datos de ejemplo con la variedad que hace falta para probar el sidebar (un chat fijado, uno en carpeta, uno archivado). `-- --reset` la recrea desde cero. Usarla en vez de los datos reales: son desechables y no hay que restaurarlos después.
- Node 22 (`.nvmrc`), pnpm como único package manager.

## Flujo de una fase (F0–F13)

Lo que funcionó en F6.5 y evitó los problemas de F6. Vale para cualquier fase nueva:

1. **Plan mode primero.** Explorar con agentes en paralelo, cerrar las decisiones de producto con el usuario antes de escribir código, y dejar el plan escrito. Las decisiones que cambian el resultado se preguntan; las que tienen un default obvio se toman y se mencionan.
2. **La spec real vive en `docs/explanation/product/`, no en el ticket de Notion.** Los tickets son de tres o cuatro líneas; los docs de producto tienen los **no-objetivos de V1**, que es justo lo que evita construir de más.
3. **PRs secuenciales, no apilados.** Cada uno sale de `main` fresco y se mergea antes de abrir el siguiente. F6 usó 8 PRs apilados y desapilarlos costó ~2h de conflictos en cadena, más un bug que se coló en un merge auto-resuelto: al squashear el padre, el hijo ve "cambios en ambos lados" en todo lo que el padre ya traía.
4. **Verificar en el navegador, no solo compilar.** `typecheck` y `build` en verde no dicen nada sobre si la pantalla se ve bien. Cada PR de UI se prueba con Playwright en los anchos que toca, y en los dos temas si agrega superficie nueva. Preferir aserciones sobre el DOM antes que sobre el estado interno: un `import()` dinámico de un store de zustand en la consola crea una **instancia separada**, no la de la app.
5. **Docs y ADR en el mismo PR que el cambio** (regla dura #7). Si un comentario del código queda mintiendo después del cambio, se reescribe en el mismo PR — un comentario falso es peor que ninguno.
6. **`/code-review` antes de decir "listo", no después.** En F6.5 se corrió al final y encontró 9 hallazgos reales, incluido uno que ya se había reportado como arreglado. Conviene `medium` por PR antes de mergear y `high` sobre el rango completo al cerrar la fase.
7. **Al cerrar:** Notion a Done con lo que se decidió y lo que se difirió, y memoria del proyecto actualizada.
