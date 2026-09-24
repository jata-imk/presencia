import { Injectable } from "@nestjs/common";
import { and, asc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { trendItemSchema, type TrendItem } from "@presencia/shared";
import { sessions, trendSources, users, userTrends } from "../db/schema.js";
import type { Tx } from "../db/db.service.js";

// Todo acceso a `user_trends` y `trend_sources` vive aquí.
//
// Las dos tienen RLS, así que las queries NO filtran por `user_id`: el filtro
// es la policy de la transacción. La excepción es el barrido, que corre sin
// tenant y por eso devuelve ids en vez de filas — ver `porRefrescar`.

export interface TendenciasGuardadas {
  items: TrendItem[];
  generatedAt: Date;
  expiresAt: Date;
}

export interface UpsertTendenciasInput {
  userId: string;
  items: TrendItem[];
  generatedAt: Date;
  expiresAt: Date;
  provider: string;
  model: string;
  usage: unknown;
}

const WRITTEN_AT = sql`clock_timestamp()`;

/**
 * Valida los items al leer.
 *
 * `items` es jsonb: el motor no garantiza su forma, así que una fila escrita
 * por una versión vieja del código no puede llegar a medias a la pantalla. Lo
 * que no pase el schema simplemente no está.
 */
function parseItems(raw: unknown): TrendItem[] {
  if (!Array.isArray(raw)) return [];
  const items: TrendItem[] = [];
  for (const candidato of raw) {
    const parsed = trendItemSchema.safeParse(candidato);
    if (parsed.success) items.push(parsed.data);
  }
  return items;
}

@Injectable()
export class TrendsRepository {
  /**
   * La tanda del usuario, vencida o no.
   *
   * Devuelve las vencidas a propósito: la pantalla prefiere mostrar tendencias
   * de la semana pasada —diciendo cuándo se generaron— que un hueco mientras
   * se refresca. Quien llama decide si le sirven, con `expiresAt`.
   */
  async find(tx: Tx): Promise<TendenciasGuardadas | null> {
    const [fila] = await tx.select().from(userTrends);
    if (!fila) return null;
    return {
      items: parseItems(fila.items),
      generatedAt: fila.generatedAt,
      expiresAt: fila.expiresAt,
    };
  }

  /** Reemplaza la tanda del usuario. Una fila por usuario, siempre. */
  async upsert(tx: Tx, input: UpsertTendenciasInput): Promise<void> {
    const { userId, ...resto } = input;
    await tx
      .insert(userTrends)
      .values({ userId, ...resto })
      .onConflictDoUpdate({
        target: userTrends.userId,
        set: { ...resto, updatedAt: WRITTEN_AT },
      });
  }

  /**
   * Mueve el vencimiento sin tocar las tendencias.
   *
   * Es lo que manda al final de la fila a un usuario cuya búsqueda no produjo
   * nada citable: sin esto acapararía todos los pases siguientes, porque el
   * barrido ordena por vencimiento y el suyo seguiría siendo el más viejo.
   */
  async posponer(tx: Tx, hasta: Date): Promise<void> {
    await tx.update(userTrends).set({ expiresAt: hasta, updatedAt: WRITTEN_AT });
  }

  /** Las fuentes propias del usuario, en orden de alta. */
  async fuentes(tx: Tx): Promise<{ id: string; host: string; createdAt: Date }[]> {
    return tx
      .select({
        id: trendSources.id,
        host: trendSources.host,
        createdAt: trendSources.createdAt,
      })
      .from(trendSources)
      .orderBy(asc(trendSources.createdAt));
  }

  /**
   * A quién le toca refresco: sin tanda todavía, o con la suya vencida.
   *
   * Corre SIN tenant (barrido global). `users` y `sessions` no tienen RLS —son
   * de Better Auth— y `user_trends` sí, por eso necesita la policy de worker
   * de la migración 0033, acotada a SELECT y al centinela del barrido.
   *
   * Devuelve ids y no filas a propósito: lo que sigue —leer la voz, las
   * fuentes, escribir la tanda— vuelve a entrar por `runWithTenant`, que es
   * donde el RLS decide.
   *
   * **Filtra por sesión viva, y eso no es cosmético.** Sin ese filtro el
   * negocio paga una búsqueda por semana por cada cuenta que se registró
   * alguna vez y no volvió. Es la misma lección que el ciclo de créditos
   * aprendió en F8 filtrando por correo verificado (addendum ADR-012): un
   * barrido que recorre a todo el mundo acumula costo sobre gente que no
   * abre la app. Quien vuelva entra al pase siguiente.
   *
   * `nulls first`: el que nunca tuvo tanda va antes que el que tiene una
   * vencida. El primero ve un módulo vacío; el segundo, tendencias de la
   * semana pasada con su fecha.
   */
  async porRefrescar(tx: Tx, ahora: Date, limite: number): Promise<string[]> {
    const filas = await tx
      .select({ userId: users.id, expiresAt: userTrends.expiresAt })
      .from(users)
      .innerJoin(sessions, and(eq(sessions.userId, users.id), gt(sessions.expiresAt, ahora)))
      .leftJoin(userTrends, eq(userTrends.userId, users.id))
      .where(
        and(
          eq(users.emailVerified, true),
          or(isNull(userTrends.id), lte(userTrends.expiresAt, ahora)),
        ),
      )
      .groupBy(users.id, userTrends.expiresAt)
      .orderBy(sql`${userTrends.expiresAt} asc nulls first`)
      .limit(limite);
    return filas.map((fila) => fila.userId);
  }
}
