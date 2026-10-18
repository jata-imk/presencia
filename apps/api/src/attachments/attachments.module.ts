import { Module } from "@nestjs/common";
import { AssetsModule } from "../assets/assets.module.js";
import { AttachmentsController } from "./attachments.controller.js";
import { AttachmentsRepository } from "./attachments.repository.js";
import { AttachmentsService } from "./attachments.service.js";

// Los adjuntos del chat (F10.9). Comparten el storage de Biblioteca
// (ASSET_STORAGE) pero no la tabla: ver schema.ts, `message_attachments`.
@Module({
  imports: [AssetsModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsRepository, AttachmentsService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
