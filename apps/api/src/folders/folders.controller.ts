import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import {
  createFolderBodySchema,
  folderIdParamSchema,
  renameFolderBodySchema,
  type FolderDto,
} from "@presencia/shared";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { SessionUser } from "../auth/auth.js";
import { FoldersService } from "./folders.service.js";

@Controller("folders")
export class FoldersController {
  constructor(@Inject(FoldersService) private readonly service: FoldersService) {}

  @Get()
  list(@CurrentUser() user: SessionUser): Promise<FolderDto[]> {
    return this.service.listFolders(user.id);
  }

  @Post()
  create(@CurrentUser() user: SessionUser, @Body() body: unknown): Promise<FolderDto> {
    const parsed = createFolderBodySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("El nombre de la carpeta no es válido.");
    return this.service.createFolder(user.id, parsed.data.name, parsed.data.icon);
  }

  @Patch(":id")
  rename(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<FolderDto> {
    const folderId = this.parseFolderId(id);
    const parsed = renameFolderBodySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("El nombre de la carpeta no es válido.");
    return this.service.renameFolder(user.id, folderId, parsed.data.name, parsed.data.icon);
  }

  @Delete(":id")
  @HttpCode(204)
  async delete(@CurrentUser() user: SessionUser, @Param("id") id: string): Promise<void> {
    await this.service.deleteFolder(user.id, this.parseFolderId(id));
  }

  private parseFolderId(id: string): string {
    const parsed = folderIdParamSchema.safeParse({ id });
    if (!parsed.success) throw new BadRequestException("El id de la carpeta no es válido.");
    return parsed.data.id;
  }
}
