import "reflect-metadata";
import { DbService } from "../src/db/db.service.js";
import { BossService } from "../src/jobs/boss.service.js";
import { OpsAlertSender } from "../src/ops/alert-sender.js";
import { OpsAlertsRepository } from "../src/ops/ops-alerts.repository.js";
import { OpsAlertsService } from "../src/ops/ops-alerts.service.js";
import { OpsJobs } from "../src/ops/ops.jobs.js";

// Un pase de `ops.watch` a mano (F12.8, ADR-031), con el canal del .env.
//
//   pnpm --filter @presencia/api ops:vigilar               un pase, nada más
//   pnpm --filter @presencia/api ops:vigilar -- --fallar   antes, un job que falla
//   pnpm --filter @presencia/api ops:vigilar -- --sanar    antes, uno que sale bien
//
// `--fallar` y `--sanar` usan la cola `ops.simulacro`, que no hace nada más:
// así se prueba la cadena completa (pgboss.job → chequeo → estado → Telegram
// o correo) sin romper un job de verdad. Correr `--fallar` dos veces seguidas
// debe avisar una sola vez; `--sanar` después avisa "Resuelto" (los fallos
// pesan 30 minutos: VENTANA_FALLOS_MIN).

const SIMULACRO = "ops.simulacro";

async function main(): Promise<void> {
  const fallar = process.argv.includes("--fallar");
  const sanar = process.argv.includes("--sanar");

  const boss = new BossService();
  await boss.onModuleInit();
  const db = new DbService();
  try {
    if (fallar || sanar) await simular(boss, fallar);
    const alerts = new OpsAlertsService(db, new OpsAlertsRepository(), new OpsAlertSender());
    await new OpsJobs(boss, alerts).vigilar();
    console.info("[ops:vigilar] pase terminado");
  } finally {
    await boss.onModuleDestroy();
    await db.onModuleDestroy();
  }
}

async function simular(boss: BossService, fallar: boolean): Promise<void> {
  let terminado: () => void = () => undefined;
  const listo = new Promise<void>((resolve) => (terminado = resolve));
  await boss.registerOnDemand<{ fallar: boolean }>({
    queue: SIMULACRO,
    expireInSeconds: 60,
    handler: (data) => {
      // El handler termina antes de que pg-boss escriba el estado; se le da
      // un respiro abajo antes de mirar.
      setTimeout(terminado, 1_000);
      if (data.fallar)
        return Promise.reject(new Error("Simulacro de F12.8: este fallo es a propósito"));
      return Promise.resolve();
    },
  });
  const encolado = await boss.enqueue(
    SIMULACRO,
    { fallar },
    {
      singletonKey: `simulacro-${String(Date.now())}`,
      expireInSeconds: 60,
    },
  );
  if (!encolado) throw new Error("No se pudo encolar el simulacro");
  await listo;
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  console.info(`[ops:vigilar] simulacro ${fallar ? "fallido" : "sano"} listo`);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
