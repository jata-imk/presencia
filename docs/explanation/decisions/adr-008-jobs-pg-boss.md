# ADR-008 · Jobs programados: pg-boss sobre Postgres

**Decisión:** pg-boss como job queue (tendencias de Ritmo, agregación de horarios, resets de créditos, procesamiento Telegram). Worker = misma imagen Docker que la app, distinto entrypoint.

**Razón:** Postgres como base Y cola = menos piezas móviles. Reintentos + visibilidad que un crontab no da.

**Descartado:**

- Crontab de Linux — frágil.
- BullMQ + Redis — migración futura solo si el volumen lo pide.

**Nota:** la publicación programada NO es cron propio — la hace PostFast vía su API (ver [ADR-009](./adr-009-publicacion-postfast-adapter.md)).
