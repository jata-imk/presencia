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
  destilarVozBodySchema,
  updateBrandVoiceBodySchema,
  type BrandVoiceDto,
  type BrandVoiceExampleDto,
  type VozDestiladaDto,
} from "@presencia/shared";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { SessionUser } from "../auth/auth.js";
import { BrandVoiceService } from "./brand-voice.service.js";
import { DestilarVozService } from "./destilar.service.js";
import { EjemploDeVozService } from "./ejemplo.service.js";

@Controller("brand-voice")
export class BrandVoiceController {
  constructor(
    @Inject(BrandVoiceService) private readonly service: BrandVoiceService,
    @Inject(EjemploDeVozService) private readonly ejemplos: EjemploDeVozService,
    @Inject(DestilarVozService) private readonly destilados: DestilarVozService,
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
  // GET que cobra lo puede disparar un prefetch. 200 y no 201: no crea un
  // recurso nuevo (desde F12.5 reemplaza el último ejemplo de la voz).
  @Post("ejemplo")
  @HttpCode(200)
  ejemplo(@CurrentUser() user: SessionUser): Promise<BrandVoiceExampleDto> {
    return this.ejemplos.generar(user.id);
  }

  // F12.5: destilar la voz desde 1-3 publicaciones. Devuelve una propuesta y
  // no guarda nada: la guarda el creator con el PATCH, después de verla.
  @Post("destilar")
  @HttpCode(200)
  destilar(@CurrentUser() user: SessionUser, @Body() body: unknown): Promise<VozDestiladaDto> {
    const parsed = destilarVozBodySchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException("Pega de 1 a 3 publicaciones tuyas de al menos 20 caracteres.");
    }
    return this.destilados.destilar(user.id, parsed.data);
  }
}
