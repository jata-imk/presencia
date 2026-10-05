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
  FIRST_SLIDE_ID,
  carouselAspect,
  hasSlide,
  IMAGE_ASPECT_OPTIONS,
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
  type ImageAspectRatio,
  type CarouselSlide,
  type PublicationCardDto,
} from "@presencia/shared";
import type { Tx } from "../db/db.service.js";
import type { AssetMetadata } from "../assets/assets.repository.js";
import { fitToAspect, matchesAspect, nearestAspect } from "../images/image-fit.js";
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
    // Antes de subir: un slide que ya no está dejaría el archivo sin lugar.
    assertSlide(card.content as CardContent, slideId);
    // Sin slideId va a la portada (placeImage): ahí queda también su versión.
    const targetSlide = slideId ?? slidesOf(card.content as CardContent)[0]?.id ?? FIRST_SLIDE_ID;

    let original;
    let stored;
    try {
      original = await this.assets.storeImage({
        userId,
        cardId,
        chatId: card.chatId,
        data,
        source: "uploaded",
        metadata: originalName ? { originalName } : {},
        slideId: targetSlide,
      });
      stored = original;
      // F10.6: en un carrusel, la imagen va en la proporción del carrusel
      // (Instagram recorta todo a la del primero). Se guarda la original y
      // se coloca una copia recortada al centro; el recorte que cambie
      // después parte de la original.
      const current = card.content as CardContent;
      if (current.archetype !== "video_script" && current.slides) {
        const cropped = await fitToAspect(data, carouselAspect(current, card.network));
        if (cropped !== data) {
          stored = await this.assets.storeImage({
            userId,
            cardId,
            chatId: card.chatId,
            data: cropped,
            source: "uploaded",
            metadata: {
              ...(originalName ? { originalName } : {}),
              croppedFrom: original.id,
            },
            slideId: targetSlide,
          });
        }
      }
    } catch (error) {
      if (error instanceof InvalidImageError) {
        throw new UnsupportedMediaTypeException("Ese archivo no es una imagen JPG, PNG o WebP.");
      }
      throw error;
    }

    return this.dbService.runWithTenant(userId, async (tx) => {
      if (stored !== original) await this.assets.record(tx, original);
      await this.assets.record(tx, stored);
      // Se relee acá y no se usa la card de arriba: entre las dos
      // transacciones pasó la subida al storage, y otro cambio pudo llegar.
      const current = await this.repo.findById(tx, cardId);
      if (!current) throw new NotFoundException("No encontramos esa publicación.");
      // Otra vez acá: el slide se pudo quitar mientras subía.
      assertSlide(current.content as CardContent, slideId);
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
      assertSlide(current.content as CardContent, slideId);
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
        slideId: asset.slideId,
        croppedFrom: (asset.metadata as AssetMetadata).croppedFrom ?? null,
        width: (asset.metadata as AssetMetadata).width,
        height: (asset.metadata as AssetMetadata).height,
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
    // Al volverse carrusel, la proporción del carrusel es la de la imagen que
    // ya tenía (la portada), no la primera de la red: si no, la portada
    // quedaría fuera de la proporción de todo lo que se genere después.
    const before = await this.dbService.runWithTenant(userId, (tx) =>
      this.repo.findById(tx, cardId),
    );
    let initialAspect: ImageAspectRatio | undefined;
    const beforeContent = before?.content as CardContent | undefined;
    if (
      before &&
      beforeContent &&
      beforeContent.archetype !== "video_script" &&
      !beforeContent.slides &&
      beforeContent.assetIds[0]
    ) {
      const cover = await this.dbService.runWithTenant(userId, (tx) =>
        this.assets.find(tx, beforeContent.assetIds[0]!),
      );
      const meta = cover?.metadata as AssetMetadata | undefined;
      if (meta?.width && meta.height) {
        initialAspect = nearestAspect(
          meta.width,
          meta.height,
          IMAGE_ASPECT_OPTIONS[before.network],
        );
      }
    }
    return this.changeSlides(
      userId,
      cardId,
      (slides, card) => {
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
      },
      initialAspect,
    );
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
   * No mientras corre un trabajo de imagen, ni siquiera sobre OTRO slide:
   * quitar uno puede devolver la card a imagen suelta, y la imagen que llega
   * (ya cobrada) se quedaría sin lugar. Agregar y reordenar sí se permiten:
   * no cambian el id de ningún slide.
   */
  async deleteSlide(userId: string, cardId: string, slideId: string): Promise<PublicationCardDto> {
    return this.changeSlides(userId, cardId, (slides, card) => {
      if (slides.length < 2) {
        throw new BadRequestException("Esta publicación no es un carrusel.");
      }
      if (!slides.some((s) => s.id === slideId)) {
        throw new NotFoundException("Ese slide ya no está en el carrusel.");
      }
      if (generating(card)) {
        throw new ConflictException(
          "Hay una imagen generándose en este carrusel. Espera a que termine para quitar slides.",
        );
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
   * "Recorte: 4:5 / 1:1": la proporción de todo el carrusel. Las imágenes
   * que ya tiene y no están en esa proporción se recortan al centro, como
   * COPIAS: la original queda en las versiones, por si se vuelve atrás. Lo
   * que se genere después ya sale en la proporción elegida.
   */
  async setSlidesAspect(
    userId: string,
    cardId: string,
    aspectRatio: ImageAspectRatio,
  ): Promise<PublicationCardDto> {
    const card = await this.dbService.runWithTenant(userId, (tx) => this.repo.findById(tx, cardId));
    if (!card) throw new NotFoundException("No encontramos esa publicación.");
    this.assertCanChangeImage(card);
    const content = card.content as CardContent;
    if (content.archetype === "video_script" || !content.slides) {
      throw new BadRequestException("Esta publicación no es un carrusel.");
    }
    if (!IMAGE_ASPECT_OPTIONS[card.network].includes(aspectRatio)) {
      throw new BadRequestException("Esa proporción no se usa en esta red.");
    }
    if (generating(card)) {
      throw new ConflictException(
        "Hay una imagen generándose. Espera a que termine para recortar.",
      );
    }

    // Recortar y subir afuera de la transacción: son bytes y storage, y la
    // card no se bloquea mientras tanto. Siempre desde la ORIGINAL de cada
    // imagen (`croppedFrom`): volver a una proporción anterior regresa a la
    // original en vez de recortar un recorte.
    const replacement = new Map<string, string>();
    // El recorte es versión del MISMO slide que la imagen que reemplaza.
    const slideOf = new Map(content.slides.flatMap((s) => (s.assetId ? [[s.assetId, s.id]] : [])));
    const newAssets: Awaited<ReturnType<AssetsService["storeImage"]>>[] = [];
    for (const assetId of new Set(content.slides.flatMap((s) => (s.assetId ? [s.assetId] : [])))) {
      const shown = await this.dbService.runWithTenant(userId, (tx) =>
        this.assets.find(tx, assetId),
      );
      if (!shown) continue;
      const shownMeta = shown.metadata as AssetMetadata;
      // Lo que ya se ve en la proporción se queda: sin copias repetidas.
      if (matchesAspect(shownMeta.width, shownMeta.height, aspectRatio)) continue;
      const rootId = shownMeta.croppedFrom ?? shown.id;
      const root =
        rootId === shown.id
          ? shown
          : await this.dbService.runWithTenant(userId, (tx) => this.assets.find(tx, rootId));
      if (!root) continue;
      const bytes = await this.assets.readBytes(root);
      const cropped = await fitToAspect(bytes, aspectRatio);
      if (cropped === bytes) {
        // La original ya está en la proporción: vuelve ella, sin copia.
        if (root.id !== assetId) replacement.set(assetId, root.id);
        continue;
      }
      const meta = root.metadata as AssetMetadata;
      const stored = await this.assets.storeImage({
        userId,
        cardId,
        chatId: card.chatId,
        data: cropped,
        source: root.source,
        metadata: {
          ...(meta.alt ? { alt: meta.alt } : {}),
          ...(meta.originalName ? { originalName: meta.originalName } : {}),
          croppedFrom: root.id,
        },
        // El slide donde está HOY (pudo venir de otro: antes de F10.6.1 la tira
        // mostraba las de toda la card); el de origen, solo si no está puesta.
        slideId: slideOf.get(assetId) ?? shown.slideId ?? null,
      });
      newAssets.push(stored);
      replacement.set(assetId, stored.id);
    }

    return this.dbService.runWithTenant(userId, async (tx: Tx) => {
      const current = await this.repo.lockById(tx, cardId);
      if (!current) throw new NotFoundException("No encontramos esa publicación.");
      // Otra vez con la card bloqueada: un "Generar" pudo arrancar mientras se
      // recortaba, y su imagen saldría en la proporción vieja.
      if (generating(current)) {
        throw new ConflictException(
          "Hay una imagen generándose. Espera a que termine para recortar.",
        );
      }
      for (const stored of newAssets) await this.assets.record(tx, stored);
      const now = current.content as CardContent;
      if (now.archetype === "video_script" || !now.slides) {
        throw new ConflictException("El carrusel cambió. Vuelve a intentarlo.");
      }
      // Sobre los slides de AHORA: un slide que cambió de imagen mientras se
      // recortaba se queda con la suya (su recorte no aplica).
      const slides = now.slides.map((s) => {
        const next = s.assetId ? replacement.get(s.assetId) : undefined;
        return next ? { ...s, assetId: next } : s;
      });
      const next = cardContentSchema.parse({
        ...withSlides(now, slides),
        slidesAspect: aspectRatio,
      });
      const updated = await this.repo.updateContentIfEditable(tx, cardId, next);
      if (!updated) throw new ConflictException(NOT_EDITABLE_MESSAGE);
      return toDto(updated);
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
    /** Solo al volverse carrusel: la proporción con que nace. */
    initialAspect?: ImageAspectRatio,
  ): Promise<PublicationCardDto> {
    return this.dbService.runWithTenant(userId, async (tx: Tx) => {
      const card = await this.repo.lockById(tx, cardId);
      if (!card) throw new NotFoundException("No encontramos esa publicación.");
      this.assertCanChangeImage(card);
      const current = card.content as CardContent;
      const wasCarousel = current.archetype !== "video_script" && Boolean(current.slides);
      const changed = withSlides(current, change(slidesOf(current), card));
      const becameCarousel =
        !wasCarousel && changed.archetype !== "video_script" && Boolean(changed.slides);
      const content = cardContentSchema.parse(
        becameCarousel && initialAspect ? { ...changed, slidesAspect: initialAspect } : changed,
      );
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

/** Si la card tiene un trabajo de imagen corriendo de verdad (no uno ya dado por muerto). */
function generating(card: CardRow): boolean {
  const job = card.imageJob as CardImageJob | null;
  return (
    job?.status === "generating" && Date.now() - Date.parse(job.startedAt) <= IMAGE_JOB_STALE_MS
  );
}

/** Un `slideId` que no es de la card: 404, no un 200 que no hace nada. */
function assertSlide(content: CardContent, slideId: string | undefined): void {
  if (slideId !== undefined && !hasSlide(content, slideId)) {
    throw new NotFoundException("Ese slide ya no está en el carrusel.");
  }
}
