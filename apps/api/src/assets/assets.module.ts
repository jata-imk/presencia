import { Module } from "@nestjs/common";
import { env } from "../env.js";
import { ASSET_STORAGE, LocalAssetStorage, R2AssetStorage } from "./asset-storage.js";
import { AssetsController } from "./assets.controller.js";
import { AssetsRepository } from "./assets.repository.js";
import { AssetsService } from "./assets.service.js";

// Factory por env (ADR-011), mismo patrón que PublishingModule. env.ts ya
// garantizó que con "r2" están el bucket y las credenciales, y que en
// producción no se puede elegir "local": los `!` de abajo son la contraparte
// de ese superRefine, no optimismo.
export function buildAssetStorage() {
  if (env.ASSETS_STORAGE === "r2") {
    return new R2AssetStorage(env.ASSETS_S3_BUCKET!, {
      endpoint: env.S3_ENDPOINT!,
      region: env.S3_REGION,
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    });
  }
  return new LocalAssetStorage(env.ASSETS_LOCAL_DIR);
}

@Module({
  controllers: [AssetsController],
  providers: [
    AssetsRepository,
    AssetsService,
    { provide: ASSET_STORAGE, useFactory: buildAssetStorage },
  ],
  exports: [AssetsService],
})
export class AssetsModule {}
