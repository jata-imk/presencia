import "reflect-metadata";
import { DbService } from "../src/db/db.service.js";
import { BossService } from "../src/jobs/boss.service.js";
import { OpsAlertSender } from "../src/ops/alert-sender.js";
import { OpsAlertsRepository } from "../src/ops/ops-alerts.repository.js";
import { OpsAlertsService } from "../src/ops/ops-alerts.service.js";
import { OpsJobs } from "../src/ops/ops.jobs.js";
import { OpsScanRepository } from "../src/ops/ops-scan.repository.js";
import { correrSondas, resumenParaLog, sondasDelEntorno } from "../src/ops/provider-probe.js";

// La prueba activa de proveedores a mano (F12.8 PR4, ADR-031): la misma que
// corre `ops.probe` cada día en producción, con las keys y cadenas del .env.
//
//   pnpm --filter @presencia/api sonda:proveedores                  texto, embeddings, transcripción, Brave
//   pnpm --filter @presencia/api sonda:proveedores -- --imagenes    y además las imágenes (lo caro)
//   pnpm --filter @presencia/api sonda:proveedores -- --sin-avisar  solo imprime, sin tocar las alertas
//
// Para probar la cadena de aviso sin romper nada (DoD de F12.8): un modelo
// que no existe en una variable, solo para esta corrida, p. ej.
//   AI_MODEL_CHAT=anthropic:claude-inexistente pnpm --filter @presencia/api sonda:proveedores
// (`--env-file` no pisa lo que ya viene en el entorno).

async function main(): Promise<void> {
  const imagenes = process.argv.includes("--imagenes");

  if (process.argv.includes("--sin-avisar")) {
    const resultados = await correrSondas(sondasDelEntorno(process.env, { imagenes }));
    console.info(resumenParaLog(resultados));
    return;
  }

  const boss = new BossService();
  const db = new DbService();
  try {
    const alerts = new OpsAlertsService(db, new OpsAlertsRepository(), new OpsAlertSender());
    await new OpsJobs(boss, alerts, db, new OpsScanRepository()).probar({ imagenes });
  } finally {
    await db.onModuleDestroy();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
