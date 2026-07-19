# ADR-010 · Canales de mensajería: Telegram primero, con adapter de canal

**Decisión:** Bot con grammY vía webhook al mismo backend. La conversación canónica vive en Postgres; web/Telegram/WhatsApp son adapters sobre el mismo store.

**Razón:** La sync multi-canal sale gratis por arquitectura (una sola fuente de verdad), no por sincronización forzada. Telegram = gratis y desacoplado de Meta (decisión de producto cerrada: Meta compró Manus y lo mete nativo en WhatsApp; no construir el diferenciador en cancha del rival). WhatsApp se suma cuando haya tracción para bancar el costo por conversación.
