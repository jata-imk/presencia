import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module.js";
import { AssetsModule } from "../assets/assets.module.js";
import { BrandVoiceModule } from "../brand-voice/brand-voice.module.js";
import { CardsModule } from "../cards/cards.module.js";
import { CreditsModule } from "../credits/credits.module.js";
import { JobsModule } from "../jobs/jobs.module.js";
import { createImageModelResolver, DEFAULT_IMAGE_MODEL_ID } from "../ai/provider-registry.js";
import { env } from "../env.js";
import { AiSdkImageProvider } from "./ai-sdk-image.provider.js";
import { FakeImageProvider } from "./fake-image.provider.js";
import { ImageGenerationService } from "./image-generation.service.js";
import { ImageGenerationsRepository } from "./image-generations.repository.js";
import { IMAGE_PROVIDERS, type ImageProviders } from "./image-provider.js";
import { ImagesController } from "./images.controller.js";

// Factory por env (ADR-025), mismo patrón que PublishingModule. env.ts ya
// validó al boot formato y key de los dos modelos, así que resolverlos acá no
// puede fallar por configuración.
export function buildImageProviders(): ImageProviders {
  if (env.IMAGE_PROVIDER === "fake") {
    return {
      primary: new FakeImageProvider(env.IMAGE_FAKE_DELAY_MS),
      alternate: new FakeImageProvider(env.IMAGE_FAKE_DELAY_MS),
    };
  }
  const resolve = createImageModelResolver(process.env);
  const primaryId = env.AI_MODEL_IMAGE ?? DEFAULT_IMAGE_MODEL_ID;
  const alternateId = env.AI_MODEL_IMAGE_ALT;
  return {
    primary: new AiSdkImageProvider(resolve(primaryId), primaryId),
    alternate: alternateId ? new AiSdkImageProvider(resolve(alternateId), alternateId) : null,
  };
}

// La generación necesita la card, el storage, el cobro, la telemetría, la voz
// de marca (el nicho entra al prompt) y la cola. Ninguno de esos módulos
// importa este, así que no hay ciclo. ImagesJobs no se declara acá sino en
// ScheduledJobsModule, donde vive la lista completa de lo que se agenda.
@Module({
  imports: [AiModule, AssetsModule, BrandVoiceModule, CardsModule, CreditsModule, JobsModule],
  controllers: [ImagesController],
  providers: [
    { provide: IMAGE_PROVIDERS, useFactory: buildImageProviders },
    ImageGenerationsRepository,
    ImageGenerationService,
  ],
  exports: [IMAGE_PROVIDERS, ImageGenerationService],
})
export class ImagesModule {}
