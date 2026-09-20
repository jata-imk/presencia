import { Injectable } from "@nestjs/common";
import { and, eq, lte, sql } from "drizzle-orm";
import {
  trendItemSchema,
  type MacroRegionId,
  type TrendItem,
  type VerticalId,
} from "@presencia/shared";
import { nicheTrends } from "../db/schema.js";
import type { Tx } from "../db/db.service.js";

// Todo acceso a niche_trends vive aquí (patrón del resto de repositorios).
//
// Con una diferencia que importa: esta tabla NO tiene RLS, así que acá el
// aislamiento por tenant no existe y tampoco hace falta — la fila es la misma
// para todos los usuarios de la tupla (ADR-023). Se puede leer desde dentro de
// un `runWithTenant` sin que ninguna policy la filtre, que es justo lo que
// necesita el camino de lectura del usuario.

export interface TuplaDeTendencias {
  vertical: VerticalId;
  marketCountry: string;
  region: MacroRegionId;
}

export interface TendenciasGuardadas extends TuplaDeTendencias {
  items: TrendItem[];
  generatedAt: Date;
  expiresAt: Date;
}

export interface UpsertTendenciasInput extends TuplaDeTendencias {
  items: TrendItem[];
  generatedAt: Date;
  expiresAt: Date;
  provider: string;
  model: string;
  usage: unknown;
}

const WRITTEN_AT = sql`clock_timestamp()`;

@Injectable()
export class TrendsRepository {
  /**
   * La tanda vigente de una tupla, vencida o no.
   *
   * Devuelve las vencidas a propósito: el camino de lectura prefiere mostrar
   * tendencias de ayer —diciendo cuándo se generaron— que una pantalla vacía
   * mientras se refresca. Quien llama decide si le sirven, con `expiresAt`.
   */
  async find(tx: Tx, tupla: TuplaDeTendencias): Promise<TendenciasGuardadas | null> {
    const [fila] = await tx
      .select()
      .from(nicheTrends)
      .where(
        and(
          eq(nicheTrends.vertical, tupla.vertical),
          eq(nicheTrends.marketCountry, tupla.marketCountry),
          eq(nicheTrends.region, tupla.region),
        ),
      );
    if (!fila) return null;
    return {
      vertical: tupla.vertical,
      marketCountry: tupla.marketCountry,
      region: tupla.region,
      // `items` es jsonb: el motor no garantiza su forma. Se valida al leer
      // para que una fila escrita por una versión vieja del código no llegue
      // a la pantalla a medias — lo que no pase el schema simplemente no está.
      items: parseItems(fila.items),
      generatedAt: fila.generatedAt,
      expiresAt: fila.expiresAt,
    };
  }

  /**
   * Las tuplas que ya vencieron o están por vencer.
   *
   * Barre ESTA tabla y no `brand_voices`, y esa es una decisión de diseño con
   * dos efectos: no hace falta abrirle al worker una lectura cross-tenant de
   * la voz de marca (que es el moat cultural del producto, no una lista de
   * mercados), y solo se refrescan las tuplas que alguien de verdad pidió
   * alguna vez. Una vertical sin usuarios activos no gasta búsquedas.
   */
  async porRefrescar(tx: Tx, hasta: Date, limite: number): Promise<TuplaDeTendencias[]> {
    const filas = await tx
      .select({
        vertical: nicheTrends.vertical,
        marketCountry: nicheTrends.marketCountry,
        region: nicheTrends.region,
      })
      .from(nicheTrends)
      .where(lte(nicheTrends.expiresAt, hasta))
      .orderBy(nicheTrends.expiresAt)
      .limit(limite);
    return filas as TuplaDeTendencias[];
  }

  async upsert(tx: Tx, input: UpsertTendenciasInput): Promise<void> {
    await tx
      .insert(nicheTrends)
      .values({
        vertical: input.vertical,
        marketCountry: input.marketCountry,
        region: input.region,
        items: input.items,
        generatedAt: input.generatedAt,
        expiresAt: input.expiresAt,
        provider: input.provider,
        model: input.model,
        usage: input.usage,
      })
      .onConflictDoUpdate({
        target: [nicheTrends.vertical, nicheTrends.marketCountry, nicheTrends.region],
        set: {
          items: input.items,
          generatedAt: input.generatedAt,
          expiresAt: input.expiresAt,
          provider: input.provider,
          model: input.model,
          usage: input.usage,
          updatedAt: WRITTEN_AT,
        },
      });
  }
}

function parseItems(valor: unknown): TrendItem[] {
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((item) => {
    const parsed = trendItemSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}
