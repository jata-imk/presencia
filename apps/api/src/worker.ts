import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { env } from "./env.js";
import { marcarProcesoWorker } from "./jobs/process-role.js";
import { WorkerModule } from "./worker.module.js";

// Entrypoint del worker. No abre puerto: arma el contexto de Nest, pg-boss se
// conecta en su OnModuleInit y el proceso se queda vivo consumiendo la cola.
// En dev normalmente NO se usa — WORKER_INLINE hace que la API lo levante en
// su propio proceso (ver jobs.module.ts).
async function bootstrap() {
  // Antes de armar el contexto: a partir de acá, un fallo de la cola es fatal.
  // Un worker vivo sin jobs registrados es peor que uno que truena — se ve sano
  // y no hace nada.
  marcarProcesoWorker();

  if (env.WORKER_INLINE) {
    console.warn(
      "[worker] WORKER_INLINE está encendido: la API también levanta la cola. " +
        "Correr los dos duplica el consumo de jobs (pg-boss lo tolera, pero no es lo que quieres).",
    );
  }
  const app = await NestFactory.createApplicationContext(WorkerModule);
  // Sin esto, SIGTERM mata el proceso sin pasar por OnModuleDestroy: pg-boss
  // no cerraría su pool ni esperaría al job en vuelo.
  app.enableShutdownHooks();
  console.info("[worker] arriba");
}

void bootstrap();
