import pg from "pg";
import { env } from "../env.js";

// La sonda de `/api/health` (F12.8, ADR-031): ¿contesta la base?
//
// Con un cliente propio y no con el pool de la app, por dos razones:
// - el pool compartido no tiene techo de conexión ni de query, así que una
//   sonda que se cansa de esperar dejaba su `select 1` encolado igual; acá
//   los techos son del driver y de Postgres, y la query se cancela de verdad;
// - con el pool lleno de turnos de chat, la sonda esperaría turno y saldría
//   503 con la base sana: "pool ocupado" no es "base caída".
//
// Una conexión cada 15 s (compose) más una cada 5 min (UptimeRobot) no pesa.

const CONEXION_TIMEOUT_MS = 2_000;
const QUERY_TIMEOUT_MS = 2_000;

/** Lanza si la base no contesta en ~4 s como máximo. */
export async function probarBase(): Promise<void> {
  const client = new pg.Client({
    connectionString: env.APP_DATABASE_URL,
    connectionTimeoutMillis: CONEXION_TIMEOUT_MS,
    statement_timeout: QUERY_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
    application_name: "presencia-health",
  });
  try {
    await client.connect();
    await client.query("select 1");
  } finally {
    await client.end().catch(() => undefined);
  }
}
