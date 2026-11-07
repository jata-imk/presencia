import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { Public } from "./auth/public.decorator.js";
import { DbService } from "./db/db.service.js";

// Por debajo de los 5 s del healthcheck del compose: la respuesta tiene que
// llegar antes de que docker dé el intento por perdido, o un Postgres lento se
// leería como una app colgada.
const DB_TIMEOUT_MS = 3_000;

/**
 * Lo que vigila UptimeRobot desde afuera (F12.8, ADR-031) y el healthcheck
 * del compose desde adentro. Hasta F12.8 contestaba "ok" sin mirar nada: con
 * la base caída la app se reportaba sana. Ahora hace un `select 1`; sin base,
 * 503. Sigue siendo público y no dice nada más que "sí" o "no".
 */
@Public()
@Controller("health")
export class HealthController {
  constructor(@Inject(DbService) private readonly db: DbService) {}

  @Get()
  async check() {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.db.db.execute(sql`select 1`),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("timeout")), DB_TIMEOUT_MS);
        }),
      ]);
    } catch (error) {
      console.error("[health] la base no respondió:", error);
      throw new ServiceUnavailableException({ status: "db_unavailable" });
    } finally {
      clearTimeout(timer);
    }
    return { status: "ok" };
  }
}
