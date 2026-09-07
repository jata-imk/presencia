import { Module } from "@nestjs/common";
import { BossService } from "./boss.service.js";

// Runtime de la cola (ADR-008). Lo importan el worker (`worker.module.ts`) y,
// cuando WORKER_INLINE está encendido, también AppModule — en dev el worker
// vive dentro del proceso de la API para compartir con él la instancia de
// FakePublishingProvider, que guarda sus posts en memoria.
@Module({
  providers: [BossService],
  exports: [BossService],
})
export class JobsModule {}
