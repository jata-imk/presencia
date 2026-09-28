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
  cardContentSchema,
  IMAGE_ASPECT_OPTIONS,
  IMAGE_VARIANTS_PER_GENERATION,
  type CardContent,
  type CardImageJob,
  type GenerateCardImageBody,
  type ImageAspectRatio,
  type ImagesConfigDto,
  type PublicationCardDto,
} from "@presencia/shared";
import { AiUsageService } from "../ai/ai-usage.service.js";
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
import { fitToAspect } from "./image-fit.js";
import {
  ImageGenerationsRepository,
  type ImageGenerationRow,
} from "./image-generations.repository.js";
import { composeImagePrompt } from "./image-prompt.js";
import { IMAGE_PROVIDERS, type ImageProvider, type ImageProviders } from "./image-provider.js";

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
 * Techo del job: dos imágenes en paralelo, y gpt-image tarda hasta ~2 min en
 * los prompts pesados. pg-boss no mata al handler al expirar; esto solo acota
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
    return {
      generatePercent: flatActionsPercentOfQuota(REASON, IMAGE_VARIANTS_PER_GENERATION, tier),
      editPercent: flatActionPercentOfQuota(REASON, tier),
      alternateAvailable: this.providers.alternate !== null,
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
    const provider = this.providerFor(body.provider);
    if (!provider) throw new BadRequestException("No hay otro generador configurado.");

    const card = await this.dbService.runWithTenant(userId, (tx) =>
      this.cards.findById(tx, cardId),
    );
    if (!card) throw new NotFoundException("No encontramos esa publicación.");
    const content = card.content as CardContent;
    if (!acceptsImage(content)) {
      throw new BadRequestException("Esta publicación es un guion de video: no lleva imagen.");
    }
    if (!EDITABLE_CARD_STATUSES.includes(card.status)) {
      throw new ConflictException(NOT_EDITABLE_MESSAGE);
    }
    if (!IMAGE_ASPECT_OPTIONS[card.network].includes(body.aspectRatio)) {
      throw new BadRequestException("Esa proporción no se usa en esta red.");
    }

    // El gate ANTES de encolar: `spend` corre cuando el proveedor ya cobró.
    // Esto contesta 402 sin gastar nada.
    await this.credits.assertQuotaOr402(
      userId,
      quoteFlatAction(REASON) * IMAGE_VARIANTS_PER_GENERATION,
    );

    const voice = await this.dbService.runWithTenant(userId, (tx) =>
      this.brandVoice.findDefault(tx),
    );
    const prompt = composeImagePrompt(body.prompt, voice ?? null);
    const batchId = randomUUID();
    const job: CardImageJob = {
      id: batchId,
      status: "generating",
      provider: body.provider,
      kind: "generate",
      aspectRatio: body.aspectRatio,
      assetIds: [],
      startedAt: new Date().toISOString(),
    };
    // El prompt editado se guarda en la card: la próxima vez la card muestra
    // lo que de verdad se generó, no la sugerencia original del chat.
    const editedContent =
      "imagePrompt" in content && content.imagePrompt === body.prompt
        ? undefined
        : cardContentSchema.parse({ ...content, imagePrompt: body.prompt });

    const started = await this.dbService.runWithTenant(userId, async (tx) => {
      const row = await this.cards.startImageJob(tx, cardId, job, editedContent);
      if (!row) return null;
      await this.generations.insertMany(
        tx,
        Array.from({ length: IMAGE_VARIANTS_PER_GENERATION }, () => ({
          userId,
          cardId,
          batchId,
          kind: "generate" as const,
          providerSlot: body.provider,
          provider: provider.provider,
          model: provider.modelName,
          prompt,
          aspectRatio: body.aspectRatio,
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

  /** El handler del worker: dibuja las variantes del lote, cobra lo que salió y cierra el trabajo. */
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

    const provider = this.providerFor(
      pending[0]!.providerSlot === "alternate" ? "alternate" : "primary",
    );
    const outcomes = await Promise.all(
      pending.map((row) => this.generateOne(userId, card, row, provider)),
    );

    const assetIds = outcomes.flatMap((o) => (o.status === "succeeded" ? [o.assetId] : []));
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
        provider: previous?.provider ?? "primary",
        kind: previous?.kind ?? "generate",
        aspectRatio: previous?.aspectRatio ?? (pending[0]!.aspectRatio as ImageAspectRatio),
        assetIds,
        startedAt: previous?.startedAt ?? new Date().toISOString(),
      },
      assetIds[0],
    );
  }

  /**
   * Una imagen del lote. Nunca lanza: una variante que falla no se lleva a
   * la otra, y el lote siempre termina cerrando el trabajo en la card.
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
    const aspectRatio = row.aspectRatio as ImageAspectRatio;
    const modelo = { provider: provider.provider, modelName: provider.modelName };
    const arranque = Date.now();

    let result;
    try {
      result = await provider.generate({ prompt: row.prompt, aspectRatio });
    } catch (error) {
      console.error(`[images] ${provider.provider} falló en ${row.id}:`, error);
      await this.settle(userId, row.id, { status: "failed", errorMessage: messageOf(error) });
      return { status: "failed" };
    }

    if (result.kind === "blocked") {
      // Se registra aunque no haya imagen: Gemini cobra la entrada igual.
      await this.aiUsage.registrar({
        userId,
        chatId: card.chatId,
        task: "image_generate",
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
      await this.settle(userId, row.id, { status: "blocked" });
      return { status: "blocked" };
    }

    await this.aiUsage.registrar({
      userId,
      chatId: card.chatId,
      task: "image_generate",
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
      });
      // Asset, liquidación y cobro juntos: o la imagen existe y está cobrada,
      // o ninguna de las dos. Sobregiro permitido: el proveedor ya cobró, y
      // negarse solo tiraría la imagen sin devolver ese dinero (ADR-012).
      await this.dbService.runWithTenant(userId, async (tx) => {
        await this.assets.record(tx, stored);
        await this.generations.settle(tx, row.id, { status: "succeeded", assetId: stored.id });
        await this.credits.spend(tx, {
          userId,
          reason: REASON,
          referenceType: "image_generation",
          referenceId: row.id,
          allowOverdraft: true,
        });
      });
      return { status: "succeeded", assetId: stored.id };
    } catch (error) {
      // El proveedor dibujó pero no la pudimos guardar: falla nuestra, no se
      // cobra. El gasto queda en ai_usage_events.
      console.error(`[images] no se pudo guardar la imagen de ${row.id}:`, error);
      await this.settle(userId, row.id, { status: "failed", errorMessage: messageOf(error) });
      return { status: "failed" };
    }
  }

  private providerFor(slot: "primary" | "alternate"): ImageProvider | null {
    return slot === "alternate" ? this.providers.alternate : this.providers.primary;
  }

  /** Liquida una fila sin imagen. Nunca lanza: el lote tiene que poder cerrar. */
  private async settle(
    userId: string,
    id: string,
    result: { status: "failed" | "blocked"; errorMessage?: string },
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
    selectAssetId?: string,
  ): Promise<void> {
    try {
      await this.dbService.runWithTenant(userId, (tx) =>
        this.cards.finishImageJob(tx, cardId, job, selectAssetId),
      );
    } catch (error) {
      console.error(`[images] no se pudo cerrar el trabajo ${job.id} de ${cardId}:`, error);
    }
  }
}

function messageOf(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}
