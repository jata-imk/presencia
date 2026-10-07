import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  IMAGE_ASPECT_OPTIONS,
  IMAGE_JOB_STALE_MS,
  IMAGES_PER_GENERATION,
  NETWORK_MAX_IMAGES,
  carouselAspect,
  FIRST_SLIDE_ID,
  imageStyleDef,
  placeImage,
  type CardContent,
  type CarouselSlide,
  type CardImageJob,
  type EditCardImageBody,
  type GenerateCardImageBody,
  type ImageAspectRatio,
  type ImageStyle,
  type ImagesConfigDto,
  type PublicationCardDto,
  jobGenerator,
  legacyGenerator,
  requestedGenerator,
} from "@presencia/shared";
import { AiUsageService } from "../ai/ai-usage.service.js";
import type { AssetMetadata } from "../assets/assets.repository.js";
import { AssetsService } from "../assets/assets.service.js";
import { BrandVoiceRepository } from "../brand-voice/brand-voice.repository.js";
import { NOT_EDITABLE_MESSAGE } from "../cards/card-media.service.js";
import {
  CardsRepository,
  EDITABLE_CARD_STATUSES,
  type CardRow,
} from "../cards/cards.repository.js";
import { toDto } from "../cards/cards.service.js";
import { CreditsService } from "../credits/credits.service.js";
import {
  flatActionPercentOfQuota,
  flatActionsPercentOfQuota,
  quoteFlatAction,
} from "../credits/rate-card.js";
import { DbService } from "../db/db.service.js";
import { BossService } from "../jobs/boss.service.js";
import { fitToAspect, nearestAspect } from "./image-fit.js";
import {
  ImageGenerationsRepository,
  type ImageGenerationRow,
} from "./image-generations.repository.js";
import { composeEditPrompt, composeImagePrompt } from "./image-prompt.js";
import {
  IMAGE_PROVIDERS,
  type ImageProvider,
  type ImageProviders,
  type ReferenceImage,
} from "./image-provider.js";

// Generar la imagen de una card (F10 PR3, ADR-025).
//
// El request no dibuja: una imagen tarda de 10 a 60 segundos, y un request
// abierto ese rato queda a merced del timeout del nginx de enfrente. El POST
// valida, anuncia el cobro, deja la card en "generando" y encola; el worker
// dibuja, guarda, cobra y cierra el trabajo en la card. La card avisa al
// stream (F8.6) en las dos puntas, así que el navegador ve el cambio solo.

const REASON = "image_generation" as const;

/** La cola. La registra ImagesJobs (worker o WORKER_INLINE); la API solo encola. */
export const IMAGE_QUEUE = "images.generate";

/**
 * Techo del job: las imágenes de un trabajo van en paralelo (los slides de un
 * carrusel), y gpt-image tarda hasta ~2 min en los prompts pesados. pg-boss no mata al handler al expirar; esto solo acota
 * cuánto tapa la cola un job colgado. Menor que IMAGE_JOB_STALE_MS (5 min):
 * cuando la card da el trabajo por muerto, la cola ya lo soltó.
 */
export const IMAGE_JOB_EXPIRE_SECONDS = 4 * 60;

/**
 * Lo que viaja en el job. Declarado como tipo y usado al encolar, no armado
 * como literal: `enqueue<T>` infiere T del literal y una llave mal escrita
 * compilaría (la cicatriz de ManualRefreshJob, F9.6).
 */
export interface ImageGenerationJob {
  userId: string;
  cardId: string;
  batchId: string;
}

type ImageOutcome = { status: "succeeded"; assetId: string } | { status: "failed" | "blocked" };

/** Una imagen que sale del lote y a dónde va: un slide, o la imagen suelta (null). */
export interface ImagePlacement {
  assetId: string;
  slideId: string | null;
}

/** Una fila que se va a pedir: su prompt compuesto y su slide. */
interface RequestedImage {
  prompt: string;
  slideId: string | null;
}

/** Los slides si la card es carrusel; null si es imagen suelta. */
function slidesIn(content: CardContent): CarouselSlide[] | null {
  return content.archetype !== "video_script" && content.slides ? content.slides : null;
}

