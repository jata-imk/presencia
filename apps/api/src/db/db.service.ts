import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { db, pool, type Db } from "./client.js";

// Tipo del tx que drizzle entrega dentro de db.transaction().
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * El "tenant" del modo barrido: el UUID nil, que no puede ser el id de nadie.
 * La policy `worker_scan` lo exige literalmente (migración 0017).
 */
const WORKER_SCAN_TENANT = "00000000-0000-0000-0000-000000000000";

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

  /**
   * Transacción en modo BARRIDO, para los pases cross-tenant del worker (F8).
   * No es un atajo para saltarse el RLS: casi todo sigue siendo ilegible acá.
   * Solo funciona donde hay una policy explícita que lo permita — hoy
   * únicamente `worker_scan` sobre publication_cards, que es solo SELECT y
   * solo de filas `scheduled` (migración 0017).
   *
   * Fija `app.user_id` en el UUID nil en vez de dejarlo sin fijar, y eso NO es
   * cosmético: `tenant_isolation` lee la variable sin `missing_ok`, así que
   * sin fijarla la query truena con `42704 unrecognized configuration
   * parameter` antes de que la policy del worker pueda aplicar (las policies
   * permisivas se combinan con OR, pero Postgres las evalúa todas). Con el nil
   * fijado, `tenant_isolation` evalúa a falso limpiamente.
   *
   * De paso conserva la red de seguridad: una query que se olvide de fijar
   * tenant sigue fallando ruidosamente en vez de devolver cero filas en
   * silencio. El modo barrido hay que pedirlo a propósito.
   *
   * Regla de uso: leer para decidir a QUIÉN hay que atender. Todo lo que
   * escriba vuelve a pasar por runWithTenant con su tenant.
   */
  runWorkerScan<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.user_id', ${WORKER_SCAN_TENANT}, true)`);
      return fn(tx);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await pool.end();
  }
}
