// Ping a Healthchecks.io (F12.8, ADR-031): el vigilante de afuera. Detecta lo
// que un job no puede detectar de sí mismo — que no corrió. Si el ping deja de
// llegar en el periodo configurado allá, Healthchecks avisa.
//
// Corto y sin lanzar nunca: un Healthchecks lento o caído no puede tumbar ni
// demorar el pase que lo llama. Lo peor que pasa es un aviso de ausencia falso,
// que se ve y se entiende.

const PING_TIMEOUT_MS = 10_000;

export async function pingHealthcheck(url: string | undefined): Promise<void> {
  if (!url) return;
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    });
    if (!res.ok) console.warn(`[ops] Healthchecks respondió ${String(res.status)}`);
  } catch (error) {
    console.warn("[ops] no se pudo hacer ping a Healthchecks:", error);
  }
}
