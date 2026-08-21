import { Module } from "@nestjs/common";
import { FoldersController } from "./folders.controller.js";
import { FoldersRepository } from "./folders.repository.js";
import { FoldersService } from "./folders.service.js";

@Module({
  controllers: [FoldersController],
  providers: [FoldersRepository, FoldersService],
  // ChatModule lo importa para validar folderId al mover un chat de
  // carpeta (ChatService.moveToFolder → FoldersService.assertOwnsFolder).
  exports: [FoldersService],
})
export class FoldersModule {}
