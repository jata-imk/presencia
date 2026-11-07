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

/**
 * `/api/health` es público: sin esto, cualquiera que lo pida en bucle abre
 * una conexión a Postgres por request y puede agotar `max_connections` — la
 * caída que el endpoint existe para detectar. Una sola sonda cada 5 s, y los
 * requests de en medio comparten su resultado.
 */
const CACHE_MS = 5_000;
let ultima: { at: number; resultado: Promise<void> } | undefined;

/** Lanza si la base no contesta en ~4 s como máximo (o si no contestó hace <5 s). */
export function probarBase(): Promise<void> {
  const ahora = Date.now();
  if (ultima && ahora - ultima.at < CACHE_MS) return ultima.resultado;
  const resultado = conectarYProbar();
  // Sin esto, un rechazo cacheado que nadie más espera sería un unhandled.
  resultado.catch(() => undefined);
  ultima = { at: ahora, resultado };
  return resultado;
}

async function conectarYProbar(): Promise<void> {
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
