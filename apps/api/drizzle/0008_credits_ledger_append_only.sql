-- Append-only por el motor, no solo por convención (F5, mismo patrón que
-- 0006_rls_ai_usage_events). Hasta ahora credit_ledger confiaba en que nadie
-- escribiera un UPDATE/DELETE — el mismo hueco que ai_usage_events cerró en
-- F4.5. Una corrección de saldo se hace con un asiento "adjustment" nuevo,
-- nunca editando uno viejo.
REVOKE UPDATE, DELETE ON "credit_ledger" FROM presencia_app, presencia_worker;
