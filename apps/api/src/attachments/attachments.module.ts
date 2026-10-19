import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module.js";
import { AssetsModule } from "../assets/assets.module.js";
import { CreditsModule } from "../credits/credits.module.js";
import { JobsModule } from "../jobs/jobs.module.js";
import { AttachmentDigestService } from "./attachment-digest.service.js";
import { AttachmentsController } from "./attachments.controller.js";
import { AttachmentsRepository } from "./attachments.repository.js";
import { AttachmentsService } from "./attachments.service.js";

// Los adjuntos del chat (F10.9). Comparten el storage de Biblioteca
// (ASSET_STORAGE) pero no la tabla: ver schema.ts, `message_attachments`.
@Module({
  imports: [AssetsModule, AiModule, CreditsModule, JobsModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsRepository, AttachmentsService, AttachmentDigestService],
  exports: [AttachmentsService, AttachmentDigestService],
})
export class AttachmentsModule {}
