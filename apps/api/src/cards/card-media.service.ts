import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import { cardContentSchema, type CardContent, type PublicationCardDto } from "@presencia/shared";
import { AssetsService } from "../assets/assets.service.js";
import { InvalidImageError } from "../assets/image-inspect.js";
import { DbService } from "../db/db.service.js";
import { CardsRepository, EDITABLE_CARD_STATUSES, type CardRow } from "./cards.repository.js";
import { toDto } from "./cards.service.js";

// La imagen de una card (F10): subir la propia hoy, generar e iterar después.
// Aparte de CardsService, que ya carga con el ciclo de vida de la publicación
// (programar, reconciliar), y porque lo único que comparten es el repository.

/** Las cards que llevan imagen. El guion de video espera un video, no una foto. */
function acceptsImage(content: CardContent): boolean {
  return content.archetype === "visual_first" || content.archetype === "text_first";
}

export const NOT_EDITABLE_MESSAGE =
  "Esta publicación ya está programada o publicada. Cancela la programación para cambiar la imagen.";

@Injectable()
export class CardMediaService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(CardsRepository) private readonly repo: CardsRepository,
    @Inject(AssetsService) private readonly assets: AssetsService,
  ) {}

  /**
   * "Subir propia": guarda la imagen y la deja como la imagen de la card. Es
   * el modo 2 del dual de F10 (sin costo): el creator la hizo afuera.
   */
  async attachUpload(
    userId: string,
    cardId: string,
    data: Uint8Array,
    originalName?: string,
  ): Promise<PublicationCardDto> {
    const card = await this.dbService.runWithTenant(userId, (tx) => this.repo.findById(tx, cardId));
    if (!card) throw new NotFoundException("No encontramos esa publicación.");
    this.assertCanChangeImage(card);

    let stored;
    try {
      stored = await this.assets.storeImage({
        userId,
        cardId,
        chatId: card.chatId,
        data,
        source: "uploaded",
        metadata: originalName ? { originalName } : {},
      });
    } catch (error) {
      if (error instanceof InvalidImageError) {
        throw new UnsupportedMediaTypeException("Ese archivo no es una imagen JPG, PNG o WebP.");
      }
      throw error;
    }

    return this.dbService.runWithTenant(userId, async (tx) => {
      await this.assets.record(tx, stored);
      // Se relee acá y no se usa la card de arriba: entre las dos
      // transacciones pasó la subida al storage, y otro cambio pudo llegar.
      const current = await this.repo.findById(tx, cardId);
      if (!current) throw new NotFoundException("No encontramos esa publicación.");
      const content = cardContentSchema.parse({
        ...(current.content as CardContent),
        assetIds: [stored.id],
      });
      const updated = await this.repo.updateContentIfEditable(tx, cardId, content);
      if (!updated) throw new ConflictException(NOT_EDITABLE_MESSAGE);
      return toDto(updated);
    });
  }

  private assertCanChangeImage(card: CardRow): void {
    if (!acceptsImage(card.content as CardContent)) {
      throw new BadRequestException("Esta publicación es un guion de video: no lleva imagen.");
    }
    if (!EDITABLE_CARD_STATUSES.includes(card.status)) {
      throw new ConflictException(NOT_EDITABLE_MESSAGE);
    }
  }
}
