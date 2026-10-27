import { Module } from "@nestjs/common";
import { AttachmentsJobs } from "../attachments/attachments.jobs.js";
import { AttachmentsModule } from "../attachments/attachments.module.js";
import { BackupsJobs } from "../backups/backups.jobs.js";
import { BackupsModule } from "../backups/backups.module.js";
import { CardsJobs } from "../cards/cards.jobs.js";
import { CardsModule } from "../cards/cards.module.js";
import { ChatJobs } from "../chat/chat.jobs.js";
import { ChatModule } from "../chat/chat.module.js";
import { CreditsJobs } from "../credits/credits.jobs.js";
import { CreditsModule } from "../credits/credits.module.js";
import { ImagesJobs } from "../images/images.jobs.js";
import { ImagesModule } from "../images/images.module.js";
import { MetricsJobs } from "../metrics/metrics.jobs.js";
import { MetricsModule } from "../metrics/metrics.module.js";
import { TrendsJobs } from "../trends/trends.jobs.js";
import { TrendsModule } from "../trends/trends.module.js";
import { WebJobs } from "../web/web.jobs.js";
import { WebModule } from "../web/web.module.js";
import { JobsModule } from "./jobs.module.js";

// Todo lo que se agenda, en un solo lugar. Lo importan los DOS entrypoints:
// worker.ts siempre, y main.ts solo cuando WORKER_INLINE está encendido. Tener
// la lista una sola vez es lo que evita que el worker y la API terminen
// corriendo jobs distintos sin que nadie lo note.
@Module({
  imports: [
    JobsModule,
    CardsModule,
    CreditsModule,
    BackupsModule,
    MetricsModule,
    TrendsModule,
    ImagesModule,
    ChatModule,
    AttachmentsModule,
    WebModule,
  ],
  providers: [
    CardsJobs,
    CreditsJobs,
    BackupsJobs,
    MetricsJobs,
    TrendsJobs,
    ImagesJobs,
    ChatJobs,
    AttachmentsJobs,
    WebJobs,
  ],
})
export class ScheduledJobsModule {}
