import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module.js";
import { AssetsModule } from "../assets/assets.module.js";
import { BrandVoiceModule } from "../brand-voice/brand-voice.module.js";
import { CardsModule } from "../cards/cards.module.js";
import { CreditsModule } from "../credits/credits.module.js";
import { JobsModule } from "../jobs/jobs.module.js";
import { createImageModelResolver } from "../ai/provider-registry.js";
import { env } from "../env.js";
import { AiSdkImageProvider } from "./ai-sdk-image.provider.js";
import { FakeImageProvider } from "./fake-image.provider.js";
import { FallbackImageProvider } from "./fallback-image.provider.js";
import { imageGeneratorIds } from "./image-models.js";
import { parseSimulateDown } from "../ai/fallback.js";
import { ImageGenerationService } from "./image-generation.service.js";
import { ImageGenerationsRepository } from "./image-generations.repository.js";
import { IMAGE_PROVIDERS, type ImageProviders } from "./image-provider.js";
import { ImagesController } from "./images.controller.js";

// Factory por env (ADR-025), mismo patrón que PublishingModule. env.ts ya
// validó al boot formato y key de cada modelo, así que resolverlos acá no
// puede fallar por configuración.
//
// F10.7: AI_MODEL_IMAGE es la lista de generadores, en orden. El primero es
// el principal y "Probar con otro generador" ofrece los demás. Cada uno es
// una cadena de respaldo que arranca en él y sigue con los otros en orden:
// elegir el 3 es "empieza por el 3", no "solo el 3", y si está caído igual
// responde alguno. Un bloqueo de contenido nunca cae al siguiente.
export function buildImageProviders(): ImageProviders {
  if (env.IMAGE_PROVIDER === "fake") {
    // Dos, para que en dev se vea "Probar con otro generador" sin gastar.
    return {
      generators: [
        new FakeImageProvider(env.IMAGE_FAKE_DELAY_MS),
        new FakeImageProvider(env.IMAGE_FAKE_DELAY_MS),
      ],
    };
  }
  const resolve = createImageModelResolver(process.env);
  const ids = imageGeneratorIds(env.AI_MODEL_IMAGE, env.AI_MODEL_IMAGE_ALT);
  // Cada eslabón sin reintentos propios: reintenta la cadena.
  const links = ids.map((id) => new AiSdkImageProvider(resolve(id), id, { maxRetries: 0 }));
  const simulateDown = parseSimulateDown(env.AI_FALLBACK_SIMULATE);
  return {
    generators: links.map(
      (first, index) =>
        new FallbackImageProvider([first, ...links.filter((_, i) => i !== index)], {
          simulateDown,
        }),
    ),
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
