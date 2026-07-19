import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../env.js";
import * as schema from "./schema.js";

// Cliente plano compartido: lo consume DbService (DI) y la instancia de
// Better Auth (módulo sin DI). Conecta como presencia_app, sujeto a RLS.
export const pool = new pg.Pool({ connectionString: env.APP_DATABASE_URL });

export const db = drizzle(pool, { schema });

export type Db = typeof db;
