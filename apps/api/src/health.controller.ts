import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { Public } from "./auth/public.decorator.js";
import { probarBase } from "./db/probe.js";

/**
 * Lo que vigila UptimeRobot desde afuera (F12.8, ADR-031) y el healthcheck
 * del compose desde adentro. Hasta F12.8 contestaba "ok" sin mirar nada: con
 * la base caída la app se reportaba sana. Ahora prueba la base con su propio
 * cliente y techos (`db/probe.ts`); sin base, 503. Sigue siendo público y no
 * dice nada más que "sí" o "no".
 */
@Public()
@Controller("health")
export class HealthController {
  @Get()
  async check() {
    try {
      await probarBase();
    } catch (error) {
      console.error("[health] la base no respondió:", error);
      throw new ServiceUnavailableException({ status: "db_unavailable" });
    }
    return { status: "ok" };
  }
}
