import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { Tx } from "../db/db.service.js";
import { opsAlerts } from "../db/schema.js";

export type OpsAlertRow = typeof opsAlerts.$inferSelect;

/**
 * El estado de las alertas de operación (0064). Todas las llamadas corren en
 * `DbService.runWorkerScan`: la tabla solo tiene la policy del modo barrido.
 */
@Injectable()
export class OpsAlertsRepository {
  async todas(tx: Tx): Promise<OpsAlertRow[]> {
    return tx.select().from(opsAlerts);
  }

  async prender(
    tx: Tx,
    fila: { key: string; title: string; detail: string; since: Date; lastSentAt: Date | null },
  ): Promise<void> {
    const valores = { ...fila, firing: true, updatedAt: new Date() };
    await tx
      .insert(opsAlerts)
      .values(valores)
      .onConflictDoUpdate({ target: opsAlerts.key, set: valores });
  }

  /** Sigue prendida: refresca el detalle y, si se avisó, cuándo. */
  async actualizar(
    tx: Tx,
    key: string,
    cambios: { title: string; detail: string; lastSentAt?: Date },
  ): Promise<void> {
    await tx
      .update(opsAlerts)
      .set({ ...cambios, updatedAt: new Date() })
      .where(eq(opsAlerts.key, key));
  }

  /** Deshace el "ya se avisó" de un aviso que no salió por ningún canal. */
  async marcarEnvio(tx: Tx, key: string, lastSentAt: Date | null): Promise<void> {
    await tx.update(opsAlerts).set({ lastSentAt }).where(eq(opsAlerts.key, key));
  }

  async apagar(tx: Tx, key: string): Promise<void> {
    await tx
      .update(opsAlerts)
      .set({ firing: false, updatedAt: new Date() })
      .where(eq(opsAlerts.key, key));
  }
}
