import { Module } from "@nestjs/common";
import { DbModule } from "./db/db.module.js";
import { JobsModule } from "./jobs/jobs.module.js";

// El worker (ADR-008: misma imagen, distinto entrypoint). Carga el mismo
// árbol de dependencias que la API pero sin HTTP: ni controllers, ni guard de
// auth, ni Better Auth. Los módulos con jobs se agregan aquí conforme entran.
@Module({
  imports: [DbModule, JobsModule],
})
export class WorkerModule {}
