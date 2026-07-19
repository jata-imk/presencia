import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { db, pool, type Db } from "./client.js";

// Tipo del tx que drizzle entrega dentro de db.transaction().
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

@Injectable()
export class DbService implements OnModuleDestroy {
  readonly db: Db = db;

  /**
   * Toda lectura/escritura de datos de tenant pasa por aquí: abre transacción,
   * fija app.user_id con SET LOCAL (set_config admite bind params) y el RLS
   * hace el resto (ADR-003). La transacción muere con el callback — imposible
   * heredar el tenant de otro request en el pool.
   */
  runWithTenant<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
      return fn(tx);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await pool.end();
  }
}
