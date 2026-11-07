// Ping a Healthchecks.io (F12.8, ADR-031): el vigilante de afuera. Detecta lo
// que un job no puede detectar de sí mismo — que no corrió. Si el ping deja de
// llegar en el periodo configurado allá, Healthchecks avisa.
//
// Corto y sin lanzar nunca: un Healthchecks lento o caído no puede tumbar ni
// demorar el pase que lo llama. Lo peor que pasa es un aviso de ausencia falso,
// que se ve y se entiende.

const PING_TIMEOUT_MS = 10_000;

/**
 * `fail` usa el endpoint `/fail` del mismo check: el aviso sale de inmediato
 * en vez de esperar a que venza el periodo.
 */
export async function pingHealthcheck(url: string | undefined, fail = false): Promise<void> {
  if (!url) return;
  const destino = fail ? `${url.replace(/\/+$/, "")}/fail` : url;
  try {
    const res = await fetch(destino, {
      method: "POST",
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    });
    if (!res.ok) console.warn(`[ops] Healthchecks respondió ${String(res.status)}`);
  } catch (error) {
    console.warn("[ops] no se pudo hacer ping a Healthchecks:", error);
  }
}
