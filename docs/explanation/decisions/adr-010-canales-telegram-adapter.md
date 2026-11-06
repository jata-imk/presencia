# ADR-010 · Canales de mensajería: Telegram primero, con adapter de canal

**Decisión:** Bot con grammY vía webhook al mismo backend. La conversación canónica vive en Postgres; web/Telegram/WhatsApp son adapters sobre el mismo store.

**Razón:** La sync multi-canal sale gratis por arquitectura (una sola fuente de verdad), no por sincronización forzada. Telegram = gratis y desacoplado de Meta (decisión de producto cerrada: Meta compró Manus y lo mete nativo en WhatsApp; no construir el diferenciador en cancha del rival). WhatsApp se suma cuando haya tracción para bancar el costo por conversación.

## Addendum (2026-11-05, F11) — construido

El detalle vive en [ADR-030](./adr-030-canal-telegram.md). Lo que cambió respecto de estas líneas:

- **Webhook en producción, polling solo en dev,** con un bot de dev aparte: un bot no puede tener webhook y polling a la vez, y la laptop no tiene URL pública. `env.ts` prohíbe el polling en producción.
- **El "adapter" resultó ser el `TurnSink`** (`chat/turn-sink.ts`, PR #203): el turno del chat habla con un sink y no con la respuesta HTTP, y Telegram pone el suyo (`TelegramSink`). No hay una abstracción de "capacidades por canal": con un solo canal además de la web sería infra por si acaso (regla dura #6). Si llega otro, se extrae de lo que tengan en común los dos.
- **WhatsApp ya no "se suma cuando haya tracción":** necesita su propio ADR. Desde el 2026-01-15, la política de Meta prohíbe asistentes de propósito general en la Business API, y sin temas ni drafts ni botón de detener el flujo sería otro (ADR-030, "Riesgo anotado"). Queda después del MVP, junto a la app móvil.
