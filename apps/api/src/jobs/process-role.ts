// Qué proceso está corriendo. Lo necesita BossService para decidir si un fallo
// de la cola es fatal o tolerable, y `WORKER_INLINE` no sirve para eso: es la
// intención declarada en el .env, no el entrypoint que de verdad arrancó (en
// dev vale `true` aunque corras `dev:worker`).
//
// El worker lo marca antes de armar el contexto de Nest; la API no toca nada.
let esWorker = false;

export function marcarProcesoWorker(): void {
  esWorker = true;
}

/** `true` solo dentro de worker.ts. */
export function enProcesoWorker(): boolean {
  return esWorker;
}
