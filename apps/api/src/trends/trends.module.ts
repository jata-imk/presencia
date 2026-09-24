import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module.js";
import { BrandVoiceModule } from "../brand-voice/brand-voice.module.js";
import { CreditsModule } from "../credits/credits.module.js";
import { JobsModule } from "../jobs/jobs.module.js";
import { TrendsRepository } from "./trends.repository.js";
import { TrendsService } from "./trends.service.js";

// Sin controller: quien expone las tendencias es Ritmo. Acá vive quién las
// busca y quién las guarda.
//
// Desde F9.6 necesita la voz de marca, y no como detalle: el nicho, la
// audiencia, la región y lo que el usuario haya escrito SON la búsqueda. Sin
// eso el prompt no se puede armar.
//
// CreditsModule desde F9.6: adelantar el refresco lo paga el usuario, y el
// asiento tiene que escribirse en la MISMA transacción que la tanda que lo
// justifica — así que el cobro vive acá adentro, no en quien llama.
//
// TrendsJobs no se declara acá sino en ScheduledJobsModule, que es donde vive
// la lista completa de lo que se agenda: tenerla en un solo lugar es lo que
// evita que el worker y la API terminen corriendo jobs distintos.
@Module({
  imports: [AiModule, JobsModule, BrandVoiceModule, CreditsModule],
  providers: [TrendsRepository, TrendsService],
  exports: [TrendsService, TrendsRepository],
})
export class TrendsModule {}
