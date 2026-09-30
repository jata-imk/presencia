import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import {
  cardContentSchema,
  IMAGE_JOB_STALE_MS,
  NETWORK_LABELS,
  NETWORK_MAX_IMAGES,
  placeImage,
  slidesOf,
  withSlides,
  type AddSlideBody,
  type CardContent,
  type CardImageJob,
  type CardImageVersionDto,
  type CarouselSlide,
  type PublicationCardDto,
} from "@presencia/shared";
import type { Tx } from "../db/db.service.js";
import type { AssetMetadata } from "../assets/assets.repository.js";
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
    /** F10.6: en un carrusel, el slide al que va (sin él, la portada). */
    slideId?: string,
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
      const content = cardContentSchema.parse(
        placeImage(current.content as CardContent, stored.id, slideId),
      );
      const updated = await this.repo.updateContentIfEditable(tx, cardId, content, {
        imageJob: "clearUnlessRunning",
      });
      if (!updated) throw new ConflictException(NOT_EDITABLE_MESSAGE);
      return toDto(updated);
    });
  }

  /**
   * Elegir otra de las imágenes de la card: la otra variante, o una versión
   * anterior. Solo imágenes de ESTA card: un id de otra (o de otro usuario,
   * que por RLS no existe) se rechaza igual.
   */
  async selectImage(
    userId: string,
    cardId: string,
    assetId: string,
    /** F10.6: en un carrusel, el slide donde se pone (sin él, la portada). */
    slideId?: string,
  ): Promise<PublicationCardDto> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const asset = await this.assets.find(tx, assetId);
      if (!asset || asset.cardId !== cardId) {
        throw new NotFoundException("Esa imagen no es de esta publicación.");
      }
      const current = await this.repo.findById(tx, cardId);
      if (!current) throw new NotFoundException("No encontramos esa publicación.");
      const content = cardContentSchema.parse(
        placeImage(current.content as CardContent, assetId, slideId),
      );
      const updated = await this.repo.updateContentIfEditable(tx, cardId, content, {
        imageJob: "supersedeStale",
      });
      if (!updated) throw new ConflictException(NOT_EDITABLE_MESSAGE);
      return toDto(updated);
    });
  }

  /**
   * Todas las imágenes que tuvo la card, de la más vieja a la más nueva, con
   * cómo nació cada una: la tira de versiones. Se puede pedir en cualquier
   * estado de la card (una programada también muestra su historial); lo que
   * no deja es elegir otra.
   */
  async versions(userId: string, cardId: string): Promise<CardImageVersionDto[]> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const card = await this.repo.findById(tx, cardId);
      if (!card) throw new NotFoundException("No encontramos esa publicación.");
      const rows = await this.assets.listByCard(tx, cardId);
      return rows.map(({ asset, kind, instruction, parentAssetId }) => ({
        assetId: asset.id,
        source: asset.source,
        kind,
        instruction,
        parentAssetId,
        alt: (asset.metadata as AssetMetadata).alt ?? null,
        createdAt: asset.createdAt.toISOString(),
      }));
    });
  }

  // ── F10.6: los slides del carrusel ──────────────────────────────────
  //
  // Una card que no es carrusel se ve como un carrusel de uno (slidesOf):
  // agregarle un slide la vuelve carrusel con lo que ya tenía de portada, y
  // quitarle hasta dejar uno la regresa a imagen suelta (withSlides).

  /** "+ Agregar slide": al final, con su prompt o vacío. Respeta el tope de la red. */
  async addSlide(userId: string, cardId: string, body: AddSlideBody): Promise<PublicationCardDto> {
    return this.changeSlides(userId, cardId, (slides, card) => {
      const max = NETWORK_MAX_IMAGES[card.network];
      if (slides.length >= max) {
        throw new BadRequestException(
          `${NETWORK_LABELS[card.network]} acepta hasta ${String(max)} imágenes por publicación.`,
        );
      }
      return [
        ...slides,
        { id: randomUUID(), ...(body.imagePrompt ? { imagePrompt: body.imagePrompt } : {}) },
      ];
    });
  }

  /** El prompt de un slide: lo que se va a generar para él. */
  async updateSlide(
    userId: string,
    cardId: string,
    slideId: string,
    imagePrompt: string,
  ): Promise<PublicationCardDto> {
    return this.changeSlides(userId, cardId, (slides) => {
      const found = slides.some((s) => s.id === slideId);
      if (!found) throw new NotFoundException("Ese slide ya no está en el carrusel.");
      return slides.map((s) => (s.id === slideId ? { ...s, imagePrompt } : s));
    });
  }

  /**
   * Quitar un slide. Su imagen, si tenía, sigue en las versiones de la card.
   * No mientras se está generando: la imagen llegaría sin lugar y ya cobrada.
   */
  async deleteSlide(userId: string, cardId: string, slideId: string): Promise<PublicationCardDto> {
    return this.changeSlides(userId, cardId, (slides, card) => {
      if (slides.length < 2) {
        throw new BadRequestException("Esta publicación no es un carrusel.");
      }
      if (!slides.some((s) => s.id === slideId)) {
        throw new NotFoundException("Ese slide ya no está en el carrusel.");
      }
      if (generatingSlide(card, slideId)) {
        throw new ConflictException("Ese slide se está generando. Espera a que termine.");
      }
      return slides.filter((s) => s.id !== slideId);
    });
  }

  /** El orden nuevo: los mismos slides, todos. El primero es la portada. */
  async reorderSlides(
    userId: string,
    cardId: string,
    slideIds: string[],
  ): Promise<PublicationCardDto> {
    return this.changeSlides(userId, cardId, (slides) => {
      const byId = new Map(slides.map((s) => [s.id, s]));
      const same =
        slideIds.length === slides.length &&
        new Set(slideIds).size === slideIds.length &&
        slideIds.every((id) => byId.has(id));
      if (!same) {
        // Otra pestaña agregó o quitó uno mientras se arrastraba: se rechaza
        // entero en vez de adivinar dónde iba lo que no vino.
        throw new ConflictException("El carrusel cambió. Vuelve a ordenarlo.");
      }
      return slideIds.map((id) => byId.get(id)!);
    });
  }

  /**
   * Lo común: la card bloqueada, los slides de ahora, el cambio, y de vuelta
   * a la card con `assetIds` rederivado. El trabajo de imagen no se toca.
   */
  private async changeSlides(
    userId: string,
    cardId: string,
    change: (slides: CarouselSlide[], card: CardRow) => CarouselSlide[],
  ): Promise<PublicationCardDto> {
    return this.dbService.runWithTenant(userId, async (tx: Tx) => {
      const card = await this.repo.lockById(tx, cardId);
      if (!card) throw new NotFoundException("No encontramos esa publicación.");
      this.assertCanChangeImage(card);
      const current = card.content as CardContent;
      const content = cardContentSchema.parse(withSlides(current, change(slidesOf(current), card)));
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

/** Si el trabajo de imagen que corre ahora está llenando ese slide. */
function generatingSlide(card: CardRow, slideId: string): boolean {
  const job = card.imageJob as CardImageJob | null;
  return (
    job?.status === "generating" &&
    Date.now() - Date.parse(job.startedAt) <= IMAGE_JOB_STALE_MS &&
    (job.slideIds ?? []).includes(slideId)
  );
}
