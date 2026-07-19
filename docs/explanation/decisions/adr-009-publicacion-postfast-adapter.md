# ADR-009 · Publicación: PostFast detrás de patrón adapter

**Decisión:** Interfaz propia `PublishingProvider`; `PostFastProvider` como implementación (REST/MCP de postfa.st).

**Razón:** Depender de una API indie es single point of failure. No casarse con el proveedor.

**Implicación de posicionamiento:** el valor de Presencia NO puede estar en programar/publicar (eso es commodity que PostFast revende por ~€10/mes). El valor está exclusivamente en la capa conversacional + cultural que ponemos encima.
