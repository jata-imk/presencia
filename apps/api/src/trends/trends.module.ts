import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module.js";
import { JobsModule } from "../jobs/jobs.module.js";
import { TrendsRepository } from "./trends.repository.js";
import { TrendsService } from "./trends.service.js";

// Sin controller todavía: F9 PR 3 deja la caché y quien la llena. El camino de
// lectura —y el "Actualizar" de la pantalla— llegan con los endpoints de
// Ritmo, que son su propio PR.
//
// TrendsJobs no se declara acá sino en ScheduledJobsModule, que es donde vive
// la lista completa de lo que se agenda: tenerla en un solo lugar es lo que
// evita que el worker y la API terminen corriendo jobs distintos.
@Module({
  imports: [AiModule, JobsModule],
  providers: [TrendsRepository, TrendsService],
  exports: [TrendsService, TrendsRepository],
})
export class TrendsModule {}
