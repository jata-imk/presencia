import { Module } from "@nestjs/common";
import { env } from "../env.js";
import { FakePublishingProvider } from "./fake.provider.js";
import { PostFastProvider } from "./postfast.provider.js";
import { PUBLISHING_PROVIDER } from "./publishing.provider.js";
import { UploadPostProvider } from "./uploadpost.provider.js";

// Factory por env (ADR-009): "fake" es el default y el provider permanente
// de dev/test; "postfast" y "upload_post" hablan con su API real. env.ts ya
// garantizó fail-fast que la key del proveedor elegido existe, así que los
// `!` de abajo no son optimismo: son la contraparte de ese superRefine.
@Module({
  providers: [
    {
      provide: PUBLISHING_PROVIDER,
      useFactory: () => {
        if (env.PUBLISHING_PROVIDER === "postfast") {
          return new PostFastProvider(env.POSTFAST_API_KEY!, env.POSTFAST_BASE_URL);
        }
        if (env.PUBLISHING_PROVIDER === "upload_post") {
          return new UploadPostProvider(env.UPLOAD_POST_API_KEY!, env.UPLOAD_POST_BASE_URL);
        }
        return new FakePublishingProvider();
      },
    },
  ],
  exports: [PUBLISHING_PROVIDER],
})
export class PublishingModule {}
