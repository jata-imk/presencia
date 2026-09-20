import { Injectable } from "@nestjs/common";
import { and, eq, lte, sql } from "drizzle-orm";
import {
  macroRegionIdSchema,
  trendItemSchema,
  verticalIdSchema,
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

    // Las columnas son `text` para que una vertical retirada no rompa nada al
    // guardarse, pero ACÁ sí importa: lo que salga de esta función se convierte
    // en el nicho del prompt de búsqueda. Sin validar, una fila con
    // `vertical: "spec_9f2a1c33"` —o con el nombre de una vertical que ya se
    // fusionó— haría que el job saliera a buscar tendencias de un nicho
    // inexistente, cada pase, para siempre.
    return filas.flatMap((fila) => {
      const vertical = verticalIdSchema.safeParse(fila.vertical);
      const region = macroRegionIdSchema.safeParse(fila.region);
      if (!vertical.success || !region.success) return [];
      return [{ vertical: vertical.data, marketCountry: fila.marketCountry, region: region.data }];
    });
  }

  /**
   * Corre la fecha de vencimiento sin tocar las tendencias guardadas.
   *
   * Es lo que impide que una tupla improductiva se coma el pase. `porRefrescar`
   * ordena por `expires_at` ascendente, así que una tupla que falla —o que
   * busca bien y no trae nada citable— conserva la fecha más vieja de la tabla
   * y vuelve a salir PRIMERA en cada pase, para siempre. Con ocho así, el
   * presupuesto completo se va en ellas y las tuplas sanas ya vencidas no se
   * refrescan nunca, sin más señal que un warning en el log.
   *
   * Posponer la manda al final de la fila y le devuelve su lugar a las demás.
   * Los `items` no se tocan: el usuario sigue viendo su última tanda buena con
   * su fecha, que es mejor que una pantalla vacía.
   */
  async posponer(tx: Tx, tupla: TuplaDeTendencias, hasta: Date): Promise<void> {
    await tx
      .update(nicheTrends)
      .set({ expiresAt: hasta, updatedAt: WRITTEN_AT })
      .where(
        and(
          eq(nicheTrends.vertical, tupla.vertical),
          eq(nicheTrends.marketCountry, tupla.marketCountry),
          eq(nicheTrends.region, tupla.region),
        ),
      );
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
