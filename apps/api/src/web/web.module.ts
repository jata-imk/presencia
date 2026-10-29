import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module.js";
import { CreditsModule } from "../credits/credits.module.js";
import { env } from "../env.js";
import { JobsModule } from "../jobs/jobs.module.js";
import {
  BraveSearchProvider,
  FakeSearchProvider,
  SEARCH_PROVIDER,
  type SearchProvider,
} from "./search-provider.js";
import { WebReadDigestService } from "./web-read-digest.service.js";
import { WebReadsRepository } from "./web-reads.repository.js";
import { WebReadsService } from "./web-reads.service.js";
import { WebSearchService } from "./web-search.service.js";

// F10.10 (ADR-028): lo que el chat lee y busca en la web. Las tools las arma
// el chat por turno (read-link.tool.ts, web-search.tool.ts); este módulo les
// da los servicios. La cola de descripciones (WebJobs) se registra en
// ScheduledJobsModule, con las demás.
@Module({
  imports: [AiModule, CreditsModule, JobsModule],
  providers: [
    WebReadsRepository,
    WebReadsService,
    WebReadDigestService,
    WebSearchService,
    {
      // El buscador sale del env (WEB_SEARCH_PROVIDER), como la publicación:
      // env.ts ya exige la key si es el real.
      provide: SEARCH_PROVIDER,
      useFactory: (): SearchProvider =>
        env.WEB_SEARCH_PROVIDER === "brave"
          ? new BraveSearchProvider(env.BRAVE_SEARCH_API_KEY!)
          : new FakeSearchProvider(),
    },
  ],
  exports: [WebReadsService, WebReadDigestService, WebSearchService],
})
export class WebModule {}
