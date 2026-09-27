import { Module } from "@nestjs/common";
import { createImageModelResolver, DEFAULT_IMAGE_MODEL_ID } from "../ai/provider-registry.js";
import { env } from "../env.js";
import { AiSdkImageProvider } from "./ai-sdk-image.provider.js";
import { FakeImageProvider } from "./fake-image.provider.js";
import { IMAGE_PROVIDERS, type ImageProviders } from "./image-provider.js";

// Factory por env (ADR-025), mismo patrón que PublishingModule. env.ts ya
// validó al boot formato y key de los dos modelos, así que resolverlos acá no
// puede fallar por configuración.
export function buildImageProviders(): ImageProviders {
  if (env.IMAGE_PROVIDER === "fake") {
    return { primary: new FakeImageProvider(), alternate: new FakeImageProvider() };
  }
  const resolve = createImageModelResolver(process.env);
  const primaryId = env.AI_MODEL_IMAGE ?? DEFAULT_IMAGE_MODEL_ID;
  const alternateId = env.AI_MODEL_IMAGE_ALT;
  return {
    primary: new AiSdkImageProvider(resolve(primaryId), primaryId),
    alternate: alternateId ? new AiSdkImageProvider(resolve(alternateId), alternateId) : null,
  };
}

@Module({
  providers: [{ provide: IMAGE_PROVIDERS, useFactory: buildImageProviders }],
  exports: [IMAGE_PROVIDERS],
})
export class ImagesModule {}
