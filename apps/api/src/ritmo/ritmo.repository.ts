import { Injectable } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import type { SocialNetwork } from "@presencia/shared";
import { cadenceTargets, socialAccounts } from "../db/schema.js";
import type { Tx } from "../db/db.service.js";

// Lo propio de Ritmo que no es cálculo: las metas semanales y las redes
// conectadas. Los números salen del motor de métricas (ADR-022), no de acá.
//
// Las queries no filtran por user_id: el RLS de la transacción es el filtro.

const WRITTEN_AT = sql`clock_timestamp()`;

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
   * Las redes con cuenta conectada y activa.
   *
   * De acá salen las pestañas de horarios, y por eso NO es una lista fija: el
   * diseño dibuja instagram/tiktok/facebook/linkedin, pero mostrarle a alguien
   * una pestaña de una red que no conectó es prometerle datos que nunca van a
   * existir.
   */
  async redesConectadas(tx: Tx): Promise<SocialNetwork[]> {
    const filas = await tx
      .selectDistinct({ network: socialAccounts.network })
      .from(socialAccounts)
      .where(eq(socialAccounts.status, "active"));
    return filas.map((fila) => fila.network);
  }
}
