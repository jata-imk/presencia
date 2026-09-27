import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Patch,
  Post,
  Put,
} from "@nestjs/common";
import {
  createBrandVoiceBodySchema,
  updateBrandVoiceBodySchema,
  type BrandVoiceDto,
  type BrandVoiceExampleDto,
} from "@presencia/shared";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { SessionUser } from "../auth/auth.js";
import { BrandVoiceService } from "./brand-voice.service.js";
import { EjemploDeVozService } from "./ejemplo.service.js";

@Controller("brand-voice")
export class BrandVoiceController {
  constructor(
    @Inject(BrandVoiceService) private readonly service: BrandVoiceService,
    @Inject(EjemploDeVozService) private readonly ejemplos: EjemploDeVozService,
  ) {}

  @Get()
  get(@CurrentUser() user: SessionUser): Promise<BrandVoiceDto> {
    return this.service.getDefault(user.id);
  }

  // Onboarding paso "Voz": crea la default con los 3 obligatorios.
  // Idempotente — reenviar el paso actualiza en vez de tronar.
  @Put()
  put(@CurrentUser() user: SessionUser, @Body() body: unknown): Promise<BrandVoiceDto> {
    const parsed = createBrandVoiceBodySchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException("Los datos de tu voz de marca no son válidos.");
    }
    return this.service.upsertDefault(user.id, parsed.data);
  }

  // Configuración > Voz de marca: parcial, cualquier subconjunto de campos.
  @Patch()
  patch(@CurrentUser() user: SessionUser, @Body() body: unknown): Promise<BrandVoiceDto> {
    const parsed = updateBrandVoiceBodySchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException("Los datos de tu voz de marca no son válidos.");
    }
    return this.service.updateDefault(user.id, parsed.data);
  }

  // "Ver ejemplo de tu voz" (F9.7). POST porque llama al modelo y cobra: un
  // GET que cobra lo puede disparar un prefetch. 200 y no 201: no crea nada,
  // el ejemplo no se guarda.
  @Post("ejemplo")
  @HttpCode(200)
  ejemplo(@CurrentUser() user: SessionUser): Promise<BrandVoiceExampleDto> {
    return this.ejemplos.generar(user.id);
  }
}