/** Las cards que llevan imagen. El guion de video espera un video, no una foto. */
function acceptsImage(content: CardContent): boolean {
  return content.archetype === "visual_first" || content.archetype === "text_first";
}

@Injectable()
export class ImageGenerationService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(CardsRepository) private readonly cards: CardsRepository,
    @Inject(ImageGenerationsRepository) private readonly generations: ImageGenerationsRepository,
    @Inject(AssetsService) private readonly assets: AssetsService,
    @Inject(CreditsService) private readonly credits: CreditsService,
    @Inject(AiUsageService) private readonly aiUsage: AiUsageService,
    @Inject(BrandVoiceRepository) private readonly brandVoice: BrandVoiceRepository,
    @Inject(BossService) private readonly boss: BossService,
    @Inject(IMAGE_PROVIDERS) private readonly providers: ImageProviders,
  ) {}

  /** El precio que anuncia el botón (siempre en %, nunca en unidades) y si hay otro generador. */
  async config(userId: string): Promise<ImagesConfigDto> {
    const { tier } = await this.credits.getQuotaStatusDto(userId);
    const voice = await this.dbService.runWithTenant(userId, (tx) =>
      this.brandVoice.findDefault(tx),
    );
    return {
      generatePercent: flatActionsPercentOfQuota(REASON, IMAGES_PER_GENERATION, tier),
      editPercent: flatActionPercentOfQuota(REASON, tier),
      generatorCount: this.providers.generators.length,
      generatorStrengths: this.providers.strengths,
      // "Generar las n que faltan": hasta el tope más alto de las redes.
      batchPercents: Array.from(
        { length: Math.max(...Object.values(NETWORK_MAX_IMAGES)) },
        (_, i) => flatActionsPercentOfQuota(REASON, i + 1, tier),
      ),
      // El mismo que usa `request` cuando el body no trae estilo.
      defaultStyle: imageStyleDef(voice?.imageStyle as ImageStyle | null).id,
    };
  }

  /**
   * "Generar imagen": deja la card generando y encola. Idempotente contra el
   * doble click: si ya hay un trabajo corriendo, contesta la card tal como
   * está en vez de un error — volver a apretar un botón que trabaja no es una
   * falla del usuario.
   */
  async request(
    userId: string,
    cardId: string,
    body: GenerateCardImageBody,
  ): Promise<PublicationCardDto> {
    const generator = requestedGenerator(body);
    const provider = this.requireProvider(generator);
    const card = await this.loadEditableCard(userId, cardId);
    if (!IMAGE_ASPECT_OPTIONS[card.network].includes(body.aspectRatio)) {
      throw new BadRequestException("Esa proporción no se usa en esta red.");
    }
    const content = card.content as CardContent;
    // F10.6: un carrusel tiene UNA proporción para todos sus slides (la que
    // eligió en "Recorte"); la del body solo aplica a la imagen suelta.
    const aspectRatio = slidesIn(content)
      ? carouselAspect(content, card.network)
      : body.aspectRatio;

    const voice = await this.dbService.runWithTenant(userId, (tx) =>
      this.brandVoice.findDefault(tx),
    );
    // F10.6: el de esta imagen (chip del composer) o, si no, el de su Voz de
    // marca. Se guarda en el trabajo: el chip arranca en él, así "Regenerar"
    // repite el estilo de la imagen aunque el default haya cambiado.
    const style = body.style ?? imageStyleDef(voice?.imageStyle as ImageStyle | null).id;
    const slides = slidesIn(content);

    let images: RequestedImage[];
    let editedPrompt: string | undefined;
    if (slides) {
      // F10.6: un carrusel genera por slide, cada uno con SU prompt (se edita
      // con PATCH del slide antes de generar). F10.7: una imagen por slide,
      // también la portada (antes llevaba dos variantes).
      if (!body.slideIds) throw new BadRequestException("Elige qué slides generar.");
      const ids = [...new Set(body.slideIds)];
      images = ids.flatMap((id) => {
        const index = slides.findIndex((s) => s.id === id);
        if (index === -1) throw new NotFoundException("Ese slide ya no está en el carrusel.");
        const described = slides[index]!.imagePrompt?.trim() ?? "";
        if (described.length < 3) {
          throw new BadRequestException(
            `El slide ${String(index + 1)} todavía no dice qué imagen lleva.`,
          );
        }
        const prompt = composeImagePrompt(described, voice ?? null, style);
        return Array.from({ length: IMAGES_PER_GENERATION }, () => ({ prompt, slideId: id }));
      });
    } else {
      if (body.slideIds) throw new BadRequestException("Esta publicación no es un carrusel.");
      if (!body.prompt) throw new BadRequestException("Escribe qué imagen quieres.");
      const prompt = composeImagePrompt(body.prompt, voice ?? null, style);
      // FIRST_SLIDE_ID y no null: si la card se vuelve carrusel mientras
      // genera, la imagen sigue yendo a ESTE slide aunque ya no sea la portada.
      images = Array.from({ length: IMAGES_PER_GENERATION }, () => ({
        prompt,
        slideId: FIRST_SLIDE_ID,
      }));
      // El prompt editado se guarda en la card: la próxima vez la card muestra
      // lo que de verdad se generó, no la sugerencia original del chat.
      editedPrompt =
        "imagePrompt" in content && content.imagePrompt === body.prompt ? undefined : body.prompt;
    }

    return this.startJob(userId, cardId, {
      kind: "generate",
      generator,
      provider,
      aspectRatio,
      style,
      images,
      slideIds: [...new Set(images.map((i) => i.slideId!))],
      instruction: null,
      parentAssetId: null,
      editedPrompt,
    });
  }

  /**
   * "Más cálida", "sin gente": edita la imagen elegida, con ella como
   * referencia. Una imagen, no dos: la instrucción ya dice qué cambiar.
   * Queda como hija de la elegida (`parent_asset_id`): el historial de
   * versiones y Biblioteca muestran de dónde salió.
   */
  async requestEdit(
    userId: string,
    cardId: string,
    body: EditCardImageBody,
  ): Promise<PublicationCardDto> {
    const generator = requestedGenerator(body);
    const provider = this.requireProvider(generator);
    const card = await this.loadEditableCard(userId, cardId);
    const content = card.content as CardContent;
    const slides = slidesIn(content);
    if (!slides && body.slideId) {
      throw new BadRequestException("Esta publicación no es un carrusel.");
    }
    // En un carrusel se ajusta la imagen de un slide (la portada si no dice
    // cuál), y la edición vuelve a ESE slide.
    const slide = slides ? slides.find((s) => s.id === (body.slideId ?? slides[0]!.id)) : null;
    if (slides && !slide) throw new NotFoundException("Ese slide ya no está en el carrusel.");
    const parentId = slide ? slide.assetId : content.assetIds[0];
    if (!parentId) {
      throw new BadRequestException("Primero genera o sube una imagen para poder ajustarla.");
    }
    const parent = await this.dbService.runWithTenant(userId, (tx) =>
      this.assets.find(tx, parentId),
    );
    if (!parent || parent.cardId !== cardId) {
      throw new NotFoundException("No encontramos la imagen que quieres ajustar.");
    }
    const { width, height } = parent.metadata as AssetMetadata;
    // La proporción de la imagen que se edita, llevada a la más cercana que
    // usa la red: una foto subida en 3:2 se edita como 16:9 o 1:1, lo que
    // quede más cerca, y no se deforma a 4:5.
    const aspectRatio = slides
      ? carouselAspect(content, card.network)
      : nearestAspect(width, height, IMAGE_ASPECT_OPTIONS[card.network]);

    return this.startJob(userId, cardId, {
      kind: "edit",
      generator,
      provider,
      aspectRatio,
      // La edición no aplica estilo (conserva el de su imagen), pero hereda el
      // del trabajo anterior: sin esto el chip de la card caía al default de
      // la voz y "Regenerar" después de ajustar cambiaba de estilo.
      style: (card.imageJob as CardImageJob | null)?.style,
      images: [
        { prompt: composeEditPrompt(body.instruction), slideId: slide?.id ?? FIRST_SLIDE_ID },
      ],
      slideIds: [slide?.id ?? FIRST_SLIDE_ID],
      instruction: body.instruction,
      parentAssetId: parentId,
      editedPrompt: undefined,
    });
  }

  private requireProvider(generator: number): ImageProvider {
    const provider = this.providerFor(generator);
    if (!provider) throw new BadRequestException("Ese generador no está configurado.");
    return provider;
  }

  /** La card, si existe, es suya, lleva imagen y todavía se puede editar. */
  private async loadEditableCard(userId: string, cardId: string): Promise<CardRow> {
    const card = await this.dbService.runWithTenant(userId, (tx) =>
      this.cards.findById(tx, cardId),
    );
    if (!card) throw new NotFoundException("No encontramos esa publicación.");
    if (!acceptsImage(card.content as CardContent)) {
      throw new BadRequestException("Esta publicación es un guion de video: no lleva imagen.");
    }
    if (!EDITABLE_CARD_STATUSES.includes(card.status)) {
      throw new ConflictException(NOT_EDITABLE_MESSAGE);
    }
    return card;
  }

  /**
   * Lo común a generar y editar: el gate de cuota por las imágenes que se
   * piden, el candado en la card, las filas de `image_generations` y el job.
   */
  private async startJob(
    userId: string,
    cardId: string,
    spec: {
      kind: "generate" | "edit";
      /** F10.7: la posición en AI_MODEL_IMAGE (1 = el principal). */
      generator: number;
      provider: ImageProvider;
      aspectRatio: ImageAspectRatio;
      style: ImageStyle | undefined;
      /** Una fila por imagen pedida; se cobra por cada una. */
      images: RequestedImage[];
      slideIds: string[] | undefined;
      instruction: string | null;
      parentAssetId: string | null;
      editedPrompt: string | undefined;
    },
  ): Promise<PublicationCardDto> {
    // El gate ANTES de encolar: `spend` corre cuando el proveedor ya cobró.
    // Esto contesta 402 sin gastar nada.
    await this.credits.assertQuotaOr402(userId, quoteFlatAction(REASON) * spec.images.length);

    const batchId = randomUUID();
    const job: CardImageJob = {
      id: batchId,
      status: "generating",
      generator: spec.generator,
      kind: spec.kind,
      aspectRatio: spec.aspectRatio,
      ...(spec.style ? { style: spec.style } : {}),
      ...(spec.slideIds ? { slideIds: spec.slideIds } : {}),
      assetIds: [],
      startedAt: new Date().toISOString(),
    };

    const started = await this.dbService.runWithTenant(userId, async (tx) => {
      const row = await this.cards.startImageJob(tx, cardId, job, spec.editedPrompt);
      if (!row) return null;
      await this.generations.insertMany(
        tx,
        spec.images.map((image) => ({
          userId,
          cardId,
          batchId,
          kind: spec.kind,
          providerSlot: String(spec.generator),
          provider: spec.provider.provider,
          model: spec.provider.modelName,
          prompt: image.prompt,
          slideId: image.slideId,
          instruction: spec.instruction,
          parentAssetId: spec.parentAssetId,
          aspectRatio: spec.aspectRatio,
        })),
      );
      return row;
    });

    if (!started) {
      // Otro request ganó (doble click) o la card dejó de ser editable
      // entre la lectura y la escritura.
      const current = await this.dbService.runWithTenant(userId, (tx) =>
        this.cards.findById(tx, cardId),
      );
      if (current && EDITABLE_CARD_STATUSES.includes(current.status)) return toDto(current);
      throw new ConflictException(NOT_EDITABLE_MESSAGE);
    }

    const payload: ImageGenerationJob = { userId, cardId, batchId };
    const encolado = await this.boss.enqueue(IMAGE_QUEUE, payload, {
      singletonKey: batchId,
      expireInSeconds: IMAGE_JOB_EXPIRE_SECONDS,
    });
    if (!encolado) {
      // Sin cola no va a pasar nada, y dejar la card "generando" apagaría el
      // botón hasta que el trabajo se diera por muerto.
      await this.close(userId, cardId, { ...job, status: "failed" });
      await this.settleBatch(userId, batchId, "no se pudo encolar");
      throw new ServiceUnavailableException(
        "No pudimos poner tu imagen en cola. Inténtalo en un momento.",
      );
    }
    return toDto(started);
  }

  /** El handler del worker: dibuja las imágenes del lote, cobra lo que salió y cierra el trabajo. */
  async run(job: ImageGenerationJob): Promise<void> {
    const { userId, cardId, batchId } = job;
    const [card, rows] = await this.dbService.runWithTenant(
      userId,
      async (tx) =>
        [
          await this.cards.findById(tx, cardId),
          await this.generations.listBatch(tx, batchId),
        ] as const,
    );
    const pending = rows.filter((row) => row.status === "pending");
    if (!card || pending.length === 0) return;

    // El trabajo de la card ya no es este: la cola se atrasó más que el corte
    // de "generando" y el usuario, que lo vio fallido, pidió otro. Dibujarlo
    // ahora cobraría imágenes que nunca va a ver en la card.
    const current = card.imageJob as CardImageJob | null;
    const stale =
      current !== null && Date.now() - Date.parse(current.startedAt) > IMAGE_JOB_STALE_MS;
    if (current?.id !== batchId || current.status !== "generating" || stale) {
      await this.settleBatch(userId, batchId, "reemplazado por otro intento");
      return;
    }

    const provider = this.providerFor(generatorOfSlot(pending[0]!.providerSlot));
    const outcomes = await Promise.all(
      pending.map((row) => this.generateOne(userId, card, row, provider)),
    );

    const assetIds = outcomes.flatMap((o) => (o.status === "succeeded" ? [o.assetId] : []));
    // La primera imagen que salió para cada destino (cada slide, o la imagen
    // suelta) queda elegida; las demás (trabajos de antes de F10.7), en las versiones.
    const placements: ImagePlacement[] = [];
    const placed = new Set<string>();
    pending.forEach((row, i) => {
      const outcome = outcomes[i]!;
      const key = row.slideId ?? "";
      if (outcome.status !== "succeeded" || placed.has(key)) return;
      placed.add(key);
      placements.push({ assetId: outcome.assetId, slideId: row.slideId });
    });
    const status: CardImageJob["status"] =
      assetIds.length > 0
        ? "done"
        : outcomes.every((o) => o.status === "blocked")
          ? "blocked"
          : "failed";
    const previous = card.imageJob as CardImageJob | null;
    await this.close(
      userId,
      cardId,
      {
        id: batchId,
        status,
        generator: previous ? jobGenerator(previous) : 1,
        kind: previous?.kind ?? "generate",
        aspectRatio: previous?.aspectRatio ?? (pending[0]!.aspectRatio as ImageAspectRatio),
        // F10.6: sin esto el estilo se perdía al terminar cualquier trabajo, y
        // el chip de la card caía al default de la voz.
        ...(previous?.style ? { style: previous.style } : {}),
        ...(previous?.slideIds ? { slideIds: previous.slideIds } : {}),
        assetIds,
        startedAt: previous?.startedAt ?? new Date().toISOString(),
      },
      placements,
    );
  }

  /**
   * Una imagen del lote. Nunca lanza: una imagen que falla no se lleva a
   * las otras, y el lote siempre termina cerrando el trabajo en la card.
   */
  private async generateOne(
    userId: string,
    card: CardRow,
    row: ImageGenerationRow,
    provider: ImageProvider | null,
  ): Promise<ImageOutcome> {
    if (!provider) {
      await this.settle(userId, row.id, { status: "failed", errorMessage: "sin generador" });
      return { status: "failed" };
    }
    // F10.6: un slide sale en la proporción que el carrusel tenga AHORA, no la
    // de cuando se pidió: el recorte pudo cambiar entre el pedido y el worker.
    const content = card.content as CardContent;
    const aspectRatio =
      row.slideId && slidesIn(content)
        ? carouselAspect(content, card.network)
        : (row.aspectRatio as ImageAspectRatio);
    const task = row.kind === "edit" ? "image_edit" : "image_generate";

    // Una edición manda la imagen de partida. Sin ella no hay edición posible,
    // y se falla antes de pagarle al generador.
    let reference: ReferenceImage | undefined;
    let parentAlt: string | undefined;
    if (row.parentAssetId) {
      try {
        const parent = await this.dbService.runWithTenant(userId, (tx) =>
          this.assets.find(tx, row.parentAssetId!),
        );
        if (!parent) throw new Error(`no existe el asset ${row.parentAssetId}`);
        reference = { data: await this.assets.readBytes(parent), mediaType: parent.mimeType };
        parentAlt = (parent.metadata as AssetMetadata).alt;
      } catch (error) {
        console.error(`[images] no se pudo leer la imagen de referencia de ${row.id}:`, error);
        await this.settle(userId, row.id, { status: "failed", errorMessage: messageOf(error) });
        return { status: "failed" };
      }
    }

    const arranque = Date.now();
    let result;
    try {
      result = await provider.generate({ prompt: row.prompt, aspectRatio, reference });
    } catch (error) {
      console.error(`[images] ${provider.provider} falló en ${row.id}:`, error);
      await this.settle(userId, row.id, { status: "failed", errorMessage: messageOf(error) });
      return { status: "failed" };
    }

    // F10.7: el que dibujó de verdad. Con la cadena de respaldo puede no ser
    // el pedido, y la telemetría y la fila tienen que decir quién fue.
    const modelo = result.ran
      ? {
          provider: result.ran.provider,
          modelName: result.ran.modelName,
          fallbackFrom: result.ran.fallbackFrom,
          attempts: result.ran.attempts,
        }
      : { provider: provider.provider, modelName: provider.modelName };
    const ran = { provider: modelo.provider, model: modelo.modelName };

    if (result.kind === "blocked") {
      // Se registra aunque no haya imagen: Gemini cobra la entrada igual.
      await this.aiUsage.registrar({
        userId,
        chatId: card.chatId,
        task,
        modelo,
        usage: result.usage ?? {
          inputTokens: undefined,
          outputTokens: undefined,
          totalTokens: undefined,
        },
        stepsCount: 1,
        arranque,
        imagesCount: 0,
        providerRaw: result.providerRaw,
      });
      await this.settle(userId, row.id, { status: "blocked", ran });
      return { status: "blocked" };
    }

    await this.aiUsage.registrar({
      userId,
      chatId: card.chatId,
      task,
      modelo,
      usage: result.usage,
      stepsCount: 1,
      arranque,
      imagesCount: 1,
      providerRaw: result.providerRaw,
    });

    try {
      const data = await fitToAspect(result.data, aspectRatio);
      const stored = await this.assets.storeImage({
        userId,
        cardId: card.id,
        chatId: card.chatId,
        data,
        source: "generated",
        // El texto alternativo nace de lo que se pidió: la descripción de la
        // card al generar; al editar, el de la imagen de partida, que la
        // edición no cambia de tema.
        metadata: altFor(row, card, parentAlt),
        slideId: row.slideId,
      });
      // Asset, liquidación y cobro juntos: o la imagen existe y está cobrada,
      // o ninguna de las dos. Sobregiro permitido: el proveedor ya cobró, y
      // negarse solo tiraría la imagen sin devolver ese dinero (ADR-012).
      await this.dbService.runWithTenant(userId, async (tx) => {
        // Se vuelve a preguntar AQUÍ, con la card bloqueada, y no solo al
        // arrancar el job: una imagen puede tardar hasta que la card lo dé
        // por muerto y le diga al usuario "no se cobró". Si pasó eso, la
        // imagen se guarda (queda en sus versiones) pero no se cobra. Va
        // primero en la transacción: el lock de la card antes que el del
        // insert del asset, el mismo orden en todas las imágenes del lote.
        const current = await this.cards.isImageJobCurrent(tx, card.id, row.batchId);
        await this.assets.record(tx, stored);
        await this.generations.settle(tx, row.id, { status: "succeeded", assetId: stored.id, ran });
        if (current) {
          await this.credits.spend(tx, {
            userId,
            reason: REASON,
            referenceType: "image_generation",
            referenceId: row.id,
            allowOverdraft: true,
          });
        }
      });
      return { status: "succeeded", assetId: stored.id };
    } catch (error) {
      // El proveedor dibujó pero no la pudimos guardar: falla nuestra, no se
      // cobra. El gasto queda en ai_usage_events.
      console.error(`[images] no se pudo guardar la imagen de ${row.id}:`, error);
      // Ya se dibujó: aunque no se pudo guardar, la fila dice quién lo hizo.
      await this.settle(userId, row.id, {
        status: "failed",
        errorMessage: messageOf(error),
        ran,
      });
      return { status: "failed" };
    }
  }

  /** El generador N de la lista (1 = el principal); null si no existe. Lo viejo lo traduce generatorOfSlot. */
  private providerFor(generator: number): ImageProvider | null {
    return this.providers.generators[generator - 1] ?? null;
  }

  /** Liquida una fila sin imagen. Nunca lanza: el lote tiene que poder cerrar. */
  private async settle(
    userId: string,
    id: string,
    result: {
      status: "failed" | "blocked";
      errorMessage?: string;
      ran?: { provider: string; model: string };
    },
  ): Promise<void> {
    try {
      await this.dbService.runWithTenant(userId, (tx) => this.generations.settle(tx, id, result));
    } catch (error) {
      console.error(`[images] no se pudo liquidar ${id}:`, error);
    }
  }

  /** Liquida como fallidas las filas que sigan pendientes de un lote. Nunca lanza. */
  private async settleBatch(userId: string, batchId: string, errorMessage: string): Promise<void> {
    try {
      await this.dbService.runWithTenant(userId, async (tx) => {
        const rows = await this.generations.listBatch(tx, batchId);
        for (const row of rows.filter((r) => r.status === "pending")) {
          await this.generations.settle(tx, row.id, { status: "failed", errorMessage });
        }
      });
    } catch (error) {
      console.error(`[images] no se pudo liquidar el lote ${batchId}:`, error);
    }
  }

  /** Cierra el trabajo en la card (y avisa al stream). Nunca lanza. */
  private async close(
    userId: string,
    cardId: string,
    job: CardImageJob,
    placements: ImagePlacement[] = [],
  ): Promise<void> {
    try {
      await this.dbService.runWithTenant(userId, (tx) =>
        this.cards.finishImageJob(tx, cardId, job, (content) =>
          placements.reduce((c, p) => placeImage(c, p.assetId, p.slideId), content),
        ),
      );
    } catch (error) {
      console.error(`[images] no se pudo cerrar el trabajo ${job.id} de ${cardId}:`, error);
    }
  }
}

function altFor(
  row: ImageGenerationRow,
  card: CardRow,
  parentAlt: string | undefined,
): { alt?: string } {
  const content = card.content as CardContent;
  // F10.6: la imagen de un slide se describe con el prompt de ESE slide.
  const slide = row.slideId ? slidesIn(content)?.find((s) => s.id === row.slideId) : undefined;
  const description = slide
    ? slide.imagePrompt
    : (content as CardContent & { imagePrompt?: string }).imagePrompt;
  const alt = row.kind === "edit" ? (parentAlt ?? description) : description;
  return alt ? { alt: alt.slice(0, 500) } : {};
}

function messageOf(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

/**
 * La columna `provider_slot` de `image_generations` es texto: desde F10.7
 * guarda la posición del generador ("1", "2"…); las filas de antes dicen
 * "primary" o "alternate" (= 1 y 2), y una que quedó pendiente durante el
 * deploy se lee igual.
 */
function generatorOfSlot(slot: string): number {
  const legacy = legacyGenerator(slot);
  if (legacy !== null) return legacy;
  const n = Number(slot);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}
