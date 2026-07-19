# Infraestructura V1

> Referencia migrada del Design Doc de Notion (2026-07-14). Costo total ≈ **€36/mes**.

## Producción — Contabo Cloud VDS S (€27.52/mes, contrato 12m)

- 3 núcleos físicos AMD EPYC 7282 2.8 GHz (= 6 vCPU con SMT), 24 GB RAM, 180 GB NVMe, 250 Mbit/s, tráfico ilimitado.
- Suficiente para 20–50 clientes con holgura: carga I/O-bound (la inferencia pesada ocurre en los proveedores de IA). Presupuesto real bajo carga: ~6–8 GB RAM.
- Datacenter: preferir EE.UU. (latencia hacia México) sobre Alemania.
- **Elegir NVMe siempre** (Postgres vive de la latencia de disco).

## Staging/QA — Contabo Cloud VPS 10 (€5.50/mes)

- 4 vCPU compartidas, 8 GB RAM. En QA el noisy neighbor da igual.
- **Regla de oro (dev/prod parity):** staging corre EXACTAMENTE el mismo `docker-compose.yml` que prod, solo cambia el `.env`.
- Usos: CI, QA manual con URL compartida, webhooks de Telegram (URL pública), ensayo de deploys. El desarrollo diario es local (`docker compose up`).

## Object Storage — ~€3/mes

- R2 o Contabo Object Storage (250 GB desde ~$3). Buckets: assets de Biblioteca (prefijo por usuario) + backups. Ver ADR-011.

## Contenedores (por servicio, NO por cliente)

```
caddy      → reverse proxy + TLS automático
app        → NestJS: API, SSE del chat, webhook Telegram
worker     → misma imagen, otro comando: consume pg-boss
postgres   → datos de TODOS, aislados por user_id + RLS
```

## Backups y riesgos aceptados

- **SPOF aceptado en V1:** un solo VDS. Mitigación obligatoria: snapshots del proveedor + `pg_dump` diario (job de pg-boss) hacia el bucket externo. _El backup que vive en el mismo servidor no es backup, es decoración._
- Soporte Contabo por tickets (horas–1 día): snapshot antes de cada cambio gordo.
- El cuello de botella esperado NO es el fierro: son los rate limits de los proveedores de IA. Camino de escala: resize del VDS → Postgres a caja propia/managed. Nunca microservicios/K8s por reflejo.

## Principios de ejecución

1. **Esqueleto andante primero (F1):** el hilo más delgado que atraviese todas las capas (login → mensaje → LLM → SSE → Postgres → deploy en staging).
2. **Prioridad por dependencia y frecuencia de uso**, no por afinidad.
3. **YAGNI hasta que duela.**
4. **Una sola fuente de verdad por concepto.**
