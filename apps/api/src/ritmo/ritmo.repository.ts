import { Injectable } from "@nestjs/common";
import { asc, eq, ne, sql } from "drizzle-orm";
import type { SocialNetwork } from "@presencia/shared";
import { cadenceTargets, ritmoNarrations, socialAccounts } from "../db/schema.js";
import type { Tx } from "../db/db.service.js";

// Lo propio de Ritmo que no es cálculo: las metas semanales y las redes
// conectadas. Los números salen del motor de métricas (ADR-022), no de acá.
//
// Las queries no filtran por user_id: el RLS de la transacción es el filtro.

const WRITTEN_AT = sql`clock_timestamp()`;

export type NarracionRow = typeof ritmoNarrations.$inferSelect;

export interface GuardarNarracionInput {
  userId: string;
  /** `YYYY-MM-DD` en la zona del usuario. */
  dia: string;
  body: string;
  payload: unknown;
}

@Injectable()
export class RitmoRepository {
  /**
   * Las metas que el usuario SÍ puso. Las que falten caen a la sugerida.
   *
   * Devolver solo lo elegido —en vez de completar acá con los defaults— es lo
   * que deja distinguir arriba entre un número que el producto propuso y uno
   * que la persona aceptó. Si esta capa los mezclara, la distinción se
   * perdería antes de llegar a la pantalla.
   */
  async metas(tx: Tx): Promise<Map<SocialNetwork, number>> {
    const filas = await tx
      .select({ network: cadenceTargets.network, target: cadenceTargets.target })
      .from(cadenceTargets);
    return new Map(filas.map((fila) => [fila.network, fila.target]));
  }

  async guardarMeta(tx: Tx, userId: string, network: SocialNetwork, target: number): Promise<void> {
    await tx
      .insert(cadenceTargets)
      .values({ userId, network, target })
      .onConflictDoUpdate({
        target: [cadenceTargets.userId, cadenceTargets.network],
        set: { target, updatedAt: WRITTEN_AT },
      });
  }

  /**
   * Las redes con cuenta conectada.
   *
   * De acá salen las pestañas de horarios, y por eso NO es una lista fija: el
   * diseño dibuja instagram/tiktok/facebook/linkedin, pero mostrarle a alguien
   * una pestaña de una red que no conectó es prometerle datos que nunca van a
   * existir.
   *
   * "Conectada" es `status != 'disconnected'`, la MISMA definición que usa
   * Canales, y eso incluye a las que están en `error`. Con un `= 'active'`,
   * una cuenta con el token vencido seguía apareciendo en Canales con su aviso
   * y desaparecía de Ritmo sin explicación: el usuario perdía su meta semanal
   * de esa red mientras el heatmap seguía contando sus publicaciones, así que
   * los conteos por red dejaban de sumar el total.
   *
   * El orden es fijo porque la respuesta pinta pestañas: sin `ORDER BY`,
   * Postgres puede devolverlas en otro orden entre dos requests y las pestañas
   * bailarían al guardar una meta.
   */
  async redesConectadas(tx: Tx): Promise<SocialNetwork[]> {
    const filas = await tx
      .selectDistinct({ network: socialAccounts.network })
      .from(socialAccounts)
      .where(ne(socialAccounts.status, "disconnected"))
      .orderBy(asc(socialAccounts.network));
    return filas.map((fila) => fila.network);
  }

  /** La narración de un día, si ya se generó. */
  async narracionDe(tx: Tx, dia: string): Promise<NarracionRow | null> {
    const [fila] = await tx.select().from(ritmoNarrations).where(eq(ritmoNarrations.day, dia));
    return fila ?? null;
  }

  /**
   * Guarda la narración del día, o no hace nada si ya había una.
   *
   * `onConflictDoNothing` y no `onConflictDoUpdate`: el conflicto significa que
   * otro click ganó la carrera, y sobrescribir su texto dejaría al usuario con
   * una narración distinta de la que ya está leyendo. Devuelve `null` en ese
   * caso, y es lo que le dice al servicio que NO cobre.
   */
  async guardarNarracion(tx: Tx, input: GuardarNarracionInput): Promise<NarracionRow | null> {
    const [fila] = await tx
      .insert(ritmoNarrations)
      .values({
        userId: input.userId,
        day: input.dia,
        body: input.body,
        payload: input.payload,
      })
      .onConflictDoNothing({ target: [ritmoNarrations.userId, ritmoNarrations.day] })
      .returning();
    return fila ?? null;
  }
}
