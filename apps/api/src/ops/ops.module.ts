import { Module } from "@nestjs/common";
import { OpsAlertSender } from "./alert-sender.js";
import { OpsAlertsRepository } from "./ops-alerts.repository.js";
import { OpsAlertsService } from "./ops-alerts.service.js";

// Alertas de operación (F12.8, ADR-031). Corre donde corren los jobs (el
// worker en prod, la API con WORKER_INLINE en dev): lo importa
// ScheduledJobsModule, no AppModule.
@Module({
  providers: [OpsAlertsRepository, OpsAlertSender, OpsAlertsService],
  exports: [OpsAlertsService],
})
export class OpsModule {}
