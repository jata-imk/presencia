# ADR-002 · Arquitectura: monolito modular

**Decisión:** Un solo deploy, módulos con fronteras claras adentro: chat, créditos, publicación, canales, ritmo, voz-de-marca.

**Razón:** Fundador solo / equipo chico. Microservicios = latencia de red + complejidad distribuida a cambio de nada en esta escala.

**Descartado:** Microservicios.
