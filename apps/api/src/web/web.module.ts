import { Module } from "@nestjs/common";
import { WebReadsRepository } from "./web-reads.repository.js";
import { WebReadsService } from "./web-reads.service.js";

// F10.10 (ADR-028): lo que el chat lee de la web. La tool la arma el chat por
// turno (read-link.tool.ts); este módulo le da el servicio que pide y guarda.
@Module({
  providers: [WebReadsRepository, WebReadsService],
  exports: [WebReadsService],
})
export class WebModule {}
