import { Controller, Get, Inject } from "@nestjs/common";
import type { QuotaStatusDto } from "@presencia/shared";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { SessionUser } from "../auth/auth.js";
import { CreditsService } from "./credits.service.js";

@Controller("me/quota")
export class CreditsController {
  constructor(@Inject(CreditsService) private readonly service: CreditsService) {}

  @Get()
  get(@CurrentUser() user: SessionUser): Promise<QuotaStatusDto> {
    return this.service.getQuotaStatusDto(user.id);
  }
}
