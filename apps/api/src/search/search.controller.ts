import { BadRequestException, Controller, Get, Inject, Query } from "@nestjs/common";
import { searchQuerySchema, type SearchResultsDto } from "@presencia/shared";
import { SearchService } from "./search.service.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { SessionUser } from "../auth/auth.js";

@Controller("search")
export class SearchController {
  constructor(@Inject(SearchService) private readonly service: SearchService) {}

  // El mínimo de caracteres se valida acá y no solo en el cliente: con una
  // sola letra el trigrama devuelve medio workspace y el FTS no aporta
  // nada útil.
  @Get()
  search(@CurrentUser() user: SessionUser, @Query("q") q: unknown): Promise<SearchResultsDto> {
    const parsed = searchQuerySchema.safeParse({ q });
    if (!parsed.success) throw new BadRequestException("La búsqueda no es válida.");
    return this.service.search(user.id, parsed.data.q);
  }
}
