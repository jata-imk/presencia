import { Module } from "@nestjs/common";
import { DbModule } from "./db/db.module.js";
import { ScheduledJobsModule } from "./jobs/scheduled-jobs.module.js";

// El worker (ADR-008: misma imagen, distinto entrypoint). Carga el mismo
// árbol de dependencias que la API pero sin HTTP: ni controllers, ni guard de
// auth, ni Better Auth. Los módulos con jobs se agregan aquí conforme entran.
@Module({
  imports: [DbModule, ScheduledJobsModule],
})
export class WorkerModule {}
