import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  CARD_EDIT_SESSION_IDLE_MS,
  cardContentSchema,
  type CardContent,
  type CardContentChangeDto,
  type CardTextFields,
  type CardVersionContent,
  type CardVersionDto,
  type CardVersionSource,
} from "@presencia/shared";
import { DbService, type Tx } from "../db/db.service.js";
import { CardVersionsRepository, type CardVersionRow } from "./card-versions.repository.js";
import { CardsRepository, type CardRow } from "./cards.repository.js";
import { toDto } from "./cards.service.js";

// El texto de una card y sus versiones (F10.5). Tres flujos de cambio
// conviven y solo dos pasan por aquí:
//
// 1. Pedir otra en el chat: card NUEVA (ADR-005), no toca esta.
// 2. Editar a mano: una versión por sesión de edición.
// 3. Pedirle un cambio a la IA sobre la card: una versión por cambio (PR4).
//
// Restaurar crea una versión nueva: nunca se borra ninguna.

export const TEXT_NOT_EDITABLE_MESSAGE =
  "Esta publicación ya está programada o publicada. Cancela la programación para editarla.";

/** La card sin `assetIds`: lo que guarda y restaura una versión. */
export function textOf(content: CardContent): CardVersionContent {
  const text: Partial<CardContent> = { ...content };
  delete text.assetIds;
  return text as CardVersionContent;
}

export function toVersionDto(row: CardVersionRow): CardVersionDto {
  return {
    n: row.n,
    source: row.source,
    instruction: row.instruction,
    restoredFrom: row.restoredFrom,
    content: row.content as CardVersionContent,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class CardContentService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(CardsRepository) private readonly cards: CardsRepository,
    @Inject(CardVersionsRepository) private readonly versions: CardVersionsRepository,
  ) {}

  /** Editar a mano: los campos que cambiaron, fusionados sobre la card viva. */
  async edit(
    userId: string,
    cardId: string,
    fields: CardTextFields,
    editSessionId: string,
  ): Promise<CardContentChangeDto> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const card = await this.lockEditable(tx, cardId);
      const current = card.content as CardContent;
      // El schema del arquetipo descarta los campos que no son suyos (`body`
      // en un post visual) y la imagen se queda la que está.
      const next = cardContentSchema.parse({
        ...current,
        ...fields,
        archetype: current.archetype,
        assetIds: current.assetIds,
      });
      return this.write(tx, userId, card, next, { source: "manual", editSessionId });
    });
  }

  /** Restaurar la versión `n`: su texto vuelve como una versión nueva. */
  async restore(userId: string, cardId: string, n: number): Promise<CardContentChangeDto> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const card = await this.lockEditable(tx, cardId);
      const current = card.content as CardContent;
      const version = await this.versions.find(tx, cardId, n);
      // Una card sin historial todavía solo tiene su versión 1: su contenido.
      if (!version && n !== 1) throw new NotFoundException("Esa versión no existe.");
      const text = version ? (version.content as CardVersionContent) : textOf(current);
      const next = cardContentSchema.parse({ ...text, assetIds: current.assetIds });
      return this.write(tx, userId, card, next, { source: "restore", restoredFrom: n });
    });
  }

  /**
   * El historial, de la más vieja a la más nueva. Una card que nunca cambió
   * no tiene filas: su única versión es la original, que es su contenido.
   */
  async list(userId: string, cardId: string): Promise<CardVersionDto[]> {
    return this.dbService.runWithTenant(userId, async (tx) => {
      const card = await this.cards.findById(tx, cardId);
      if (!card) throw new NotFoundException("No encontramos esa publicación.");
      const rows = await this.versions.list(tx, cardId);
      return rows.length > 0 ? rows.map(toVersionDto) : [originalVersion(card)];
    });
  }

  /**
   * Escribe `next` en la card y deja constancia en el historial. Lo usan los
   * tres caminos que cambian el texto (editar, restaurar, la IA); quien llama
   * ya tiene la card bloqueada con lockEditable.
   */
  async write(
    tx: Tx,
    userId: string,
    card: CardRow,
    next: CardContent,
    options: {
      source: Exclude<CardVersionSource, "chat">;
      editSessionId?: string;
      instruction?: string;
      restoredFrom?: number;
    },
  ): Promise<CardContentChangeDto> {
    const current = card.content as CardContent;
    let latest = await this.versions.latest(tx, card.id);
    // Guardar lo mismo que ya hay (un autoguardado sin cambios, restaurar la
    // versión actual) no es una versión nueva. Se compara contra la card y no
    // contra la última versión: generar una imagen guarda su prompt en la card
    // sin pasar por aquí.
    if (sameText(textOf(next), textOf(current))) {
      return {
        card: toDto(card),
        version: latest ? toVersionDto(latest) : originalVersion(card),
      };
    }
    // La original se guarda la primera vez que la card cambia: antes de eso
    // era su contenido, y no hacía falta tenerla dos veces.
    latest ??= await this.versions.insert(tx, {
      userId,
      cardId: card.id,
      n: 1,
      content: textOf(current),
      source: "chat",
      createdAt: card.createdAt,
    });

    const updated = await this.cards.updateContentIfEditable(tx, card.id, next);
    if (!updated) throw new ConflictException(TEXT_NOT_EDITABLE_MESSAGE);

    const sameSession =
      options.source === "manual" &&
      latest.source === "manual" &&
      latest.editSessionId === options.editSessionId &&
      Date.now() - latest.updatedAt.getTime() < CARD_EDIT_SESSION_IDLE_MS;
    const version = sameSession
      ? await this.versions.updateContent(tx, latest.id, textOf(next))
      : await this.versions.insert(tx, {
          userId,
          cardId: card.id,
          n: latest.n + 1,
          content: textOf(next),
          source: options.source,
          instruction: options.instruction ?? null,
          restoredFrom: options.restoredFrom ?? null,
          editSessionId: options.editSessionId ?? null,
        });
    return { card: toDto(updated), version: toVersionDto(version) };
  }

  /** La card, bloqueada, si todavía se puede editar. */
  async lockEditable(tx: Tx, cardId: string): Promise<CardRow> {
    const card = await this.cards.lockById(tx, cardId);
    if (!card) throw new NotFoundException("No encontramos esa publicación.");
    if (card.status !== "draft" && card.status !== "failed") {
      throw new ConflictException(TEXT_NOT_EDITABLE_MESSAGE);
    }
    return card;
  }
}

/** La versión 1 de una card que todavía no tiene historial: su contenido. */
function originalVersion(card: CardRow): CardVersionDto {
  const created = card.createdAt.toISOString();
  return {
    n: 1,
    source: "chat",
    instruction: null,
    restoredFrom: null,
    content: textOf(card.content as CardContent),
    createdAt: created,
    updatedAt: created,
  };
}

function sameText(a: CardVersionContent, b: CardVersionContent): boolean {
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}

function sortKeys(value: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([x], [y]) => x.localeCompare(y)),
  );
}
