# ADR-012 · Créditos: ledger contable transaccional

**Decisión:** Tabla de asientos (movimientos +/−) con decremento transaccional. Nunca un contador simple.

**Razón:** Un contador se corrompe con race conditions. El ledger da auditabilidad (qué acción costó qué) que la UI de transparencia de créditos ya exige (indicador en sidebar, costo estimado junto al botón de enviar, banner al 20%).
