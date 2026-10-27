import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module.js";
import { CreditsModule } from "../credits/credits.module.js";
import { JobsModule } from "../jobs/jobs.module.js";
import { WebReadDigestService } from "./web-read-digest.service.js";
import { WebReadsRepository } from "./web-reads.repository.js";
import { WebReadsService } from "./web-reads.service.js";

// F10.10 (ADR-028): lo que el chat lee de la web. La tool la arma el chat por
// turno (read-link.tool.ts); este módulo le da el servicio que pide y guarda,
// y la descripción de las páginas viejas. Su cola (WebJobs) se registra en
// ScheduledJobsModule, con las demás.
@Module({
  imports: [AiModule, CreditsModule, JobsModule],
  providers: [WebReadsRepository, WebReadsService, WebReadDigestService],
  exports: [WebReadsService, WebReadDigestService],
})
export class WebModule {}
