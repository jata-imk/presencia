import { Module } from "@nestjs/common";
import { AssetsModule } from "../assets/assets.module.js";
import { CardsModule } from "../cards/cards.module.js";
import { LibraryController } from "./library.controller.js";
import { LibraryRepository } from "./library.repository.js";
import { LibraryService } from "./library.service.js";

// Biblioteca (F12). Módulo aparte de AssetsModule a propósito: eliminar una
// imagen tiene que quitarla de las cards que la usan, y CardsModule ya
// importa AssetsModule; puesto ahí sería un ciclo.
@Module({
  imports: [AssetsModule, CardsModule],
  controllers: [LibraryController],
  providers: [LibraryRepository, LibraryService],
})
export class LibraryModule {}
