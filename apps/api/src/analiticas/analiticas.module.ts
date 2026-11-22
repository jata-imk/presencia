import { Module } from "@nestjs/common";
import { ChannelsModule } from "../channels/channels.module.js";
import { MetricsModule } from "../metrics/metrics.module.js";
import { ProfileModule } from "../profile/profile.module.js";
import { AnaliticasController } from "./analiticas.controller.js";
import { AnaliticasService } from "./analiticas.service.js";

// Analíticas (F12): expone los números del motor de métricas. Igual que Ritmo,
// no tiene repositorio propio: todo lo que lee de `post_metrics` y de las
// cards pasa por `MetricsEngineService` (ADR-022); de Canales solo toma el
// nombre y el estado de la cuenta de cada red.
@Module({
  imports: [MetricsModule, ChannelsModule, ProfileModule],
  controllers: [AnaliticasController],
  providers: [AnaliticasService],
})
export class AnaliticasModule {}
