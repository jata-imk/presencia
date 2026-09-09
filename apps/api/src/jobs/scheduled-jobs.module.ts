import { Module } from "@nestjs/common";
import { CardsJobs } from "../cards/cards.jobs.js";
import { CardsModule } from "../cards/cards.module.js";
import { CreditsJobs } from "../credits/credits.jobs.js";
import { CreditsModule } from "../credits/credits.module.js";
import { JobsModule } from "./jobs.module.js";

// Todo lo que se agenda, en un solo lugar. Lo importan los DOS entrypoints:
// worker.ts siempre, y main.ts solo cuando WORKER_INLINE está encendido. Tener
// la lista una sola vez es lo que evita que el worker y la API terminen
// corriendo jobs distintos sin que nadie lo note.
@Module({
  imports: [JobsModule, CardsModule, CreditsModule],
  providers: [CardsJobs, CreditsJobs],
})
export class ScheduledJobsModule {}
