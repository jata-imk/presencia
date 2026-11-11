import { Controller, Delete, HttpCode, Inject } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { SessionUser } from "../auth/auth.js";
import { MemoryService } from "./memory.service.js";

// F12.5: «Borrar todo lo que recuerdo» (Configuración › Voz de marca ›
// Memoria). Borra los fragmentos de la memoria entre chats; los chats no se
// tocan. Prender o apagar la memoria va por PATCH /api/me (`memoryEnabled`):
// es una preferencia del usuario, no de la memoria.
@Controller("memoria")
export class MemoryController {
  constructor(@Inject(MemoryService) private readonly memory: MemoryService) {}

  @Delete()
  @HttpCode(200)
  async forgetAll(@CurrentUser() user: SessionUser): Promise<{ borrados: number }> {
    return { borrados: await this.memory.forgetAll(user.id) };
  }
}
