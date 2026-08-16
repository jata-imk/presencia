import { Module } from "@nestjs/common";
import { env } from "../env.js";
import { FakePublishingProvider } from "./fake.provider.js";
import { PostFastProvider } from "./postfast.provider.js";
import { PUBLISHING_PROVIDER } from "./publishing.provider.js";

// Factory por env (ADR-009): "fake" es el default y el provider permanente
// de dev/test; "postfast" habla con la API real. env.ts ya garantizó
// fail-fast que POSTFAST_API_KEY existe si PUBLISHING_PROVIDER="postfast".
@Module({
  providers: [
    {
      provide: PUBLISHING_PROVIDER,
      useFactory: () => {
        if (env.PUBLISHING_PROVIDER === "postfast") {
          return new PostFastProvider(env.POSTFAST_API_KEY!, env.POSTFAST_BASE_URL);
        }
        return new FakePublishingProvider();
      },
    },
  ],
  exports: [PUBLISHING_PROVIDER],
})
export class PublishingModule {}
